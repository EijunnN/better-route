import { updateJobProgress } from "../../infra/job-queue";
import {
  type DepotConfig,
  type OrderForOptimization,
  type VehicleForOptimization,
  type OptimizationConfig as VroomOptConfig,
  optimizeRoutes as vroomOptimizeRoutes,
} from "../vroom-optimizer";
import {
  createZoneBatches,
  getDayOfWeek,
  type DayOfWeek,
} from "../../geo/zone-utils";
import { resolveProfileSchema } from "@/lib/orders/profile-schema";
import type { OptimizationInput } from "./types";
import type {
  AggregatedPlan,
  AssignedSolvedRoute,
  RawSolvedRoute,
  SolvedStop,
  UnassignedOrderRecord,
  VerifiedPlan,
} from "../solved-plan";
import { verifyPlan } from "../verifier";
import { groupOrdersByLocation, type OrderGroupMap } from "./prepare";
import { formatArrivalTime, parseHHmmToSeconds } from "./postprocess";
import { sleep } from "./utils";
import { loadVehicleSkillsMap, parseRequiredSkills } from "./load-skills";
import {
  loadTimeWindowPresetsMap,
  resolveTimeWindow,
} from "./load-time-windows";
import { loadInputs } from "./stages/load-inputs";
import { aggregatePlan } from "./stages/aggregate-plan";
import { assignDrivers } from "./stages/assign-drivers";
import { solveBatches } from "./stages/solve-batches";

/**
 * Run optimization with mock algorithm (placeholder for actual VRP solver)
 * In production, this would integrate with OR-Tools, Vroom, or similar
 */
