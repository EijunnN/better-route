import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
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
} from "./driver-assignment";
import {
  calculateInputHash,
  cancelJob,
  canStartJob,
  completeJob,
  failJob,
  getCachedResult,
  isJobAborting,
  registerJob,
  setJobTimeout,
  updateJobProgress,
} from "./job-queue";
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
} from "./zone-utils";

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
  totalDuration: number;
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

  // Prepare orders with location info
  const ordersWithLocation = pendingOrders.map((order) => ({
    id: order.id,
    trackingId: order.trackingId,
    address: order.address,
    latitude: order.latitude,
    longitude: order.longitude,
    weightRequired: order.weightRequired || 0,
    volumeRequired: order.volumeRequired || 0,
    promisedDate: order.promisedDate,
    serviceTime: 300, // 5 minutes default
  }));

  // Prepare vehicles with zone assignments
  const vehiclesWithZones = selectedVehicles.map((vehicle) => ({
    id: vehicle.id,
    plate: vehicle.plate || vehicle.name || vehicle.id,
    name: vehicle.name,
    weightCapacity: vehicle.weightCapacity,
    volumeCapacity: vehicle.volumeCapacity,
    maxOrders: vehicle.maxOrders || 30,
    originLatitude: vehicle.originLatitude,
    originLongitude: vehicle.originLongitude,
    zoneAssignments: zoneAssignmentsByVehicle.get(vehicle.id) || [],
  }));

  // Depot config
  const depotConfig: DepotConfig = {
    latitude: parseFloat(config.depotLatitude),
    longitude: parseFloat(config.depotLongitude),
    timeWindowStart: "06:00",
    timeWindowEnd: "22:00",
  };

  // Load optimization preset (default for company)
  const preset = await db.query.optimizationPresets.findFirst({
    where: and(
      eq(optimizationPresets.companyId, input.companyId),
      eq(optimizationPresets.isDefault, true),
      eq(optimizationPresets.active, true),
    ),
  });

  // Optimization config with preset values
  const vroomConfig: VroomOptConfig = {
    depot: depotConfig,
    objective:
      (config?.objective as "DISTANCE" | "TIME" | "BALANCED") || "BALANCED",
    // Apply preset settings if available
    balanceVisits: preset?.balanceVisits ?? false,
    maxDistanceKm: preset?.maxDistanceKm ?? undefined,
    maxTravelTimeMinutes: preset?.vehicleRechargeTime ?? undefined, // vehicleRechargeTime acts as max travel time
    trafficFactor: preset?.trafficFactor ?? undefined,
    // Route end configuration
    routeEndMode: (preset?.routeEndMode as "DRIVER_ORIGIN" | "SPECIFIC_DEPOT" | "OPEN_END") ?? "DRIVER_ORIGIN",
    endDepot: preset?.endDepotLatitude && preset?.endDepotLongitude
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
  const unassignedOrders: Array<{
    orderId: string;
    trackingId: string;
    reason: string;
  }> = [];

  if (hasZones) {
    // Zone-aware optimization: run optimization per zone batch
    const zoneBatches = createZoneBatches(
      ordersWithLocation,
      vehiclesWithZones,
      zonesData,
      dayOfWeek,
    );

    console.log(
      `Zone batches created: ${zoneBatches.length} batches for ${ordersWithLocation.length} orders`,
    );

    const progressPerBatch =
      zoneBatches.length > 0 ? 50 / zoneBatches.length : 50;
    let currentProgress = 20;

    for (const batch of zoneBatches) {
      checkAbort();

      console.log(
        `Processing zone batch: ${batch.zoneName} (${batch.orders.length} orders, ${batch.vehicles.length} vehicles)`,
      );

      if (batch.vehicles.length === 0) {
        // No vehicles available for this zone - mark all orders as unassigned
        for (const order of batch.orders) {
          unassignedOrders.push({
            orderId: order.id,
            trackingId: order.trackingId,
            reason: `No hay vehículos disponibles para la zona ${batch.zoneName} el día ${dayOfWeek}`,
          });
        }
        continue;
      }

      // Convert batch orders to VROOM format
      const batchOrdersForVroom: OrderForOptimization[] = batch.orders.map(
        (order) => ({
          id: order.id,
          trackingId: order.trackingId,
          address: order.address,
          latitude: parseFloat(String(order.latitude)),
          longitude: parseFloat(String(order.longitude)),
          weightRequired: order.weightRequired,
          volumeRequired: order.volumeRequired,
          timeWindowStart: order.promisedDate
            ? new Date(order.promisedDate).toTimeString().slice(0, 5)
            : undefined,
          timeWindowEnd: order.promisedDate
            ? new Date(
                new Date(order.promisedDate).getTime() + 2 * 60 * 60 * 1000,
              )
                .toTimeString()
                .slice(0, 5)
            : undefined,
          serviceTime: order.serviceTime,
          zoneId: batch.zoneId === "unzoned" ? undefined : batch.zoneId,
        }),
      );

      // Convert batch vehicles to VROOM format
      const batchVehiclesForVroom: VehicleForOptimization[] =
        batch.vehicles.map((vehicle) => ({
          id: vehicle.id,
          plate: vehicle.plate,
          maxWeight: vehicle.weightCapacity || 10000,
          maxVolume: vehicle.volumeCapacity || 100,
          maxOrders: vehicle.maxOrders || 30,
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

      // Add batch unassigned orders
      for (const unassigned of batchResult.unassigned) {
        unassignedOrders.push({
          ...unassigned,
          reason: `${unassigned.reason} (Zona: ${batch.zoneName})`,
        });
      }

      // Convert batch routes to our format
      for (const vroomRoute of batchResult.routes) {
        const vehicle = selectedVehicles.find(
          (v) => v.id === vroomRoute.vehicleId,
        );
        if (!vehicle) continue;

        const routeStops: OptimizationStop[] = vroomRoute.stops.map((stop) => ({
          orderId: stop.orderId,
          trackingId: stop.trackingId,
          sequence: stop.sequence,
          address: stop.address,
          latitude: String(stop.latitude),
          longitude: String(stop.longitude),
          estimatedArrival: stop.arrivalTime
            ? new Date(stop.arrivalTime * 1000).toISOString()
            : undefined,
        }));

        const newRoute: OptimizationRoute = {
          routeId: `route-${vehicle.id}-${batch.zoneId}-${Date.now()}`,
          vehicleId: vehicle.id,
          vehiclePlate: vehicle.plate || vehicle.name || vehicle.id,
          stops: routeStops,
          totalDistance: vroomRoute.totalDistance,
          totalDuration: vroomRoute.totalDuration,
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

      currentProgress += progressPerBatch;
      await updateJobProgress(jobId || input.configurationId, currentProgress);
    }
  } else {
    // No zones configured - run single optimization for all orders
    const ordersForVroom: OrderForOptimization[] = ordersWithLocation.map(
      (order) => ({
        id: order.id,
        trackingId: order.trackingId,
        address: order.address,
        latitude: parseFloat(String(order.latitude)),
        longitude: parseFloat(String(order.longitude)),
        weightRequired: order.weightRequired,
        volumeRequired: order.volumeRequired,
        timeWindowStart: order.promisedDate
          ? new Date(order.promisedDate).toTimeString().slice(0, 5)
          : undefined,
        timeWindowEnd: order.promisedDate
          ? new Date(
              new Date(order.promisedDate).getTime() + 2 * 60 * 60 * 1000,
            )
              .toTimeString()
              .slice(0, 5)
          : undefined,
        serviceTime: order.serviceTime,
      }),
    );

    const vehiclesForVroom: VehicleForOptimization[] = vehiclesWithZones.map(
      (vehicle) => ({
        id: vehicle.id,
        plate: vehicle.plate,
        maxWeight: vehicle.weightCapacity || 10000,
        maxVolume: vehicle.volumeCapacity || 100,
        maxOrders: vehicle.maxOrders || 30,
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

    // Add unassigned orders
    unassignedOrders.push(...vroomResult.unassigned);

    // Convert routes
    for (const vroomRoute of vroomResult.routes) {
      const vehicle = selectedVehicles.find(
        (v) => v.id === vroomRoute.vehicleId,
      );
      if (!vehicle) continue;

      const routeStops: OptimizationStop[] = vroomRoute.stops.map((stop) => ({
        orderId: stop.orderId,
        trackingId: stop.trackingId,
        sequence: stop.sequence,
        address: stop.address,
        latitude: String(stop.latitude),
        longitude: String(stop.longitude),
        estimatedArrival: stop.arrivalTime
          ? new Date(stop.arrivalTime * 1000).toISOString()
          : undefined,
      }));

      const newRoute: OptimizationRoute = {
        routeId: `route-${vehicle.id}-${Date.now()}`,
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate || vehicle.name || vehicle.id,
        stops: routeStops,
        totalDistance: vroomRoute.totalDistance,
        totalDuration: vroomRoute.totalDuration,
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
  const routeAssignments: DriverAssignmentRequest[] = [];
  const assignedDrivers = new Map<string, string>();

  for (const route of routes) {
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

  // Perform intelligent driver assignment
  checkAbort();
  const strategy = config?.objective === "TIME" ? "AVAILABILITY" : "BALANCED";
  const driverAssignments = await assignDriversToRoutes(routeAssignments, {
    ...DEFAULT_ASSIGNMENT_CONFIG,
    strategy,
  });

  // Update routes with assigned drivers and vehicle origin
  for (const route of routes) {
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

    // Get vehicle origin from vehiclesWithZones
    const vehicle = vehiclesWithZones.find((v) => v.id === route.vehicleId);
    if (vehicle?.originLatitude && vehicle?.originLongitude) {
      route.driverOrigin = {
        latitude: vehicle.originLatitude,
        longitude: vehicle.originLongitude,
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

  const result: OptimizationResult = {
    routes,
    unassignedOrders,
    metrics: {
      totalDistance,
      totalDuration,
      totalRoutes: routes.length,
      totalStops,
      utilizationRate: Math.round(utilizationRate),
      timeWindowComplianceRate: Math.round(timeWindowComplianceRate),
    },
    assignmentMetrics,
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

  // Register job in queue
  registerJob(jobId, abortController);

  // Set timeout
  setJobTimeout(jobId, timeoutMs, async () => {
    await failJob(jobId, "Optimization timed out");
  });

  // Execute optimization asynchronously
  (async () => {
    try {
      // Update job status to running
      await db
        .update(optimizationJobs)
        .set({ status: "RUNNING", startedAt: new Date() })
        .where(eq(optimizationJobs.id, jobId));

      // Run optimization
      const result = await runOptimization(
        input,
        abortController.signal,
        jobId,
      );

      // Complete job
      await completeJob(jobId, result);
    } catch (error) {
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
