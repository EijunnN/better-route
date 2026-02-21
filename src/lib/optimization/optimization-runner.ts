import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  companyOptimizationProfiles,
  optimizationConfigurations,
  optimizationJobs,
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
} from "../routing/driver-assignment";
import {
  acquireCompanyLock,
  calculateInputHash,
  cancelJob,
  canStartJob,
  completeJob,
  failJob,
  getCachedResult,
  isJobAborting,
  markCompanyLockCompleted,
  registerJob,
  releaseCompanyLock,
  setJobTimeout,
  updateJobProgress,
} from "../infra/job-queue";
import {
  type DepotConfig,
  type OrderForOptimization,
  type VehicleForOptimization,
  type OptimizationConfig as VroomOptConfig,
  optimizeRoutes as vroomOptimizeRoutes,
} from "./vroom-optimizer";
import {
  createZoneBatches,
  getDayOfWeek,
  type DayOfWeek,
  type VehicleZoneAssignment,
  type ZoneData,
} from "../geo/zone-utils";
import { parseProfile } from "./capacity-mapper";

// Type for grouped orders (multiple orders at same location)
interface GroupedOrder {
  // Representative order (first one in the group)
  id: string;
  trackingId: string;
  address: string;
  latitude: string | number;
  longitude: string | number;
  weightRequired: number;
  volumeRequired: number;
  promisedDate: Date | null;
  serviceTime: number;
  // All orders in this group (including the representative)
  groupedOrderIds: string[];
  groupedTrackingIds: string[];
}

// Map to track grouped orders for ungrouping later
type OrderGroupMap = Map<string, { orderIds: string[]; trackingIds: string[] }>;

/**
 * Group orders that share the same coordinates
 * Returns grouped orders and a map to ungroup later
 */
function groupOrdersByLocation<
  T extends {
    id: string;
    trackingId: string;
    latitude: string | number;
    longitude: string | number;
  },
>(
  orders: T[],
): {
  groupedOrders: (T & {
    groupedOrderIds: string[];
    groupedTrackingIds: string[];
  })[];
  groupMap: OrderGroupMap;
} {
  const locationMap = new Map<string, T[]>();

  // Group by coordinates (rounded to 6 decimal places for precision)
  for (const order of orders) {
    const lat = parseFloat(String(order.latitude)).toFixed(6);
    const lng = parseFloat(String(order.longitude)).toFixed(6);
    const key = `${lat},${lng}`;

    const existing = locationMap.get(key) || [];
    existing.push(order);
    locationMap.set(key, existing);
  }

  const groupedOrders: (T & {
    groupedOrderIds: string[];
    groupedTrackingIds: string[];
  })[] = [];
  const groupMap: OrderGroupMap = new Map();

  for (const [, ordersAtLocation] of locationMap) {
    // Use first order as representative
    const representative = ordersAtLocation[0];
    const orderIds = ordersAtLocation.map((o) => o.id);
    const trackingIds = ordersAtLocation.map((o) => o.trackingId);

    groupedOrders.push({
      ...representative,
      groupedOrderIds: orderIds,
      groupedTrackingIds: trackingIds,
    });

    // Store mapping for ungrouping
    groupMap.set(representative.id, { orderIds, trackingIds });
  }

  return { groupedOrders, groupMap };
}

// Optimization result types
export interface OptimizationStop {
  orderId: string;
  trackingId: string;
  sequence: number;
  address: string;
  latitude: string;
  longitude: string;
  estimatedArrival?: string;
  timeWindow?: {
    start: string;
    end: string;
  };
  // For grouped stops (multiple orders at same location)
  groupedOrderIds?: string[];
  groupedTrackingIds?: string[];
}

export interface OptimizationRoute {
  routeId: string;
  vehicleId: string;
  vehiclePlate: string;
  driverId?: string;
  driverName?: string;
  driverOrigin?: {
    latitude: string;
    longitude: string;
    address?: string;
  };
  stops: OptimizationStop[];
  totalDistance: number;
  totalDuration: number; // Total time (travel + service + waiting)
  totalServiceTime: number; // Time spent at stops (service)
  totalTravelTime: number; // Time spent traveling between stops
  totalWeight: number;
  totalVolume: number;
  utilizationPercentage: number;
  timeWindowViolations: number;
  geometry?: string; // Encoded polyline from VROOM/OSRM
  assignmentQuality?: {
    score: number;
    warnings: string[];
    errors: string[];
  };
}

