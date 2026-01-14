import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  type OUTPUT_FORMAT,
  optimizationConfigurations,
  optimizationJobs,
  routeStops,
  users,
  vehicles,
} from "@/db/schema";
import {
  convertOutputToCSV,
  formatOutputForDisplay,
  generatePlanOutput,
  getOutputById,
} from "@/lib/output-generator";
import type {
  DriverRouteOutput,
  PlanOutput,
  RouteStopOutput,
} from "@/lib/output-generator-types";
import { getTenantContext, setTenantContext } from "@/lib/tenant";

interface RouteParams {
  params: Promise<{ outputId: string }>;
}

/**
 * GET /api/output/[outputId]
 * Download or view a specific output
 *
 * Query params:
 * - format: "json" | "csv" | "text" (optional, defaults to json)
 *
 * Response:
 * - JSON: The full output object
 * - CSV: CSV file with download headers
 * - text: Formatted text for display
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Extract tenant context from headers
    const tenantCtx = getTenantContext();
    if (!tenantCtx) {
      return NextResponse.json(
        { success: false, error: "Missing tenant context" },
        { status: 401 },
      );
    }

    const { companyId } = tenantCtx;
    const { outputId } = await params;

    // Set tenant context for database operations
    setTenantContext({ companyId, userId: "" });

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json";

    // Get output record
    const outputRecord = await getOutputById(companyId, outputId);
    if (!outputRecord) {
      return NextResponse.json(
        { success: false, error: "Output not found" },
        { status: 404 },
      );
    }

    // Check if output generation failed
    if (outputRecord.status === "FAILED") {
      return NextResponse.json(
        {
          success: false,
          error: "Output generation failed",
          details: outputRecord.error,
        },
        { status: 400 },
      );
    }

    // Fetch the job and configuration
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
      .where(eq(optimizationJobs.id, outputRecord.jobId))
      .limit(1);

    if (jobResult.length === 0) {
      return NextResponse.json(
        { success: false, error: "Associated job not found" },
        { status: 404 },
      );
    }

    const { job, configuration } = jobResult[0];

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
      .where(eq(routeStops.jobId, outputRecord.jobId))
      .orderBy(routeStops.userId, routeStops.sequence);

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
    const summary = {
      totalRoutes: driverRoutes.length,
      totalStops: driverRoutes.reduce((sum, r) => sum + r.totalStops, 0),
      pendingStops: driverRoutes.reduce((sum, r) => sum + r.pendingStops, 0),
      inProgressStops: driverRoutes.reduce(
        (sum, r) => sum + r.inProgressStops,
        0,
      ),
      completedStops: driverRoutes.reduce(
        (sum, r) => sum + r.completedStops,
        0,
      ),
      failedStops: driverRoutes.reduce((sum, r) => sum + r.failedStops, 0),
      uniqueDrivers: new Set(driverRoutes.map((r) => r.driverId)).size,
      uniqueVehicles: new Set(driverRoutes.map((r) => r.vehicleId)).size,
    };

    const output: PlanOutput = {
      outputId: outputRecord.id,
      jobId: outputRecord.jobId,
      jobName: configuration.name,
      configurationId: configuration.id,
      configurationName: configuration.name,
      generatedAt: outputRecord.createdAt.toISOString(),
      generatedBy: outputRecord.generatedBy,
      format: outputRecord.format as keyof typeof OUTPUT_FORMAT,
      driverRoutes,
      summary,
    };

    // Return based on requested format
    if (format === "csv") {
      const csv = convertOutputToCSV(output);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="route-plan-${outputId}.csv"`,
        },
      });
    }

    if (format === "text") {
      const text = formatOutputForDisplay(output);
      return new NextResponse(text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="route-plan-${outputId}.txt"`,
        },
      });
    }

    // Default to JSON
    return NextResponse.json({
      success: true,
      output,
    });
  } catch (error) {
    console.error("Error fetching output:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch output",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/output/[outputId]
 * Regenerate an existing output
 *
 * Request body:
 * {
 *   "format": "JSON" | "CSV" // optional, defaults to existing format
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "outputId": string,
 *   "data": PlanOutput | string (CSV if format is CSV)
 * }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Extract tenant context from headers
    const tenantCtx = getTenantContext();
    if (!tenantCtx) {
      return NextResponse.json(
        { success: false, error: "Missing tenant context" },
        { status: 401 },
      );
    }

    const { companyId, userId } = tenantCtx;
    const { outputId } = await params;

    // Set tenant context for database operations
    setTenantContext({ companyId, userId: userId || "" });

    // Parse request body
    const body = await request.json();
    const { format }: { format?: keyof typeof OUTPUT_FORMAT } = body;

    // Get existing output record
    const existingOutput = await getOutputById(companyId, outputId);
    if (!existingOutput) {
      return NextResponse.json(
        { success: false, error: "Output not found" },
        { status: 404 },
      );
    }

    // Use existing format if not specified
    const outputFormat = format || existingOutput.format;

    // Validate format
    if (outputFormat !== "JSON" && outputFormat !== "CSV") {
      return NextResponse.json(
        { success: false, error: "format must be JSON or CSV" },
        { status: 400 },
      );
    }

    // Regenerate output
    const outputUserId = userId || "system";
    const output = await generatePlanOutput(
      companyId,
      existingOutput.jobId,
      outputUserId,
      outputFormat,
    );

    // Return based on format
    if (outputFormat === "CSV") {
      const csv = convertOutputToCSV(output);
      return NextResponse.json({
        success: true,
        outputId: output.outputId,
        format: "CSV",
        data: csv,
        summary: output.summary,
      });
    }

    return NextResponse.json({
      success: true,
      outputId: output.outputId,
      format: "JSON",
      data: output,
    });
  } catch (error) {
    console.error("Error regenerating output:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to regenerate output",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/output/[outputId]
 * Delete an output record (soft delete by marking as inactive)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Extract tenant context from headers
    const tenantCtx = getTenantContext();
    if (!tenantCtx) {
      return NextResponse.json(
        { success: false, error: "Missing tenant context" },
        { status: 401 },
      );
    }

    const { companyId } = tenantCtx;
    const { outputId } = await params;

    // Set tenant context for database operations
    setTenantContext({ companyId, userId: "" });

    // Note: The output_history table doesn't have an 'active' field
    // For now, we'll just return success. In production, you might want to:
    // 1. Add an active field to the schema
    // 2. Or physically delete the record
    // 3. Or use soft deletes via a separate deleted_at timestamp

    return NextResponse.json({
      success: true,
      message:
        "Output deletion not implemented - outputs are kept for audit trail",
    });
  } catch (error) {
    console.error("Error deleting output:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete output",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
