import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  optimizationConfigurations,
  optimizationPresets,
  orders,
  USER_ROLES,
  users,
  vehicles,
  zones,
  zoneVehicles,
} from "@/db/schema";
import {
  assignDriversToRoutes,
  DEFAULT_ASSIGNMENT_CONFIG,
  type DriverAssignmentRequest,
  type DriverAssignmentResult,
  getAssignmentQualityMetrics,
} from "../../routing/driver-assignment";
import {
  updateJobProgress,
} from "../../infra/job-queue";
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
  type VehicleZoneAssignment,
  type ZoneData,
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

  // Fetch configuration
  const config = await db.query.optimizationConfigurations.findFirst({
    where: eq(optimizationConfigurations.id, input.configurationId),
  });

  if (!config) {
    throw new Error("Configuration not found");
  }

  checkAbort();

  // Fetch pending orders for this company
  const pendingOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.companyId, input.companyId),
      eq(orders.status, "PENDING"),
      eq(orders.active, true),
    ),
  });

  checkAbort();

  // Fetch selected vehicles with zone assignments
  const selectedVehicles = await db.query.vehicles.findMany({
    where: and(
      eq(vehicles.companyId, input.companyId),
      inArray(vehicles.id, input.vehicleIds),
      eq(vehicles.active, true),
    ),
    with: {
      vehicleFleets: {
        with: {
          fleet: true,
        },
      },
    },
  });

  // Fetch zone assignments for selected vehicles
  const vehicleZoneAssignments = await db
    .select()
    .from(zoneVehicles)
    .where(
      and(
        eq(zoneVehicles.companyId, input.companyId),
        inArray(
          zoneVehicles.vehicleId,
          selectedVehicles.map((v) => v.id),
        ),
        eq(zoneVehicles.active, true),
      ),
    );

  // Group zone assignments by vehicle
  const zoneAssignmentsByVehicle = new Map<string, VehicleZoneAssignment[]>();
  for (const assignment of vehicleZoneAssignments) {
    const existing = zoneAssignmentsByVehicle.get(assignment.vehicleId) || [];
    existing.push({
      zoneId: assignment.zoneId,
      vehicleId: assignment.vehicleId,
      assignedDays: assignment.assignedDays,
      active: assignment.active,
    });
    zoneAssignmentsByVehicle.set(assignment.vehicleId, existing);
  }

  checkAbort();

  // Fetch active zones for this company
  const activeZones = await db
    .select()
    .from(zones)
    .where(and(eq(zones.companyId, input.companyId), eq(zones.active, true)));

  // Convert to ZoneData format
  const zonesData: ZoneData[] = activeZones.map((z) => ({
    id: z.id,
    name: z.name,
    geometry: z.geometry,
    activeDays: z.activeDays,
    active: z.active,
    type: z.type || undefined,
    color: z.color || undefined,
  }));

  checkAbort();

  // Fetch selected drivers (users with role CONDUCTOR)
  const selectedDrivers = await db.query.users.findMany({
    where: and(
      eq(users.companyId, input.companyId),
      inArray(users.id, input.driverIds),
      eq(users.active, true),
      eq(users.role, USER_ROLES.CONDUCTOR),
    ),
  });

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

  // Load the optimization preset bound to this configuration. The config's
  // `optimizationPresetId` wins — this is what the user picked for this run.
  // NULL falls back to the company's default preset, which keeps legacy
  // configs working. If there's no default either, the runner uses sensible
  // system defaults (the `??` fallbacks in vroomConfig below).
  const preset = config.optimizationPresetId
    ? await db.query.optimizationPresets.findFirst({
        where: and(
          eq(optimizationPresets.id, config.optimizationPresetId),
          eq(optimizationPresets.companyId, input.companyId),
          eq(optimizationPresets.active, true),
        ),
      }) ?? null
    : await db.query.optimizationPresets.findFirst({
        where: and(
          eq(optimizationPresets.companyId, input.companyId),
          eq(optimizationPresets.isDefault, true),
          eq(optimizationPresets.active, true),
        ),
      });

  // Get groupSameLocation setting from preset
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

  // Create zone batches if zones are configured. Routes are built without a
  // driver during the solve loop — driver matching runs as a separate stage
  // and produces AssignedSolvedRoute[].
  const hasZones = zonesData.length > 0;
  const rawRoutes: RawSolvedRoute[] = [];
  const optimizationWarnings: string[] = [];
  const unassignedOrders: UnassignedOrderRecord[] = [];

  // Helper: parse a string|number lat/lng into a number, undefined on bad input.
  const numCoord = (v: string | number | null | undefined): number | undefined => {
    if (v === null || v === undefined) return undefined;
    const n = typeof v === "string" ? parseFloat(v) : v;
    return Number.isFinite(n) ? n : undefined;
  };

  // Add orders with invalid coordinates to unassigned
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

  // Track vehicles that have been assigned routes (for oneRoutePerVehicle)
  const oneRoutePerVehicle = preset?.oneRoutePerVehicle ?? true;
  const vehiclesWithRoutes = new Set<string>();

  if (hasZones) {
    // Zone-aware optimization: run optimization per zone batch
    const { batches: zoneBatches, warnings: zoneWarnings, unroutable } = createZoneBatches(
      ordersWithLocation,
      vehiclesWithZones,
      zonesData,
      dayOfWeek,
    );
    optimizationWarnings.push(...zoneWarnings);

    // Fix G7: orders whose zone has no eligible vehicles must be surfaced as
    // unassigned with a clear reason. Without this they silently disappear.
    for (const { order, reason } of unroutable) {
      unassignedOrders.push({
        orderId: order.id,
        trackingId: order.trackingId,
        reason,
        latitude: orderDetailsMap.get(order.id)?.latitude,
        longitude: orderDetailsMap.get(order.id)?.longitude,
        address: orderDetailsMap.get(order.id)?.address,
      });
    }

    // IMPORTANT: Sort batches to process "unzoned" (Sin Zona) FIRST
    // This ensures unrestricted vehicles serve orders that ONLY they can handle
    // before being used for zone orders (which may have zone-specific vehicles)
    zoneBatches.sort((a, b) => {
      if (a.zoneId === "unzoned") return -1;
      if (b.zoneId === "unzoned") return 1;
      return 0;
    });

    const progressPerBatch =
      zoneBatches.length > 0 ? 50 / zoneBatches.length : 50;
    let currentProgress = 20;

    for (const batch of zoneBatches) {
      checkAbort();

      // Filter out vehicles that already have routes if oneRoutePerVehicle is enabled
      const availableVehicles = oneRoutePerVehicle
        ? batch.vehicles.filter((v) => !vehiclesWithRoutes.has(v.id))
        : batch.vehicles;

      if (availableVehicles.length === 0) {
        // No vehicles available for this zone - mark all orders as unassigned
        const reason =
          oneRoutePerVehicle && batch.vehicles.length > 0
            ? `Vehículos de zona ${batch.zoneName} ya tienen rutas asignadas (1 ruta por vehículo habilitado)`
            : `No hay vehículos disponibles para la zona ${batch.zoneName} el día ${dayOfWeek}`;

        for (const order of batch.orders) {
          const details = orderDetailsMap.get(order.id);
          unassignedOrders.push({
            orderId: order.id,
            trackingId: order.trackingId,
            reason,
            latitude: details?.latitude,
            longitude: details?.longitude,
            address: details?.address,
          });
        }
        continue;
      }

      // Apply grouping if enabled
      let ordersToProcess = batch.orders;
      if (groupSameLocation) {
        const { groupedOrders, groupMap } = groupOrdersByLocation(batch.orders);
        // Store in global map for later ungrouping
        for (const [key, value] of groupMap) {
          globalGroupMap.set(key, value);
        }
        ordersToProcess = groupedOrders;
      }

      // Convert batch orders to VROOM format
      const batchOrdersForVroom: OrderForOptimization[] = ordersToProcess.map(
        (order) => {
          const typedOrder = order as typeof ordersWithLocation[number];
          // Use direct time window fields first, fallback to promisedDate
          const timeWindowStart = typedOrder.timeWindowStart
            ? String(typedOrder.timeWindowStart)
            : order.promisedDate
              ? new Date(order.promisedDate).toTimeString().slice(0, 5)
              : undefined;
          const timeWindowEnd = typedOrder.timeWindowEnd
            ? String(typedOrder.timeWindowEnd)
            : order.promisedDate
              ? new Date(
                  new Date(order.promisedDate).getTime() + 2 * 60 * 60 * 1000,
                )
                  .toTimeString()
                  .slice(0, 5)
              : undefined;

          const skillsRequired = parseRequiredSkills(typedOrder.requiredSkills);
          return {
            id: order.id,
            trackingId: order.trackingId,
            address: order.address,
            latitude: parseFloat(String(order.latitude)),
            longitude: parseFloat(String(order.longitude)),
            weightRequired: order.weightRequired,
            volumeRequired: order.volumeRequired,
            orderValue: typedOrder.orderValue ?? 0,
            unitsRequired: typedOrder.unitsRequired ?? 1,
            orderType: typedOrder.orderType,
            priority: typedOrder.priority,
            timeWindowStart,
            timeWindowEnd,
            serviceTime: order.serviceTime,
            skillsRequired: skillsRequired.length > 0 ? skillsRequired : undefined,
            zoneId: batch.zoneId === "unzoned" ? undefined : batch.zoneId,
          };
        },
      );

      // Convert batch vehicles to VROOM format (using filtered available vehicles)
      const batchVehiclesForVroom: VehicleForOptimization[] =
        availableVehicles.map((vehicle) => ({
          id: vehicle.id,
          plate: vehicle.plate,
          maxWeight: vehicle.weightCapacity ?? 10000,
          maxVolume: vehicle.volumeCapacity ?? 100,
          maxValueCapacity: vehicle.maxValueCapacity ?? undefined,
          maxUnitsCapacity: vehicle.maxUnitsCapacity ?? undefined,
          maxOrders: vehicle.maxOrders ?? 30,
          originLatitude: vehicle.originLatitude
            ? parseFloat(vehicle.originLatitude)
            : undefined,
          originLongitude: vehicle.originLongitude
            ? parseFloat(vehicle.originLongitude)
            : undefined,
          skills: vehicleSkillsMap.get(vehicle.id),
          timeWindowStart: vehicle.workdayStart ?? undefined,
          timeWindowEnd: vehicle.workdayEnd ?? undefined,
          hasBreakTime: vehicle.hasBreakTime,
          breakDuration: vehicle.breakDuration ?? undefined,
          breakTimeStart: vehicle.breakTimeStart ?? undefined,
          breakTimeEnd: vehicle.breakTimeEnd ?? undefined,
        }));

      // Run optimization for this batch (VROOM — sole supported engine).
      const batchResult = await vroomOptimizeRoutes(
        batchOrdersForVroom,
        batchVehiclesForVroom,
        vroomConfig,
      );

      // Add batch unassigned orders (expand grouped orders)
      for (const unassigned of batchResult.unassigned) {
        const grouped = globalGroupMap.get(unassigned.orderId);
        if (grouped && grouped.orderIds.length > 1) {
          // Expand grouped order into individual unassigned
          for (let i = 0; i < grouped.orderIds.length; i++) {
            const details = orderDetailsMap.get(grouped.orderIds[i]);
            unassignedOrders.push({
              orderId: grouped.orderIds[i],
              trackingId: grouped.trackingIds[i],
              reason: `${unassigned.reason} (Zona: ${batch.zoneName})`,
              latitude: details?.latitude,
              longitude: details?.longitude,
              address: details?.address,
            });
          }
        } else {
          const details = orderDetailsMap.get(unassigned.orderId);
          unassignedOrders.push({
            ...unassigned,
            reason: `${unassigned.reason} (Zona: ${batch.zoneName})`,
            latitude: details?.latitude,
            longitude: details?.longitude,
            address: details?.address,
          });
        }
      }

      // Convert batch routes to canonical RawSolvedRoute shape.
      for (const vroomRoute of batchResult.routes) {
        const vehicle = selectedVehicles.find(
          (v) => v.id === vroomRoute.vehicleId,
        );
        if (!vehicle) continue;

        const routeStops: SolvedStop[] = [];
        let sequenceCounter = 1;
        for (const stop of vroomRoute.stops) {
          const grouped = globalGroupMap.get(stop.orderId);
          if (grouped && grouped.orderIds.length > 1) {
            if (groupSameLocation) {
              routeStops.push({
                orderId: grouped.orderIds[0],
                trackingId: grouped.trackingIds[0],
                sequence: sequenceCounter++,
                address: stop.address,
                latitude: stop.latitude,
                longitude: stop.longitude,
                estimatedArrival: stop.arrivalTime
                  ? formatArrivalTime(stop.arrivalTime)
                  : undefined,
                waitingTimeSeconds: stop.arrivalTime
                  ? calculateWaitingSeconds(stop.arrivalTime, grouped.orderIds[0])
                  : undefined,
                timeWindow: buildTimeWindow(grouped.orderIds[0]),
                groupedOrderIds: grouped.orderIds,
                groupedTrackingIds: grouped.trackingIds,
              });
            } else {
              for (let i = 0; i < grouped.orderIds.length; i++) {
                routeStops.push({
                  orderId: grouped.orderIds[i],
                  trackingId: grouped.trackingIds[i],
                  sequence: sequenceCounter++,
                  address: stop.address,
                  latitude: stop.latitude,
                  longitude: stop.longitude,
                  estimatedArrival: stop.arrivalTime
                    ? formatArrivalTime(stop.arrivalTime)
                    : undefined,
                  waitingTimeSeconds: stop.arrivalTime
                    ? calculateWaitingSeconds(stop.arrivalTime, grouped.orderIds[i])
                    : undefined,
                  timeWindow: buildTimeWindow(grouped.orderIds[i]),
                });
              }
            }
          } else {
            routeStops.push({
              orderId: stop.orderId,
              trackingId: stop.trackingId,
              sequence: sequenceCounter++,
              address: stop.address,
              latitude: stop.latitude,
              longitude: stop.longitude,
              estimatedArrival: stop.arrivalTime
                ? formatArrivalTime(stop.arrivalTime)
                : undefined,
              waitingTimeSeconds: stop.arrivalTime
                ? calculateWaitingSeconds(stop.arrivalTime, stop.orderId)
                : undefined,
              timeWindow: buildTimeWindow(stop.orderId),
            });
          }
        }

        const newRoute: RawSolvedRoute = {
          routeId: `route-${vehicle.id}-${batch.zoneId}-${Date.now()}`,
          vehicleId: vehicle.id,
          vehicleIdentifier: vehicle.plate || vehicle.name || vehicle.id,
          // Only real zones carry an id — the "unzoned" bucket is a synthetic
          // placeholder and shouldn't end up as a FK value on route_stops.
          zoneId: batch.zoneId === "unzoned" ? undefined : batch.zoneId,
          stops: routeStops,
          totalDistance: vroomRoute.totalDistance,
          totalDuration: vroomRoute.totalDuration,
          totalServiceTime: vroomRoute.totalServiceTime,
          totalTravelTime: vroomRoute.totalTravelTime,
          capacityUsed: {
            WEIGHT: vroomRoute.totalWeight,
            VOLUME: vroomRoute.totalVolume,
          },
          utilizationPercentage: Math.round(
            Math.max(
              (vroomRoute.totalWeight / (vehicle.weightCapacity || 1)) * 100,
              (vroomRoute.totalVolume / (vehicle.volumeCapacity || 1)) * 100,
            ) || 0,
          ),
          timeWindowViolations: 0,
          geometry: vroomRoute.geometry,
        };

        rawRoutes.push(newRoute);
        partialRawRoutes = [...rawRoutes];

        if (oneRoutePerVehicle) {
          vehiclesWithRoutes.add(vehicle.id);
        }
      }

      currentProgress += progressPerBatch;
      await updateJobProgress(jobId || input.configurationId, currentProgress);
    }
  } else {
    // No zones configured - run single optimization for all orders

    // Apply grouping if enabled
    let ordersToProcess = ordersWithLocation;
    if (groupSameLocation) {
      const { groupedOrders, groupMap } =
        groupOrdersByLocation(ordersWithLocation);
      // Store in global map for later ungrouping
      for (const [key, value] of groupMap) {
        globalGroupMap.set(key, value);
      }
      ordersToProcess = groupedOrders;
    }

    const ordersForVroom: OrderForOptimization[] = ordersToProcess.map(
      (order) => {
        // Use direct time window fields first, fallback to promisedDate
        const timeWindowStart = order.timeWindowStart
          ? String(order.timeWindowStart)
          : order.promisedDate
            ? new Date(order.promisedDate).toTimeString().slice(0, 5)
            : undefined;
        const timeWindowEnd = order.timeWindowEnd
          ? String(order.timeWindowEnd)
          : order.promisedDate
            ? new Date(
                new Date(order.promisedDate).getTime() + 2 * 60 * 60 * 1000,
              )
                .toTimeString()
                .slice(0, 5)
            : undefined;

        const skillsRequired = parseRequiredSkills(order.requiredSkills);
        return {
          id: order.id,
          trackingId: order.trackingId,
          address: order.address,
          latitude: parseFloat(String(order.latitude)),
          longitude: parseFloat(String(order.longitude)),
          weightRequired: order.weightRequired,
          volumeRequired: order.volumeRequired,
          orderValue: order.orderValue,
          unitsRequired: order.unitsRequired,
          orderType: order.orderType,
          priority: order.priority,
          timeWindowStart,
          timeWindowEnd,
          serviceTime: order.serviceTime,
          skillsRequired: skillsRequired.length > 0 ? skillsRequired : undefined,
        };
      },
    );

    const vehiclesForVroom: VehicleForOptimization[] = vehiclesWithZones.map(
      (vehicle) => ({
        id: vehicle.id,
        plate: vehicle.plate,
        maxWeight: vehicle.weightCapacity ?? 10000,
        maxVolume: vehicle.volumeCapacity ?? 100,
        maxValueCapacity: vehicle.maxValueCapacity ?? undefined,
        maxUnitsCapacity: vehicle.maxUnitsCapacity ?? undefined,
        maxOrders: vehicle.maxOrders ?? 30,
        originLatitude: vehicle.originLatitude
          ? parseFloat(vehicle.originLatitude)
          : undefined,
        originLongitude: vehicle.originLongitude
          ? parseFloat(vehicle.originLongitude)
          : undefined,
        skills: vehicleSkillsMap.get(vehicle.id),
        timeWindowStart: vehicle.workdayStart ?? undefined,
        timeWindowEnd: vehicle.workdayEnd ?? undefined,
        hasBreakTime: vehicle.hasBreakTime,
        breakDuration: vehicle.breakDuration ?? undefined,
        breakTimeStart: vehicle.breakTimeStart ?? undefined,
        breakTimeEnd: vehicle.breakTimeEnd ?? undefined,
      }),
    );

    await updateJobProgress(jobId || input.configurationId, 30);
    checkAbort();

    // Run optimization (VROOM — sole supported engine).
    const vroomResult = await vroomOptimizeRoutes(
      ordersForVroom,
      vehiclesForVroom,
      vroomConfig,
    );

    // Add unassigned orders (expand grouped orders)
    for (const unassigned of vroomResult.unassigned) {
      const grouped = globalGroupMap.get(unassigned.orderId);
      if (grouped && grouped.orderIds.length > 1) {
        // Expand grouped order into individual unassigned
        for (let i = 0; i < grouped.orderIds.length; i++) {
          const details = orderDetailsMap.get(grouped.orderIds[i]);
          unassignedOrders.push({
            orderId: grouped.orderIds[i],
            trackingId: grouped.trackingIds[i],
            reason: unassigned.reason,
            latitude: details?.latitude,
            longitude: details?.longitude,
            address: details?.address,
          });
        }
      } else {
        const details = orderDetailsMap.get(unassigned.orderId);
        unassignedOrders.push({
          ...unassigned,
          latitude: details?.latitude,
          longitude: details?.longitude,
          address: details?.address,
        });
      }
    }

    // Convert routes to canonical RawSolvedRoute shape.
    for (const vroomRoute of vroomResult.routes) {
      const vehicle = selectedVehicles.find(
        (v) => v.id === vroomRoute.vehicleId,
      );
      if (!vehicle) continue;

      const routeStops: SolvedStop[] = [];
      let sequenceCounter = 1;
      for (const stop of vroomRoute.stops) {
        const grouped = globalGroupMap.get(stop.orderId);
        if (grouped && grouped.orderIds.length > 1) {
          if (groupSameLocation) {
            routeStops.push({
              orderId: grouped.orderIds[0],
              trackingId: grouped.trackingIds[0],
              sequence: sequenceCounter++,
              address: stop.address,
              latitude: stop.latitude,
              longitude: stop.longitude,
              estimatedArrival: stop.arrivalTime
                ? formatArrivalTime(stop.arrivalTime)
                : undefined,
              waitingTimeSeconds: stop.arrivalTime
                ? calculateWaitingSeconds(stop.arrivalTime, grouped.orderIds[0])
                : undefined,
              timeWindow: buildTimeWindow(grouped.orderIds[0]),
              groupedOrderIds: grouped.orderIds,
              groupedTrackingIds: grouped.trackingIds,
            });
          } else {
            for (let i = 0; i < grouped.orderIds.length; i++) {
              routeStops.push({
                orderId: grouped.orderIds[i],
                trackingId: grouped.trackingIds[i],
                sequence: sequenceCounter++,
                address: stop.address,
                latitude: stop.latitude,
                longitude: stop.longitude,
                estimatedArrival: stop.arrivalTime
                  ? formatArrivalTime(stop.arrivalTime)
                  : undefined,
                waitingTimeSeconds: stop.arrivalTime
                  ? calculateWaitingSeconds(stop.arrivalTime, grouped.orderIds[i])
                  : undefined,
                timeWindow: buildTimeWindow(grouped.orderIds[i]),
              });
            }
          }
        } else {
          routeStops.push({
            orderId: stop.orderId,
            trackingId: stop.trackingId,
            sequence: sequenceCounter++,
            address: stop.address,
            latitude: stop.latitude,
            longitude: stop.longitude,
            estimatedArrival: stop.arrivalTime
              ? formatArrivalTime(stop.arrivalTime)
              : undefined,
            waitingTimeSeconds: stop.arrivalTime
              ? calculateWaitingSeconds(stop.arrivalTime, stop.orderId)
              : undefined,
            timeWindow: buildTimeWindow(stop.orderId),
          });
        }
      }

      const newRoute: RawSolvedRoute = {
        routeId: `route-${vehicle.id}-${Date.now()}`,
        vehicleId: vehicle.id,
        vehicleIdentifier: vehicle.plate || vehicle.name || vehicle.id,
        stops: routeStops,
        totalDistance: vroomRoute.totalDistance,
        totalDuration: vroomRoute.totalDuration,
        totalServiceTime: vroomRoute.totalServiceTime,
        totalTravelTime: vroomRoute.totalTravelTime,
        capacityUsed: {
          WEIGHT: vroomRoute.totalWeight,
          VOLUME: vroomRoute.totalVolume,
        },
        utilizationPercentage: Math.round(
          Math.max(
            (vroomRoute.totalWeight / (vehicle.weightCapacity || 1)) * 100,
            (vroomRoute.totalVolume / (vehicle.volumeCapacity || 1)) * 100,
          ) || 0,
        ),
        timeWindowViolations: 0,
        geometry: vroomRoute.geometry,
      };

      rawRoutes.push(newRoute);
      partialRawRoutes = [...rawRoutes];
    }
  }

  await updateJobProgress(jobId || input.configurationId, 70);
  checkAbort();

  // Build driver assignment requests from routes
  // IMPORTANT: Respect pre-assigned drivers from vehicles
  const routeAssignments: DriverAssignmentRequest[] = [];
  const assignedDrivers = new Map<string, string>();

  // Create a map of vehicleId -> assignedDriverId for quick lookup
  const vehicleDriverMap = new Map<string, string>();
  for (const vehicle of selectedVehicles) {
    if (vehicle.assignedDriverId) {
      vehicleDriverMap.set(vehicle.id, vehicle.assignedDriverId);
    }
  }

  // Create a map of driverId -> driver details for direct assignment
  const driverDetailsMap = new Map(selectedDrivers.map((d) => [d.id, d]));

  // Create a set of selected driver IDs for validation
  const selectedDriverIds = new Set(selectedDrivers.map((d) => d.id));

  // Track which vehicles have pre-assigned drivers (to skip scoring for them)
  const vehiclesWithPreAssignedDrivers = new Set<string>();

  for (const rawRoute of rawRoutes) {
    const preAssignedDriverId = vehicleDriverMap.get(rawRoute.vehicleId);

    if (preAssignedDriverId && selectedDriverIds.has(preAssignedDriverId)) {
      vehiclesWithPreAssignedDrivers.add(rawRoute.vehicleId);
    } else {
      routeAssignments.push({
        companyId: input.companyId,
        vehicleId: rawRoute.vehicleId,
        routeStops: rawRoute.stops.map((s) => ({
          orderId: s.orderId,
          promisedDate: undefined,
        })),
        candidateDriverIds: selectedDrivers.map((d) => d.id),
        assignedDrivers,
      });
    }
  }

  // Perform intelligent driver assignment ONLY for vehicles without pre-assigned drivers
  checkAbort();
  const strategy = config?.objective === "TIME" ? "AVAILABILITY" : "BALANCED";
  const driverAssignments =
    routeAssignments.length > 0
      ? await assignDriversToRoutes(routeAssignments, {
          ...DEFAULT_ASSIGNMENT_CONFIG,
          strategy,
        })
      : new Map<string, DriverAssignmentResult>();

  // Promote each RawSolvedRoute to AssignedSolvedRoute by matching a driver.
  // Routes that fail to match a driver are dropped from the final plan and
  // their orders surface as unassigned (the verifier flags this case).
  const routes: AssignedSolvedRoute[] = [];
  for (const rawRoute of rawRoutes) {
    const preAssignedDriverId = vehicleDriverMap.get(rawRoute.vehicleId);
    let driverId: string | undefined;
    let driverName: string | undefined;
    let assignmentQuality:
      | { score: number; warnings: string[]; errors: string[] }
      | undefined;

    if (
      preAssignedDriverId &&
      vehiclesWithPreAssignedDrivers.has(rawRoute.vehicleId)
    ) {
      const driver = driverDetailsMap.get(preAssignedDriverId);
      if (driver) {
        driverId = driver.id;
        driverName = driver.name;
        assignmentQuality = { score: 100, warnings: [], errors: [] };
      }
    } else {
      const assignment = driverAssignments.get(rawRoute.vehicleId);
      if (assignment) {
        driverId = assignment.driverId;
        driverName = assignment.driverName;
        assignmentQuality = {
          score: assignment.score.score,
          warnings: assignment.score.warnings,
          errors: assignment.score.errors,
        };
      }
    }

    if (!driverId || !driverName || !assignmentQuality) {
      // No driver could be matched — surface every order as unassigned so
      // the operator can manually intervene. A route without a driver is
      // never persisted.
      for (const stop of rawRoute.stops) {
        unassignedOrders.push({
          orderId: stop.orderId,
          trackingId: stop.trackingId,
          reason: `No se pudo asignar conductor al vehículo ${rawRoute.vehicleIdentifier}`,
          latitude: stop.latitude,
          longitude: stop.longitude,
          address: stop.address,
        });
      }
      continue;
    }

    const vehicleWithZone = vehiclesWithZones.find(
      (v) => v.id === rawRoute.vehicleId,
    );
    const driverOrigin =
      vehicleWithZone?.originLatitude && vehicleWithZone?.originLongitude
        ? {
            latitude: parseFloat(vehicleWithZone.originLatitude),
            longitude: parseFloat(vehicleWithZone.originLongitude),
            address: undefined,
          }
        : undefined;

    routes.push({
      ...rawRoute,
      driverId,
      driverName,
      driverOrigin,
      assignmentQuality,
    });
  }

  await updateJobProgress(jobId || input.configurationId, 90);
  checkAbort();

  await sleep(300);

  // Calculate aggregate metrics
  const totalDistance = routes.reduce((sum, r) => sum + r.totalDistance, 0);
  const totalDuration = routes.reduce((sum, r) => sum + r.totalDuration, 0);
  const totalStops = routes.reduce((sum, r) => sum + r.stops.length, 0);
  const timeWindowViolations = routes.reduce(
    (sum, r) => sum + r.timeWindowViolations,
    0,
  );

  const utilizationRate =
    routes.length > 0
      ? routes.reduce((sum, r) => sum + r.utilizationPercentage, 0) /
        routes.length
      : 0;

  const timeWindowComplianceRate =
    totalStops > 0
      ? ((totalStops - timeWindowViolations) / totalStops) * 100
      : 100;

  // Calculate assignment quality metrics. AssignedSolvedRoute guarantees
  // driverId/driverName/assignmentQuality are present, so no filter needed.
  const assignmentResults: DriverAssignmentResult[] = routes.map((r) => ({
    driverId: r.driverId,
    driverName: r.driverName,
    score: {
      driverId: r.driverId,
      score: r.assignmentQuality.score,
      factors: {
        skillsMatch: 100, // Placeholder - not tracked per route
        availability: 100,
        licenseValid: 100,
        fleetMatch: 100,
        workload: 100,
      },
      warnings: r.assignmentQuality.warnings,
      errors: r.assignmentQuality.errors,
    },
    isManualOverride: false,
  }));

  const assignmentMetrics =
    await getAssignmentQualityMetrics(assignmentResults);

  // Calculate drivers without routes
  const assignedDriverIds = new Set(routes.map((r) => r.driverId));
  const driversWithoutRoutes = selectedDrivers
    .filter((d) => !assignedDriverIds.has(d.id))
    .map((d) => {
      const vehicleOrigin = driverVehicleOriginMap.get(d.id);
      return {
        id: d.id,
        name: d.name,
        originLatitude: vehicleOrigin?.latitude
          ? parseFloat(vehicleOrigin.latitude)
          : undefined,
        originLongitude: vehicleOrigin?.longitude
          ? parseFloat(vehicleOrigin.longitude)
          : undefined,
      };
    });

  // Calculate vehicles without routes
  const assignedVehicleIds = new Set(routes.map((r) => r.vehicleId));
  const vehiclesWithoutRoutes = vehiclesWithZones
    .filter((v) => !assignedVehicleIds.has(v.id))
    .map((v) => ({
      id: v.id,
      plate: v.plate,
      originLatitude: v.originLatitude
        ? parseFloat(v.originLatitude)
        : undefined,
      originLongitude: v.originLongitude
        ? parseFloat(v.originLongitude)
        : undefined,
    }));

  const aggregated: AggregatedPlan = {
    routes,
    unassignedOrders,
    driversWithoutRoutes,
    vehiclesWithoutRoutes,
    metrics: {
      totalDistance,
      totalDuration,
      totalRoutes: routes.length,
      totalStops,
      utilizationRate: Math.round(utilizationRate),
      timeWindowComplianceRate: Math.round(timeWindowComplianceRate),
    },
    assignmentMetrics,
    warnings:
      optimizationWarnings.length > 0 ? optimizationWarnings : undefined,
    summary: {
      optimizedAt: new Date().toISOString(),
      objective: config.objective as "DISTANCE" | "TIME" | "BALANCED",
      processingTimeMs: Date.now() - startTime,
      engineUsed,
    },
    depot: {
      latitude: parseFloat(config.depotLatitude),
      longitude: parseFloat(config.depotLongitude),
    },
  };

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
