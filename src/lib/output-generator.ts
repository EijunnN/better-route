import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  type OUTPUT_FORMAT,
  optimizationConfigurations,
  optimizationJobs,
  outputHistory,
  routeStops,
  users,
  vehicles,
} from "@/db/schema";
import type {
  DriverRouteOutput,
  PlanOutput,
  PlanOutputSummary,
  RouteStopOutput,
} from "./output-generator-types";

export type {
  DriverRouteOutput,
  PlanOutput,
  PlanOutputSummary,
  RouteStopOutput,
} from "./output-generator-types";

/**
 * Generate output data for a confirmed plan
 *
 * @param companyId - The company ID for tenant isolation
 * @param jobId - The optimization job ID to generate output for
 * @param userId - The user ID generating the output
 * @param format - The output format (JSON, CSV)
 * @returns Generated plan output
 */
export async function generatePlanOutput(
  companyId: string,
  jobId: string,
  userId: string,
  format: keyof typeof OUTPUT_FORMAT = "JSON",
): Promise<PlanOutput> {
  // Fetch the optimization job with configuration
  const jobResult = await db
    .select({
      job: optimizationJobs,
      configuration: optimizationConfigurations,
    })
    .from(optimizationJobs)
    .innerJoin(
      optimizationConfigurations,
      eq(optimizationJobs.configurationId, optimizationConfigurations.id),
    )
    .where(
      and(
        eq(optimizationJobs.id, jobId),
        eq(optimizationJobs.companyId, companyId),
      ),
    )
    .limit(1);

  if (jobResult.length === 0) {
    throw new Error("Optimization job not found");
  }

  const { job, configuration } = jobResult[0];

  // Check if job is completed and configuration is confirmed
  if (job.status !== "COMPLETED") {
    throw new Error(
      `Cannot generate output for job with status: ${job.status}`,
    );
  }

  if (configuration.status !== "CONFIRMED") {
    throw new Error(
      `Cannot generate output for configuration with status: ${configuration.status}`,
    );
  }

  // Fetch all route stops for this job with driver and vehicle information
  const stopsResult = await db
    .select({
      stop: routeStops,
      driver: {
        id: users.id,
        name: users.name,
        identification: users.identification,
        phone: users.phone,
      },
      vehicle: {
        id: vehicles.id,
        plate: vehicles.plate,
        brand: vehicles.brand,
        model: vehicles.model,
      },
    })
    .from(routeStops)
    .innerJoin(users, eq(routeStops.userId, users.id))
    .innerJoin(vehicles, eq(routeStops.vehicleId, vehicles.id))
    .where(
      and(eq(routeStops.jobId, jobId), eq(routeStops.companyId, companyId)),
    )
    .orderBy(routeStops.userId, routeStops.sequence);

  if (stopsResult.length === 0) {
    throw new Error("No route stops found for this job");
  }

  // Group stops by driver
  const driverRoutesMap = new Map<string, DriverRouteOutput>();

  for (const { stop, driver, vehicle } of stopsResult) {
    if (!driverRoutesMap.has(driver.id)) {
      driverRoutesMap.set(driver.id, {
        driverId: driver.id,
        driverName: driver.name,
        driverIdentification: driver.identification,
        driverPhone: driver.phone,
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        vehicleBrand: vehicle.brand,
        vehicleModel: vehicle.model,
        stops: [],
        totalStops: 0,
        pendingStops: 0,
        inProgressStops: 0,
        completedStops: 0,
        failedStops: 0,
      });
    }

    const route = driverRoutesMap.get(driver.id)!;
    const metadata = stop.metadata as Record<string, any> | null;
    const stopOutput: RouteStopOutput = {
      sequence: stop.sequence,
      orderId: stop.orderId,
      trackingId: metadata?.trackingId || "",
      customerName: metadata?.customerName || null,
      customerPhone: metadata?.customerPhone || null,
      address: stop.address,
      latitude: stop.latitude,
      longitude: stop.longitude,
      timeWindowStart: stop.timeWindowStart
        ? stop.timeWindowStart.toISOString()
        : null,
      timeWindowEnd: stop.timeWindowEnd
        ? stop.timeWindowEnd.toISOString()
        : null,
      estimatedArrival: stop.estimatedArrival
        ? stop.estimatedArrival.toISOString()
        : null,
      estimatedServiceTime: stop.estimatedServiceTime,
      status: stop.status,
      notes: stop.notes,
      customerNotes: metadata?.customerNotes || null,
    };

    route.stops.push(stopOutput);
    route.totalStops++;

    // Update status counts
    switch (stop.status) {
      case "PENDING":
        route.pendingStops++;
        break;
      case "IN_PROGRESS":
        route.inProgressStops++;
        break;
      case "COMPLETED":
        route.completedStops++;
        break;
      case "FAILED":
        route.failedStops++;
        break;
    }
  }

  const driverRoutes = Array.from(driverRoutesMap.values());

  // Calculate summary metrics
  const summary: PlanOutputSummary = {
    totalRoutes: driverRoutes.length,
    totalStops: driverRoutes.reduce((sum, r) => sum + r.totalStops, 0),
    pendingStops: driverRoutes.reduce((sum, r) => sum + r.pendingStops, 0),
    inProgressStops: driverRoutes.reduce(
      (sum, r) => sum + r.inProgressStops,
      0,
    ),
    completedStops: driverRoutes.reduce((sum, r) => sum + r.completedStops, 0),
    failedStops: driverRoutes.reduce((sum, r) => sum + r.failedStops, 0),
    uniqueDrivers: new Set(driverRoutes.map((r) => r.driverId)).size,
    uniqueVehicles: new Set(driverRoutes.map((r) => r.vehicleId)).size,
  };

  // Create output history record
  const outputId = crypto.randomUUID();
  const now = new Date();

  await db.insert(outputHistory).values({
    id: outputId,
    companyId,
    jobId,
    generatedBy: userId,
    format,
    status: "GENERATED",
    metadata: {
      summary,
      totalRoutes: driverRoutes.length,
      totalStops: summary.totalStops,
    },
    createdAt: now,
    updatedAt: now,
  });

  return {
    outputId,
    jobId,
    jobName: configuration.name,
    configurationId: configuration.id,
    configurationName: configuration.name,
    generatedAt: now.toISOString(),
    generatedBy: userId,
    format,
    driverRoutes,
    summary,
  };
}