export interface OptimizationResult {
  routes: OptimizationRoute[];
  unassignedOrders: Array<{
    orderId: string;
    trackingId: string;
    reason: string;
    latitude?: string;
    longitude?: string;
    address?: string;
  }>;
  driversWithoutRoutes?: Array<{
    id: string;
    name: string;
    originLatitude?: string;
    originLongitude?: string;
  }>;
  vehiclesWithoutRoutes?: Array<{
    id: string;
    plate: string;
    originLatitude?: string;
    originLongitude?: string;
  }>;
  metrics: {
    totalDistance: number;
    totalDuration: number;
    totalRoutes: number;
    totalStops: number;
    utilizationRate: number;
    timeWindowComplianceRate: number;
  };
  assignmentMetrics?: {
    totalAssignments: number;
    assignmentsWithWarnings: number;
    assignmentsWithErrors: number;
    averageScore: number;
    skillCoverage: number;
    licenseCompliance: number;
    fleetAlignment: number;
    workloadBalance: number;
  };
  warnings?: string[];
  summary: {
    optimizedAt: string;
    objective: string;
    processingTimeMs: number;
  };
  depot?: {
    latitude: number;
    longitude: number;
  };
}

export interface OptimizationInput {
  configurationId: string;
  companyId: string;
  vehicleIds: string[];
  driverIds: string[];
}

// Global state for partial optimization results during cancellation
declare global {
  // eslint-disable-next-line no-var
  var __partialOptimizationResult: OptimizationResult | undefined;
}

/**
 * Run optimization with mock algorithm (placeholder for actual VRP solver)
 * In production, this would integrate with OR-Tools, Vroom, or similar
 */
