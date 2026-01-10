import {
  calculateInputHash,
  canStartJob,
  registerJob,
  unregisterJob,
  setJobTimeout,
  cancelJob,
  updateJobProgress,
  completeJob,
  failJob,
  getCachedResult,
  isJobAborting,
} from "./job-queue";
import { db } from "@/db";
import { optimizationConfigurations, orders, vehicles, drivers, optimizationJobs } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

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
  stops: OptimizationStop[];
  totalDistance: number;
  totalDuration: number;
  totalWeight: number;
  totalVolume: number;
  utilizationPercentage: number;
  timeWindowViolations: number;
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
  summary: {
    optimizedAt: string;
    objective: string;
    processingTimeMs: number;
  };
}

export interface OptimizationInput {
  configurationId: string;
  companyId: string;
  vehicleIds: string[];
  driverIds: string[];
}

/**
 * Run optimization with mock algorithm (placeholder for actual VRP solver)
 * In production, this would integrate with OR-Tools, Vroom, or similar
 */
export async function runOptimization(
  input: OptimizationInput,
  signal?: AbortSignal,
  jobId?: string
): Promise<OptimizationResult> {
  const startTime = Date.now();

  // Check for abort signal
  const checkAbort = () => {
    if (signal?.aborted) {
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
      eq(orders.active, true)
    ),
  });

  checkAbort();

  // Fetch selected vehicles
  const selectedVehicles = await db.query.vehicles.findMany({
    where: and(
      eq(vehicles.companyId, input.companyId),
      inArray(vehicles.id, input.vehicleIds),
      eq(vehicles.active, true)
    ),
    with: {
      fleet: true,
    },
  });

  checkAbort();

  // Fetch selected drivers
  const selectedDrivers = await db.query.drivers.findMany({
    where: and(
      eq(drivers.companyId, input.companyId),
      inArray(drivers.id, input.driverIds),
      eq(drivers.active, true)
    ),
  });

  checkAbort();

  // Mock optimization algorithm
  // In production, this would be replaced with actual VRP solving logic
  // using libraries like OR-Tools, Vroom, or a custom solver

  await updateJobProgress(jobId || input.configurationId, 10);
  checkAbort();

  // Simulate processing time
  await sleep(500);

  await updateJobProgress(jobId || input.configurationId, 30);
  checkAbort();

  await sleep(500);

  await updateJobProgress(jobId || input.configurationId, 50);
  checkAbort();

  await sleep(500);

  await updateJobProgress(jobId || input.configurationId, 70);
  checkAbort();

  // Generate mock routes based on available vehicles and orders
  const routes: OptimizationRoute[] = [];
  const unassignedOrders: Array<{
    orderId: string;
    trackingId: string;
    reason: string;
  }> = [];

  // Simple round-robin assignment for demonstration
  let orderIndex = 0;
  const maxStopsPerRoute = Math.ceil(pendingOrders.length / selectedVehicles.length) || 1;

  for (const vehicle of selectedVehicles) {
    checkAbort();

    const driver = selectedDrivers.find(
      (d) => d.fleetId === vehicle.fleetId
    ) || selectedDrivers[orderIndex % selectedDrivers.length];

    const routeStops: OptimizationStop[] = [];

    // Assign orders to this route
    for (
      let i = 0;
      i < maxStopsPerRoute && orderIndex < pendingOrders.length;
      i++
    ) {
      const order = pendingOrders[orderIndex++];
      routeStops.push({
        orderId: order.id,
        trackingId: order.trackingId,
        sequence: i + 1,
        address: order.address,
        latitude: order.latitude,
        longitude: order.longitude,
        timeWindow: order.promisedDate
          ? {
              start: new Date(order.promisedDate).toISOString(),
              end: new Date(
                new Date(order.promisedDate).getTime() + 2 * 60 * 60 * 1000
              ).toISOString(),
            }
          : undefined,
      });
    }

    if (routeStops.length > 0) {
      routes.push({
        routeId: `route-${vehicle.id}-${Date.now()}`,
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        driverId: driver?.id,
        driverName: driver?.name,
        stops: routeStops,
        totalDistance: Math.round(Math.random() * 50000 + 10000), // Mock distance in meters
        totalDuration: Math.round(Math.random() * 14400 + 3600), // Mock duration in seconds
        totalWeight: routeStops.length * 100, // Mock weight
        totalVolume: routeStops.length * 50, // Mock volume
        utilizationPercentage: Math.round((routeStops.length / maxStopsPerRoute) * 100),
        timeWindowViolations: 0,
      });
    }
  }

  // Remaining orders are unassigned
  while (orderIndex < pendingOrders.length) {
    const order = pendingOrders[orderIndex++];
    unassignedOrders.push({
      orderId: order.id,
      trackingId: order.trackingId,
      reason: "No available vehicles or capacity constraints",
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
    0
  );

  const utilizationRate =
    routes.length > 0
      ? routes.reduce((sum, r) => sum + r.utilizationPercentage, 0) / routes.length
      : 0;

  const timeWindowComplianceRate =
    totalStops > 0
      ? ((totalStops - timeWindowViolations) / totalStops) * 100
      : 100;

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
    summary: {
      optimizedAt: new Date().toISOString(),
      objective: config.objective,
      processingTimeMs: Date.now() - startTime,
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
  timeoutMs: number = 300000 // 5 minutes default
): Promise<{ jobId: string; cached: boolean }> {
  // Calculate input hash for caching
  const pendingOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.companyId, input.companyId),
      eq(orders.status, "PENDING"),
      eq(orders.active, true)
    ),
  });

  const inputHash = calculateInputHash(
    input.configurationId,
    input.vehicleIds,
    input.driverIds,
    pendingOrders.map((o) => o.id)
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
        eq(optimizationJobs.status, "COMPLETED")
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
      const result = await runOptimization(input, abortController.signal, jobId);

      // Complete job
      await completeJob(jobId, result);
    } catch (error) {
      if (isJobAborting(jobId)) {
        await cancelJob(jobId);
      } else {
        await failJob(
          jobId,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }
  })();

  return { jobId, cached: false };
}