/**
 * Convert plan output to CSV format
 *
 * @param output - The plan output to convert
 * @returns CSV string
 */
export function convertOutputToCSV(output: PlanOutput): string {
  const headers = [
    "Driver ID",
    "Driver Name",
    "Driver Identification",
    "Driver Phone",
    "Vehicle Plate",
    "Vehicle Brand",
    "Vehicle Model",
    "Sequence",
    "Order ID",
    "Tracking ID",
    "Customer Name",
    "Customer Phone",
    "Address",
    "Latitude",
    "Longitude",
    "Time Window Start",
    "Time Window End",
    "Estimated Arrival",
    "Service Time (min)",
    "Status",
    "Notes",
    "Customer Notes",
  ];

  const rows: string[][] = [headers];

  for (const route of output.driverRoutes) {
    for (const stop of route.stops) {
      rows.push([
        route.driverId,
        route.driverName,
        route.driverIdentification || "",
        route.driverPhone || "",
        route.vehiclePlate || "",
        route.vehicleBrand || "",
        route.vehicleModel || "",
        stop.sequence.toString(),
        stop.orderId,
        stop.trackingId,
        stop.customerName || "",
        stop.customerPhone || "",
        stop.address,
        stop.latitude,
        stop.longitude,
        stop.timeWindowStart || "",
        stop.timeWindowEnd || "",
        stop.estimatedArrival || "",
        stop.estimatedServiceTime
          ? (stop.estimatedServiceTime / 60).toString()
          : "",
        stop.status,
        stop.notes || "",
        stop.customerNotes || "",
      ]);
    }
  }

  return rows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

/**
 * Get output history for a company
 *
 * @param companyId - The company ID for tenant isolation
 * @param options - Query options
 * @returns List of output history records
 */
export async function getOutputHistory(
  companyId: string,
  options: {
    jobId?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  const { jobId, limit = 50, offset = 0 } = options;

  const whereCondition = jobId
    ? and(
        eq(outputHistory.companyId, companyId),
        eq(outputHistory.jobId, jobId),
      )
    : eq(outputHistory.companyId, companyId);

  return await db
    .select({
      output: outputHistory,
      job: {
        id: optimizationJobs.id,
        status: optimizationJobs.status,
        configurationId: optimizationJobs.configurationId,
      },
    })
    .from(outputHistory)
    .innerJoin(optimizationJobs, eq(outputHistory.jobId, optimizationJobs.id))
    .where(whereCondition)
    .orderBy(desc(outputHistory.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Get a specific output record by ID
 *
 * @param companyId - The company ID for tenant isolation
 * @param outputId - The output ID
 * @returns Output record or null
 */
export async function getOutputById(companyId: string, outputId: string) {
  const result = await db
    .select()
    .from(outputHistory)
    .where(
      and(
        eq(outputHistory.id, outputId),
        eq(outputHistory.companyId, companyId),
      ),
    )
    .limit(1);

  return result[0] || null;
}

/**
 * Check if output can be generated for a job
 *
 * @param companyId - The company ID for tenant isolation
 * @param jobId - The optimization job ID
 * @returns Object indicating if output can be generated and why
 */
export async function canGenerateOutput(
  companyId: string,
  jobId: string,
): Promise<{
  canGenerate: boolean;
  reason?: string;
}> {
  // Fetch the optimization job with configuration
  const jobResult = await db
    .select({
      job: optimizationJobs,
      configuration: optimizationConfigurations,
    })
    .from(optimizationJobs)
    .innerJoin(
      optimizationConfigurations,
      eq(optimizationJobs.configurationId, optimizationConfigurations.id),
    )
    .where(
      and(
        eq(optimizationJobs.id, jobId),
        eq(optimizationJobs.companyId, companyId),
      ),
    )
    .limit(1);

  if (jobResult.length === 0) {
    return {
      canGenerate: false,
      reason: "Optimization job not found",
    };
  }

  const { job, configuration } = jobResult[0];

  if (job.status !== "COMPLETED") {
    return {
      canGenerate: false,
      reason: `Job status is ${job.status}, must be COMPLETED to generate output`,
    };
  }

  if (configuration.status !== "CONFIRMED") {
    return {
      canGenerate: false,
      reason: `Configuration status is ${configuration.status}, must be CONFIRMED to generate output`,
    };
  }

  // Check if route stops exist
  const stopsCount = await db
    .select({ count: routeStops.id })
    .from(routeStops)
    .where(
      and(eq(routeStops.jobId, jobId), eq(routeStops.companyId, companyId)),
    );

  if (stopsCount.length === 0) {
    return {
      canGenerate: false,
      reason: "No route stops found for this job",
    };
  }

  return {
    canGenerate: true,
  };
}

/**
 * Format plan output for human-readable display
 *
 * @param output - The plan output to format
 * @returns Formatted text string
 */
export function formatOutputForDisplay(output: PlanOutput): string {
  const lines: string[] = [];

  lines.push("=".repeat(80));
  lines.push("ROUTE PLAN OUTPUT");
  lines.push("=".repeat(80));
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Configuration: ${output.configurationName}`);
  lines.push("");

  // Summary
  lines.push("-".repeat(80));
  lines.push("SUMMARY");
  lines.push("-".repeat(80));
  lines.push(`Total Routes: ${output.summary.totalRoutes}`);
  lines.push(`Total Stops: ${output.summary.totalStops}`);
  lines.push(`  - Pending: ${output.summary.pendingStops}`);
  lines.push(`  - In Progress: ${output.summary.inProgressStops}`);
  lines.push(`  - Completed: ${output.summary.completedStops}`);
  lines.push(`  - Failed: ${output.summary.failedStops}`);
  lines.push("");

  // Driver routes
  for (const route of output.driverRoutes) {
    lines.push("=".repeat(80));
    lines.push(`DRIVER: ${route.driverName} (${route.driverIdentification})`);
    lines.push(`Phone: ${route.driverPhone || "N/A"}`);
    lines.push(
      `Vehicle: ${route.vehiclePlate} - ${route.vehicleBrand} ${route.vehicleModel}`,
    );
    lines.push(
      `Stops: ${route.totalStops} total (${route.completedStops} completed)`,
    );
    lines.push("=".repeat(80));
    lines.push("");

    for (const stop of route.stops) {
      lines.push(`Stop #${stop.sequence}`);
      lines.push(`  Order: ${stop.trackingId}`);
      lines.push(
        `  Customer: ${stop.customerName || "N/A"} - ${stop.customerPhone || "N/A"}`,
      );
      lines.push(`  Address: ${stop.address}`);
      lines.push(
        `  Time Window: ${stop.timeWindowStart ? stop.timeWindowStart.slice(11, 16) : "N/A"} - ${stop.timeWindowEnd ? stop.timeWindowEnd.slice(11, 16) : "N/A"}`,
      );
      lines.push(
        `  ETA: ${stop.estimatedArrival ? stop.estimatedArrival.slice(11, 16) : "N/A"}`,
      );
      lines.push(`  Status: ${stop.status}`);
      if (stop.notes) {
        lines.push(`  Notes: ${stop.notes}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