export async function runOptimization(
  input: OptimizationInput,
  signal?: AbortSignal,
  jobId?: string,
): Promise<OptimizationResult> {
  const startTime = Date.now();

  // Track partial results for cancellation
  let partialRoutes: OptimizationRoute[] = [];
  const partialUnassignedOrders: Array<{
    orderId: string;
    trackingId: string;
    reason: string;
    latitude?: string;
    longitude?: string;
    address?: string;
  }> = [];

  // Check for abort signal
  const checkAbort = () => {
    if (signal?.aborted) {
      // Create partial results object
      const partialResult: OptimizationResult & { isPartial?: boolean } = {
        routes: partialRoutes,
        unassignedOrders: partialUnassignedOrders,
        metrics: {
          totalDistance: partialRoutes.reduce(
            (sum, r) => sum + r.totalDistance,
            0,
          ),
          totalDuration: partialRoutes.reduce(
            (sum, r) => sum + r.totalDuration,
            0,
          ),
          totalRoutes: partialRoutes.length,
          totalStops: partialRoutes.reduce((sum, r) => sum + r.stops.length, 0),
          utilizationRate:
            partialRoutes.length > 0
              ? partialRoutes.reduce(
                  (sum, r) => sum + r.utilizationPercentage,
                  0,
                ) / partialRoutes.length
              : 0,
          timeWindowComplianceRate: 100,
        },
        summary: {
          optimizedAt: new Date().toISOString(),
          objective: "DISTANCE",
          processingTimeMs: Date.now() - startTime,
        },
        isPartial: true,
      };
      // Store partial result globally for access during cancellation
      globalThis.__partialOptimizationResult = partialResult;
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

  // === VROOM Optimization with Zone Support ===
  // Uses VROOM for VRP solving when available, falls back to nearest-neighbor
  await updateJobProgress(jobId || input.configurationId, 10);
  checkAbort();

  // Determine day of week for zone filtering
  // Use current date - zones are filtered by day of week
  const optimizationDate = new Date();
  const dayOfWeek: DayOfWeek = getDayOfWeek(optimizationDate);

  // Get service time from config (in minutes), convert to seconds
  // Default to 10 minutes (600 seconds) if not set
  const serviceTimeMinutes = config.serviceTimeMinutes ?? 10;
  if (config.serviceTimeMinutes == null) {
    console.warn(`[Optimization] Service time not configured, using default: ${serviceTimeMinutes} minutes`);
  }
  const serviceTimeSeconds = serviceTimeMinutes * 60;
  console.log(
    `[Optimization] Service time configured: ${serviceTimeMinutes} minutes (${serviceTimeSeconds} seconds)`,
  );

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
    .map((order) => ({
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
      // Time windows from CSV import (format: "HH:mm" string or null)
      timeWindowStart: order.timeWindowStart ?? undefined,
      timeWindowEnd: order.timeWindowEnd ?? undefined,
    }));

  // Log warning for orders with invalid coordinates
  if (ordersWithInvalidCoords.length > 0) {
    console.warn(
      `[Optimization] ${ordersWithInvalidCoords.length} orders excluded due to missing/invalid coordinates: ${ordersWithInvalidCoords.map((o) => o.trackingId).join(", ")}`,
    );
  }

  // Create lookup map for order details (used when populating unassigned orders)
  const orderDetailsMap = new Map(
    ordersWithLocation.map((o) => [
      o.id,
      { latitude: o.latitude, longitude: o.longitude, address: o.address },
    ]),
  );

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
    zoneAssignments: zoneAssignmentsByVehicle.get(vehicle.id) || [],
  }));

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

  // Depot config
  const depotConfig: DepotConfig = {
    latitude: parseFloat(config.depotLatitude),
    longitude: parseFloat(config.depotLongitude),
    timeWindowStart: "06:00",
    timeWindowEnd: "22:00",
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
        console.warn(
          `[Optimization] Vehicle "${vehicle.name || vehicle.plate || vehicle.id}" has no origin coordinates. Using depot as fallback.`,
        );
      } else {
        throw new Error(
          `El vehículo "${vehicle.name || vehicle.plate || vehicle.id}" no tiene coordenadas de origen y no hay depósito configurado.`,
        );
      }
    }
  }

  // Load optimization preset (default for company)
  const preset = await db.query.optimizationPresets.findFirst({
    where: and(
      eq(optimizationPresets.companyId, input.companyId),
      eq(optimizationPresets.isDefault, true),
      eq(optimizationPresets.active, true),
    ),
  });

  if (!preset) {
    console.warn(
      `[Optimization] No default optimization preset found for company ${input.companyId}. Using system defaults.`,
    );
  }

  // Get groupSameLocation setting from preset
  const groupSameLocation = preset?.groupSameLocation ?? true;

  // Global map to track grouped orders for ungrouping later
  const globalGroupMap: OrderGroupMap = new Map();

  // Load company optimization profile for dynamic capacity mapping
  const [companyProfileRow] = await db
    .select()
    .from(companyOptimizationProfiles)
    .where(
      and(
        eq(companyOptimizationProfiles.companyId, input.companyId),
        eq(companyOptimizationProfiles.active, true),
      ),
    )
    .limit(1);

  const companyProfile = parseProfile(companyProfileRow ?? null);
  console.log(
    `[Optimization] Company profile loaded: enableOrderValue=${companyProfile.enableOrderValue}, activeDimensions=${companyProfile.activeDimensions.join(",")}`,
  );

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
    maxTravelTimeMinutes: preset?.vehicleRechargeTime ?? undefined, // undefined = no limit
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

  // Create zone batches if zones are configured
  const hasZones = zonesData.length > 0;
  const routes: OptimizationRoute[] = [];
  const optimizationWarnings: string[] = [];
  const unassignedOrders: Array<{
    orderId: string;
    trackingId: string;
    reason: string;
    latitude?: string;
    longitude?: string;
    address?: string;
  }> = [];

  // Add orders with invalid coordinates to unassigned
  for (const order of ordersWithInvalidCoords) {
    unassignedOrders.push({
      orderId: order.id,
      trackingId: order.trackingId,
      reason: "Coordenadas faltantes o inválidas",
      latitude: order.latitude ?? undefined,
      longitude: order.longitude ?? undefined,
      address: order.address,
    });
  }

  // Track vehicles that have been assigned routes (for oneRoutePerVehicle)
  const oneRoutePerVehicle = preset?.oneRoutePerVehicle ?? true;
  const vehiclesWithRoutes = new Set<string>();

  if (hasZones) {
    // Zone-aware optimization: run optimization per zone batch
    const { batches: zoneBatches, warnings: zoneWarnings } = createZoneBatches(
      ordersWithLocation,
      vehiclesWithZones,
      zonesData,
      dayOfWeek,
    );
    optimizationWarnings.push(...zoneWarnings);

    // IMPORTANT: Sort batches to process "unzoned" (Sin Zona) FIRST
    // This ensures unrestricted vehicles serve orders that ONLY they can handle
    // before being used for zone orders (which may have zone-specific vehicles)
    zoneBatches.sort((a, b) => {
      if (a.zoneId === "unzoned") return -1;
      if (b.zoneId === "unzoned") return 1;
      return 0;
    });

    console.log(
      `Zone batches created: ${zoneBatches.length} batches for ${ordersWithLocation.length} orders`,
    );
    console.log(
      `Batch order: ${zoneBatches.map((b) => `${b.zoneName}(${b.orders.length} orders, ${b.vehicles.length} vehicles)`).join(" → ")}`,
    );

    const progressPerBatch =
      zoneBatches.length > 0 ? 50 / zoneBatches.length : 50;
    let currentProgress = 20;

    for (const batch of zoneBatches) {
      checkAbort();

      // Filter out vehicles that already have routes if oneRoutePerVehicle is enabled
      const availableVehicles = oneRoutePerVehicle
        ? batch.vehicles.filter((v) => !vehiclesWithRoutes.has(v.id))
        : batch.vehicles;

      console.log(
        `Processing zone batch: ${batch.zoneName} (${batch.orders.length} orders, ${availableVehicles.length}/${batch.vehicles.length} vehicles available)`,
      );

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
        console.log(
          `Grouped ${batch.orders.length} orders into ${groupedOrders.length} unique locations for zone ${batch.zoneName}`,
        );
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
        }));

      // Run VROOM optimization for this batch
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

      // Convert batch routes to our format
      for (const vroomRoute of batchResult.routes) {
        const vehicle = selectedVehicles.find(
          (v) => v.id === vroomRoute.vehicleId,
        );
        if (!vehicle) continue;

        // Process stops - keep grouped or expand based on groupSameLocation setting
        const routeStops: OptimizationStop[] = [];
        let sequenceCounter = 1;
        for (const stop of vroomRoute.stops) {
          const grouped = globalGroupMap.get(stop.orderId);
          if (grouped && grouped.orderIds.length > 1) {
            if (groupSameLocation) {
              // Keep as single stop with grouped order info
              const orderCount = grouped.orderIds.length;
              routeStops.push({
                orderId: grouped.orderIds[0], // Use first order as representative
                trackingId: grouped.trackingIds[0], // Use first tracking ID
                sequence: sequenceCounter++,
                address: stop.address,
                latitude: String(stop.latitude),
                longitude: String(stop.longitude),
                estimatedArrival: stop.arrivalTime
                  ? new Date(stop.arrivalTime * 1000).toISOString()
                  : undefined,
                groupedOrderIds: grouped.orderIds,
                groupedTrackingIds: grouped.trackingIds,
              });
            } else {
              // Expand grouped order into individual stops at same location
              for (let i = 0; i < grouped.orderIds.length; i++) {
                routeStops.push({
                  orderId: grouped.orderIds[i],
                  trackingId: grouped.trackingIds[i],
                  sequence: sequenceCounter++,
                  address: stop.address,
                  latitude: String(stop.latitude),
                  longitude: String(stop.longitude),
                  estimatedArrival: stop.arrivalTime
                    ? new Date(stop.arrivalTime * 1000).toISOString()
                    : undefined,
                });
              }
            }
          } else {
            routeStops.push({
              orderId: stop.orderId,
              trackingId: stop.trackingId,
              sequence: sequenceCounter++,
              address: stop.address,
              latitude: String(stop.latitude),
              longitude: String(stop.longitude),
              estimatedArrival: stop.arrivalTime
                ? new Date(stop.arrivalTime * 1000).toISOString()
                : undefined,
            });
          }
        }

        const newRoute: OptimizationRoute = {
          routeId: `route-${vehicle.id}-${batch.zoneId}-${Date.now()}`,
          vehicleId: vehicle.id,
          vehiclePlate: vehicle.plate || vehicle.name || vehicle.id,
          stops: routeStops,
          totalDistance: vroomRoute.totalDistance,
          totalDuration: vroomRoute.totalDuration,
          totalServiceTime: vroomRoute.totalServiceTime,
          totalTravelTime: vroomRoute.totalTravelTime,
          totalWeight: vroomRoute.totalWeight,
          totalVolume: vroomRoute.totalVolume,
          utilizationPercentage: Math.round(
            Math.max(
              (vroomRoute.totalWeight / (vehicle.weightCapacity || 1)) * 100,
              (vroomRoute.totalVolume / (vehicle.volumeCapacity || 1)) * 100,
            ) || 0,
          ),
          timeWindowViolations: 0,
          geometry: vroomRoute.geometry,
        };

        routes.push(newRoute);
        partialRoutes = [...routes];

        // Track this vehicle as having a route assigned
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
      console.log(
        `Grouped ${ordersWithLocation.length} orders into ${groupedOrders.length} unique locations`,
      );
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
      }),
    );

    await updateJobProgress(jobId || input.configurationId, 30);
    checkAbort();

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

    // Convert routes
    for (const vroomRoute of vroomResult.routes) {
      const vehicle = selectedVehicles.find(
        (v) => v.id === vroomRoute.vehicleId,
      );
      if (!vehicle) continue;

      // Process stops - keep grouped or expand based on groupSameLocation setting
      const routeStops: OptimizationStop[] = [];
      let sequenceCounter = 1;
      for (const stop of vroomRoute.stops) {
        const grouped = globalGroupMap.get(stop.orderId);
        if (grouped && grouped.orderIds.length > 1) {
          if (groupSameLocation) {
            // Keep as single stop with grouped order info
            routeStops.push({
              orderId: grouped.orderIds[0], // Use first order as representative
              trackingId: grouped.trackingIds[0], // Use first tracking ID
              sequence: sequenceCounter++,
              address: stop.address,
              latitude: String(stop.latitude),
              longitude: String(stop.longitude),
              estimatedArrival: stop.arrivalTime
                ? new Date(stop.arrivalTime * 1000).toISOString()
                : undefined,
              groupedOrderIds: grouped.orderIds,
              groupedTrackingIds: grouped.trackingIds,
            });
          } else {
            // Expand grouped order into individual stops at same location
            for (let i = 0; i < grouped.orderIds.length; i++) {
              routeStops.push({
                orderId: grouped.orderIds[i],
                trackingId: grouped.trackingIds[i],
                sequence: sequenceCounter++,
                address: stop.address,
                latitude: String(stop.latitude),
                longitude: String(stop.longitude),
                estimatedArrival: stop.arrivalTime
                  ? new Date(stop.arrivalTime * 1000).toISOString()
                  : undefined,
              });
            }
          }
        } else {
          routeStops.push({
            orderId: stop.orderId,
            trackingId: stop.trackingId,
            sequence: sequenceCounter++,
            address: stop.address,
            latitude: String(stop.latitude),
            longitude: String(stop.longitude),
            estimatedArrival: stop.arrivalTime
              ? new Date(stop.arrivalTime * 1000).toISOString()
              : undefined,
          });
        }
      }

      const newRoute: OptimizationRoute = {
        routeId: `route-${vehicle.id}-${Date.now()}`,
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate || vehicle.name || vehicle.id,
        stops: routeStops,
        totalDistance: vroomRoute.totalDistance,
        totalDuration: vroomRoute.totalDuration,
        totalServiceTime: vroomRoute.totalServiceTime,
        totalTravelTime: vroomRoute.totalTravelTime,
        totalWeight: vroomRoute.totalWeight,
        totalVolume: vroomRoute.totalVolume,
        utilizationPercentage: Math.round(
          Math.max(
            (vroomRoute.totalWeight / (vehicle.weightCapacity || 1)) * 100,
            (vroomRoute.totalVolume / (vehicle.volumeCapacity || 1)) * 100,
          ) || 0,
        ),
        timeWindowViolations: 0,
        geometry: vroomRoute.geometry,
      };

      routes.push(newRoute);
      partialRoutes = [...routes];
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

  for (const route of routes) {
    // Check if this vehicle has a pre-assigned driver
    const preAssignedDriverId = vehicleDriverMap.get(route.vehicleId);

    if (preAssignedDriverId && selectedDriverIds.has(preAssignedDriverId)) {
      // Vehicle has a pre-assigned driver - mark to skip scoring
      vehiclesWithPreAssignedDrivers.add(route.vehicleId);
    } else {
      // No pre-assigned driver - add to scoring queue
      routeAssignments.push({
        companyId: input.companyId,
        vehicleId: route.vehicleId,
        routeStops: route.stops.map((s) => ({
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

  // Update routes with assigned drivers and vehicle origin
  for (const route of routes) {
    const vehicle = selectedVehicles.find((v) => v.id === route.vehicleId);
    const preAssignedDriverId = vehicleDriverMap.get(route.vehicleId);

    // Check if this vehicle has a pre-assigned driver that should be used directly
    if (
      preAssignedDriverId &&
      vehiclesWithPreAssignedDrivers.has(route.vehicleId)
    ) {
      // Use pre-assigned driver directly WITHOUT scoring
      const driver = driverDetailsMap.get(preAssignedDriverId);
      if (driver) {
        route.driverId = driver.id;
        route.driverName = driver.name;
        route.assignmentQuality = {
          score: 100, // Perfect score for pre-assigned
          warnings: [],
          errors: [],
        };
      }
    } else {
      // Use scored assignment
      const assignment = driverAssignments.get(route.vehicleId);
      if (assignment) {
        route.driverId = assignment.driverId;
        route.driverName = assignment.driverName;
        route.assignmentQuality = {
          score: assignment.score.score,
          warnings: assignment.score.warnings,
          errors: assignment.score.errors,
        };
      }
    }

    // Get vehicle origin from vehiclesWithZones
    const vehicleWithZone = vehiclesWithZones.find(
      (v) => v.id === route.vehicleId,
    );
    if (vehicleWithZone?.originLatitude && vehicleWithZone?.originLongitude) {
      route.driverOrigin = {
        latitude: vehicleWithZone.originLatitude,
        longitude: vehicleWithZone.originLongitude,
        address: undefined, // Vehicles don't have origin address
      };
    }
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

  // Calculate assignment quality metrics
  const assignmentResults: DriverAssignmentResult[] = routes
    .filter(
      (r): r is OptimizationRoute & { driverId: string; driverName: string } =>
        !!r.assignmentQuality && !!r.driverId && !!r.driverName,
    )
    .map((r) => ({
      driverId: r.driverId,
      driverName: r.driverName,
      score: {
        driverId: r.driverId,
        score: r.assignmentQuality?.score ?? 0,
        factors: {
          skillsMatch: 100, // Placeholder - not tracked per route
          availability: 100,
          licenseValid: 100,
          fleetMatch: 100,
          workload: 100,
        },
        warnings: r.assignmentQuality?.warnings ?? [],
        errors: r.assignmentQuality?.errors ?? [],
      },
      isManualOverride: false,
    }));

  const assignmentMetrics =
    await getAssignmentQualityMetrics(assignmentResults);

  // Calculate drivers without routes
  const assignedDriverIds = new Set(
    routes.map((r) => r.driverId).filter(Boolean),
  );
  const driversWithoutRoutes = selectedDrivers
    .filter((d) => !assignedDriverIds.has(d.id))
    .map((d) => {
      // Get origin from assigned vehicle if available
      const vehicleOrigin = driverVehicleOriginMap.get(d.id);
      return {
        id: d.id,
        name: d.name,
        originLatitude: vehicleOrigin?.latitude,
        originLongitude: vehicleOrigin?.longitude,
      };
    });

  // Calculate vehicles without routes
  const assignedVehicleIds = new Set(routes.map((r) => r.vehicleId));
  const vehiclesWithoutRoutes = vehiclesWithZones
    .filter((v) => !assignedVehicleIds.has(v.id))
    .map((v) => ({
      id: v.id,
      plate: v.plate,
      originLatitude: v.originLatitude ?? undefined,
      originLongitude: v.originLongitude ?? undefined,
    }));

  const result: OptimizationResult = {
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
    warnings: optimizationWarnings.length > 0 ? optimizationWarnings : undefined,
    summary: {
      optimizedAt: new Date().toISOString(),
      objective: config.objective,
      processingTimeMs: Date.now() - startTime,
    },
    depot: {
      latitude: parseFloat(config.depotLatitude),
      longitude: parseFloat(config.depotLongitude),
    },
  };

  await updateJobProgress(jobId || input.configurationId, 100);
  checkAbort();

  return result;
}

/**
 * Sleep utility for simulating async work
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create and execute an optimization job
 */
export async function createAndExecuteJob(
  input: OptimizationInput,
  timeoutMs: number = 300000, // 5 minutes default
): Promise<{ jobId: string; cached: boolean }> {
  // Calculate input hash for caching
  const pendingOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.companyId, input.companyId),
      eq(orders.status, "PENDING"),
      eq(orders.active, true),
    ),
  });

  const inputHash = calculateInputHash(
    input.configurationId,
    input.vehicleIds,
    input.driverIds,
    pendingOrders.map((o) => o.id),
  );

  // Check for cached results
  const cachedResult = await getCachedResult(inputHash, input.companyId);
  if (cachedResult) {
    // Return cached job without creating a new one
    // The caller should look up the cached job by inputHash
    const cachedJob = await db.query.optimizationJobs.findFirst({
      where: and(
        eq(optimizationJobs.inputHash, inputHash),
        eq(optimizationJobs.companyId, input.companyId),
        eq(optimizationJobs.status, "COMPLETED"),
      ),
      orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
    });

    if (cachedJob) {
      return { jobId: cachedJob.id, cached: true };
    }
  }

  // Check concurrency limit
  if (!canStartJob()) {
    throw new Error("Maximum concurrent jobs reached. Please try again later.");
  }

  // Create abort controller for this job
  const abortController = new AbortController();

  // Create new job in database
  const [newJob] = await db
    .insert(optimizationJobs)
    .values({
      companyId: input.companyId,
      configurationId: input.configurationId,
      status: "PENDING",
      inputHash,
      timeoutMs,
    })
    .returning();

  const jobId = newJob.id;

  // Acquire per-company lock to prevent concurrent optimizations
  // using the same PENDING orders
  if (!acquireCompanyLock(input.companyId, jobId)) {
    // Another optimization is running for this company - fail this job
    await db
      .update(optimizationJobs)
      .set({ status: "FAILED", error: "Another optimization is already running for this company. Please wait for it to finish.", updatedAt: new Date() })
      .where(eq(optimizationJobs.id, jobId));
    throw new Error("Ya hay una optimización en ejecución para esta empresa. Espera a que termine.");
  }

  // Register job in queue
  registerJob(jobId, abortController);

  // Set timeout
  setJobTimeout(jobId, timeoutMs, async () => {
    releaseCompanyLock(input.companyId, jobId);
    await failJob(jobId, "Optimization timed out");
  });

  // Execute optimization asynchronously
  (async () => {
    try {
      // Update job status to running
      await db
        .update(optimizationJobs)
        .set({ status: "RUNNING", startedAt: new Date(), updatedAt: new Date() })
        .where(eq(optimizationJobs.id, jobId));

      // Run optimization
      const result = await runOptimization(
        input,
        abortController.signal,
        jobId,
      );

      // Complete job - mark lock as completed (awaiting confirmation)
      // Lock will be released on confirmation or after 30 min stale fallback
      await completeJob(jobId, result);
      markCompanyLockCompleted(input.companyId, jobId);
    } catch (error) {
      releaseCompanyLock(input.companyId, jobId);
      if (isJobAborting(jobId)) {
        // Get partial results if available
        const partialResults = globalThis.__partialOptimizationResult;
        await cancelJob(jobId, partialResults);
        // Clean up global state
        globalThis.__partialOptimizationResult = undefined;
      } else {
        await failJob(
          jobId,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    }
  })();

  return { jobId, cached: false };
}