export async function runOptimization(
  input: OptimizationInput,
  signal?: AbortSignal,
  jobId?: string,
): Promise<VerifiedPlan> {
  const startTime = Date.now();

  // Track partial results for cancellation. The partial snapshot uses raw
  // routes (pre-driver-assignment) — these are surfaced to the operator if
  // they cancel mid-run so they can see what work was done. The partial
  // plan is never confirmed.
  let partialRawRoutes: RawSolvedRoute[] = [];
  const partialUnassignedOrders: UnassignedOrderRecord[] = [];

  // Check for abort signal
  const checkAbort = () => {
    if (signal?.aborted) {
      const totalDistance = partialRawRoutes.reduce(
        (sum, r) => sum + r.totalDistance,
        0,
      );
      const totalDuration = partialRawRoutes.reduce(
        (sum, r) => sum + r.totalDuration,
        0,
      );
      const totalStops = partialRawRoutes.reduce(
        (sum, r) => sum + r.stops.length,
        0,
      );
      const utilizationRate =
        partialRawRoutes.length > 0
          ? partialRawRoutes.reduce(
              (sum, r) => sum + r.utilizationPercentage,
              0,
            ) / partialRawRoutes.length
          : 0;

      // Snapshot raw routes as if they had a placeholder driver. The plan is
      // marked `isPartial: true` and is never confirmed — the type satisfies
      // AggregatedPlan even though no real driver matching ran.
      const partialPlan: AggregatedPlan = {
        routes: partialRawRoutes.map((r) => ({
          ...r,
          driverId: "",
          driverName: "",
          assignmentQuality: { score: 0, warnings: [], errors: [] },
        })),
        unassignedOrders: partialUnassignedOrders,
        driversWithoutRoutes: [],
        vehiclesWithoutRoutes: [],
        metrics: {
          totalDistance,
          totalDuration,
          totalRoutes: partialRawRoutes.length,
          totalStops,
          utilizationRate: Math.round(utilizationRate),
          timeWindowComplianceRate: 100,
        },
        assignmentMetrics: {
          totalAssignments: 0,
          assignmentsWithWarnings: 0,
          assignmentsWithErrors: 0,
          averageScore: 0,
          skillCoverage: 0,
          licenseCompliance: 0,
          fleetAlignment: 0,
          workloadBalance: 0,
        },
        summary: {
          optimizedAt: new Date().toISOString(),
          objective: "DISTANCE",
          processingTimeMs: Date.now() - startTime,
        },
        depot: { latitude: 0, longitude: 0 },
        isPartial: true,
      };
      // The cancelled path keeps `verification` undefined; cancelJob treats
      // partials as informational only and never persists them as confirmed.
      globalThis.__partialOptimizationResult = partialPlan;
      throw new Error("Optimization cancelled by user");
    }
  };

  checkAbort();

  // Stage 1 — Load every piece of state from the DB in one shot.
  const loaded = await loadInputs(input);
  const {
    config,
    pendingOrders,
    selectedVehicles,
    selectedDrivers,
    zonesData,
    zoneAssignmentsByVehicle,
    preset,
  } = loaded;

  checkAbort();

  // === Optimization with Zone Support ===
  await updateJobProgress(jobId || input.configurationId, 10);
  checkAbort();

  // Determine day of week for zone filtering
  // Use current date - zones are filtered by day of week
  const optimizationDate = new Date();
  const dayOfWeek: DayOfWeek = getDayOfWeek(optimizationDate);

  // Get service time from config (in minutes), convert to seconds
  // Default to 10 minutes (600 seconds) if not set
  const serviceTimeMinutes = config.serviceTimeMinutes ?? 10;
  const serviceTimeSeconds = serviceTimeMinutes * 60;

  // Load time window presets once per run. The form in the web UI saves a
  // `timeWindowPresetId` without copying the preset's start/end onto the
  // order — the runner has to resolve the effective window here, otherwise
  // VROOM sees no time window and assigns the stop at any hour of the day.
  const timeWindowPresetsMap = await loadTimeWindowPresetsMap(input.companyId);

  // Prepare orders with location info - filter out orders with missing coordinates
  const ordersWithInvalidCoords: typeof pendingOrders = [];
  const ordersWithLocation = pendingOrders
    .filter((order) => {
      const lat = parseFloat(String(order.latitude));
      const lng = parseFloat(String(order.longitude));
      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
        ordersWithInvalidCoords.push(order);
        return false;
      }
      return true;
    })
    .map((order) => {
      const resolvedTw = resolveTimeWindow(order, timeWindowPresetsMap);
      return {
        id: order.id,
        trackingId: order.trackingId,
        address: order.address,
        latitude: order.latitude,
        longitude: order.longitude,
        weightRequired: order.weightRequired || 0,
        volumeRequired: order.volumeRequired || 0,
        orderValue: order.orderValue || 0,
        unitsRequired: order.unitsRequired || 1, // Default 1 unit per order
        orderType: order.orderType as "NEW" | "RESCHEDULED" | "URGENT" | undefined,
        priority: order.priority ?? undefined,
        promisedDate: order.promisedDate,
        serviceTime: serviceTimeSeconds,
        // Effective time window — already resolved via preset if the order
        // only had `timeWindowPresetId`. "HH:mm" strings or undefined.
        timeWindowStart: resolvedTw.start ?? undefined,
        timeWindowEnd: resolvedTw.end ?? undefined,
        // CSV of skill codes (e.g. "REFRIGERADO, FRAGIL"). Parsed per-vehicle
        // below; VROOM needs them as an array of strings.
        requiredSkills: order.requiredSkills ?? null,
      };
    });

  // Orders with invalid coordinates are added to unassigned list below

  // Create lookup map for order details (used when populating unassigned orders and time windows).
  // Coordinates are normalized to numbers here so downstream consumers (canonical
  // SolvedRoute / unassigned records) don't redo string parsing.
  const orderDetailsMap = new Map(
    ordersWithLocation.map((o) => {
      const latNum = parseFloat(String(o.latitude));
      const lngNum = parseFloat(String(o.longitude));
      return [
        o.id,
        {
          latitude: Number.isFinite(latNum) ? latNum : undefined,
          longitude: Number.isFinite(lngNum) ? lngNum : undefined,
          address: o.address,
          timeWindowStart: o.timeWindowStart,
          timeWindowEnd: o.timeWindowEnd,
        },
      ];
    }),
  );

  // Helper: build timeWindow object from order's HH:mm strings
  function buildTimeWindow(orderId: string): { start: string; end: string } | undefined {
    const details = orderDetailsMap.get(orderId);
    if (!details?.timeWindowStart || !details?.timeWindowEnd) return undefined;
    return {
      start: String(details.timeWindowStart),
      end: String(details.timeWindowEnd),
    };
  }

  // Helper: calculate waiting time in seconds if vehicle arrives before time window.
  // Returns undefined when no waiting is needed (vehicle is on time or late).
  function calculateWaitingSeconds(
    arrivalSeconds: number,
    orderId: string,
  ): number | undefined {
    const details = orderDetailsMap.get(orderId);
    if (!details?.timeWindowStart) return undefined;
    const twStart = parseHHmmToSeconds(String(details.timeWindowStart));
    if (twStart === null || arrivalSeconds >= twStart) return undefined;
    return twStart - arrivalSeconds;
  }

  // === Engine ===
  // VROOM is the only supported engine after the PyVRP removal.
  const engineUsed = "VROOM";

  // Prepare vehicles with zone assignments
  const vehiclesWithZones = selectedVehicles.map((vehicle) => ({
    id: vehicle.id,
    plate: vehicle.plate || vehicle.name || vehicle.id,
    name: vehicle.name,
    weightCapacity: vehicle.weightCapacity,
    volumeCapacity: vehicle.volumeCapacity,
    maxValueCapacity: vehicle.maxValueCapacity,
    maxUnitsCapacity: vehicle.maxUnitsCapacity,
    maxOrders: vehicle.maxOrders ?? 30,
    originLatitude: vehicle.originLatitude,
    originLongitude: vehicle.originLongitude,
    workdayStart: vehicle.workdayStart,
    workdayEnd: vehicle.workdayEnd,
    hasBreakTime: vehicle.hasBreakTime,
    breakDuration: vehicle.breakDuration,
    breakTimeStart: vehicle.breakTimeStart,
    breakTimeEnd: vehicle.breakTimeEnd,
    zoneAssignments: zoneAssignmentsByVehicle.get(vehicle.id) || [],
  }));

  // Load vehicle skills once for both the zone-aware and no-zones paths. VROOM
  // needs this to respect `skillsRequired` on orders — without it the solver
  // assigns freely and violations only surface in the verifier post-hoc.
  const vehicleSkillsMap = await loadVehicleSkillsMap(
    vehiclesWithZones.map((v) => v.id),
  );

  // Create map of driverId -> vehicle origin (for drivers without routes display)
  const driverVehicleOriginMap = new Map<
    string,
    { latitude: string; longitude: string }
  >();
  for (const vehicle of selectedVehicles) {
    if (
      vehicle.assignedDriverId &&
      vehicle.originLatitude &&
      vehicle.originLongitude
    ) {
      driverVehicleOriginMap.set(vehicle.assignedDriverId, {
        latitude: vehicle.originLatitude,
        longitude: vehicle.originLongitude,
      });
    }
  }

  // Depot config — use the user's configured work window
  const depotConfig: DepotConfig = {
    latitude: parseFloat(config.depotLatitude),
    longitude: parseFloat(config.depotLongitude),
    timeWindowStart: config.workWindowStart || "06:00",
    timeWindowEnd: config.workWindowEnd || "22:00",
  };

  const depotLat = parseFloat(config.depotLatitude);
  const depotLng = parseFloat(config.depotLongitude);
  const hasValidDepot = !isNaN(depotLat) && !isNaN(depotLng) && depotLat !== 0 && depotLng !== 0;

  // Validate vehicles have origin coordinates (use depot as fallback)
  for (const vehicle of selectedVehicles) {
    if (vehicle.originLatitude == null || vehicle.originLongitude == null) {
      if (hasValidDepot) {
        vehicle.originLatitude = String(depotLat);
        vehicle.originLongitude = String(depotLng);
      } else {
        throw new Error(
          `El vehículo "${vehicle.name || vehicle.plate || vehicle.id}" no tiene coordenadas de origen y no hay depósito configurado.`,
        );
      }
    }
  }

  // Get groupSameLocation setting from preset (preset comes from loadInputs).
  const groupSameLocation = preset?.groupSameLocation ?? true;

  // Global map to track grouped orders for ungrouping later
  const globalGroupMap: OrderGroupMap = new Map();

  // Load company optimization profile for dynamic capacity mapping
  // Resolve the unified ProfileSchema for this company (capacity dimensions,
  // priority mapping, custom field defs, TW presets — one round trip).
  const companyProfile = await resolveProfileSchema(input.companyId);

  // Optimization config with preset values
  const vroomConfig: VroomOptConfig = {
    depot: depotConfig,
    objective:
      (config?.objective as "DISTANCE" | "TIME" | "BALANCED") || "BALANCED",
    // Company-specific optimization profile for capacity mapping
    profile: companyProfile,
    // Apply preset settings if available (sensible defaults when no preset)
    balanceVisits: preset?.balanceVisits ?? false,
    maxDistanceKm: preset?.maxDistanceKm ?? undefined, // undefined = no limit
    maxTravelTimeMinutes: undefined, // reserved for future use
    trafficFactor: preset?.trafficFactor ?? 1.0,
    // Route end configuration
    routeEndMode:
      (preset?.routeEndMode as
        | "DRIVER_ORIGIN"
        | "SPECIFIC_DEPOT"
        | "OPEN_END") ?? "DRIVER_ORIGIN",
    endDepot:
      preset?.endDepotLatitude && preset?.endDepotLongitude
        ? {
            latitude: parseFloat(preset.endDepotLatitude),
            longitude: parseFloat(preset.endDepotLongitude),
            address: preset.endDepotAddress ?? undefined,
          }
        : undefined,
    // Additional optimization options
    openStart: preset?.openStart ?? false,
    minimizeVehicles: preset?.minimizeVehicles ?? false,
    flexibleTimeWindows: preset?.flexibleTimeWindows ?? false,
  };

  await updateJobProgress(jobId || input.configurationId, 20);
  checkAbort();

  // Helper: parse a string|number lat/lng into a number, undefined on bad input.
  const numCoord = (v: string | number | null | undefined): number | undefined => {
    if (v === null || v === undefined) return undefined;
    const n = typeof v === "string" ? parseFloat(v) : v;
    return Number.isFinite(n) ? n : undefined;
  };

  // Orders that failed coordinate validation are surfaced as unassigned up
  // front — the solver never sees them.
  const unassignedOrders: UnassignedOrderRecord[] = [];
  for (const order of ordersWithInvalidCoords) {
    unassignedOrders.push({
      orderId: order.id,
      trackingId: order.trackingId,
      reason: "Coordenadas faltantes o inválidas",
      latitude: numCoord(order.latitude),
      longitude: numCoord(order.longitude),
      address: order.address,
    });
  }

  const oneRoutePerVehicle = preset?.oneRoutePerVehicle ?? true;

  // Stage 3 — Solve: zone-aware (or single-batch) VROOM orchestration. The
  // stage produces canonical RawSolvedRoute[]; routes don't have a driver
  // until stage 4. The onRouteAdded callback keeps `partialRawRoutes` in
  // sync so a cancellation mid-solve still surfaces what was computed.
  const solveResult = await solveBatches({
    ordersWithLocation,
    selectedVehicles,
    vehiclesWithZones,
    vehicleSkillsMap,
    zonesData,
    dayOfWeek,
    vroomConfig,
    groupSameLocation,
    oneRoutePerVehicle,
    orderDetailsMap,
    buildTimeWindow,
    calculateWaitingSeconds,
    onRouteAdded: (allRoutes) => {
      partialRawRoutes = [...allRoutes];
    },
    onBatchProgress: async (progress) => {
      await updateJobProgress(jobId || input.configurationId, progress);
    },
    checkAbort,
  });
  const rawRoutes = solveResult.rawRoutes;
  unassignedOrders.push(...solveResult.unassignedOrders);
  const optimizationWarnings = solveResult.warnings;

  await updateJobProgress(jobId || input.configurationId, 70);
  checkAbort();

  // Stage 4 — Match each RawSolvedRoute to a driver. Routes whose vehicle
  // has a pre-assigned driver get that driver directly; the rest go through
  // the scored assignment. Routes that can't be matched have their stops
  // surfaced as extra unassigned orders.
  const { routes, extraUnassigned } = await assignDrivers({
    rawRoutes,
    selectedDrivers,
    selectedVehicles,
    companyId: input.companyId,
    objective: config?.objective,
  });
  unassignedOrders.push(...extraUnassigned);

  await updateJobProgress(jobId || input.configurationId, 90);
  checkAbort();

  await sleep(300);

  // Stage 5 — Aggregate the assigned routes into the plan-level shape the
  // verifier consumes (metrics, drivers/vehicles without routes, summary).
  const aggregated = await aggregatePlan({
    routes,
    unassignedOrders,
    selectedDrivers,
    driverVehicleOriginMap,
    vehiclesForFallback: vehiclesWithZones,
    warnings: optimizationWarnings,
    startTime,
    engineUsed,
    objective: config.objective as "DISTANCE" | "TIME" | "BALANCED",
    depot: {
      latitude: parseFloat(config.depotLatitude),
      longitude: parseFloat(config.depotLongitude),
    },
  });

  // Run the verifier — pure transformation that produces a VerifiedPlan with
  // the same data plus a mandatory verification report.
  const verified = verifyPlan({
    plan: aggregated,
    orders: ordersWithLocation.map((o) => ({
      id: o.id,
      trackingId: o.trackingId,
      address: o.address,
      latitude: o.latitude,
      longitude: o.longitude,
      weightRequired: o.weightRequired,
      volumeRequired: o.volumeRequired,
      orderValue: o.orderValue,
      unitsRequired: o.unitsRequired,
      orderType: o.orderType ?? null,
      priority: o.priority ?? null,
      timeWindowStart: o.timeWindowStart ?? null,
      timeWindowEnd: o.timeWindowEnd ?? null,
      serviceTime: o.serviceTime,
    })),
    vehicles: selectedVehicles.map((v) => ({
      id: v.id,
      plate: v.plate ?? v.name,
      maxWeight: v.weightCapacity,
      maxVolume: v.volumeCapacity,
      maxValueCapacity: v.maxValueCapacity,
      maxUnitsCapacity: v.maxUnitsCapacity,
      maxOrders: v.maxOrders,
      originLatitude: v.originLatitude,
      originLongitude: v.originLongitude,
      skills: [],
      workdayStart: v.workdayStart ?? null,
      workdayEnd: v.workdayEnd ?? null,
      hasBreakTime: v.hasBreakTime,
      breakDuration: v.breakDuration,
      breakTimeStart: v.breakTimeStart,
      breakTimeEnd: v.breakTimeEnd,
    })),
    config: {
      depot: {
        latitude: parseFloat(config.depotLatitude),
        longitude: parseFloat(config.depotLongitude),
        timeWindowStart: vroomConfig.depot.timeWindowStart ?? null,
        timeWindowEnd: vroomConfig.depot.timeWindowEnd ?? null,
      },
      objective: vroomConfig.objective,
      maxDistanceKm: vroomConfig.maxDistanceKm ?? null,
      maxTravelTimeMinutes: vroomConfig.maxTravelTimeMinutes ?? null,
    },
  });

  await updateJobProgress(jobId || input.configurationId, 100);
  checkAbort();

  return verified;
}
