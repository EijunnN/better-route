import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationConfigurations, optimizationJobs, orders, routeStops } from "@/db/schema";
import { createAuditLog } from "@/lib/infra/audit";
import type { OptimizationResult } from "@/lib/optimization/optimization-runner";
import {
  calculateComparisonMetrics,
  calculatePlanMetrics,
  savePlanMetrics,
} from "@/lib/optimization/plan-metrics";
import {
  canConfirmPlan,
  validatePlanForConfirmation,
} from "@/lib/optimization/plan-validation";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  type PlanConfirmationSchema,
  planConfirmationSchema,
} from "@/lib/validations/plan-confirmation";

import { extractTenantContext } from "@/lib/routing/route-helpers";

import { safeParseJson } from "@/lib/utils/safe-json";/**
 * Safely converts a date-like value to ISO string or returns a fallback
 */
function safeToISOString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  // If it's already a string, return it
  if (typeof value === "string") {
    return value;
  }

  // If it's a Date object
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return null; // Invalid date
    }
    return value.toISOString();
  }

  // If it has a toISOString method (duck typing)
  if (typeof value === "object" && value !== null && "toISOString" in value) {
    try {
      const isoValue = (value as { toISOString: () => string }).toISOString();
      return typeof isoValue === "string" ? isoValue : null;
    } catch {
      // toISOString failed, try to convert to string
      return String(value);
    }
  }

  // Fallback: convert to string
  return String(value);
}


/**
 * POST /api/optimization/jobs/[id]/confirm
 *
 * Confirms an optimization plan for execution.
 * Validates the plan and updates configuration status to CONFIRMED.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: jobId } = await params;
    const tenantContext = extractTenantContext(request);

    if (!tenantContext?.companyId) {
      return NextResponse.json(
        { error: "Company context required" },
        { status: 400 },
      );
    }

    setTenantContext(tenantContext);

    const auditContext = {
      companyId: tenantContext.companyId,
      userId: tenantContext.userId,
    };

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const parseResult = planConfirmationSchema.safeParse({
      ...body,
      companyId: tenantContext.companyId,
      jobId,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parseResult.error.issues },
        { status: 400 },
      );
    }

    const data: PlanConfirmationSchema = parseResult.data;

    // Fetch the job with configuration
    const [job] = await db
      .select({
        id: optimizationJobs.id,
        companyId: optimizationJobs.companyId,
        configurationId: optimizationJobs.configurationId,
        status: optimizationJobs.status,
        result: optimizationJobs.result,
        configuration: {
          id: optimizationConfigurations.id,
          status: optimizationConfigurations.status,
        },
      })
      .from(optimizationJobs)
      .innerJoin(
        optimizationConfigurations,
        eq(optimizationJobs.configurationId, optimizationConfigurations.id),
      )
      .where(
        and(
          eq(optimizationJobs.id, jobId),
          eq(optimizationJobs.companyId, tenantContext.companyId),
        ),
      )
      .limit(1);

    if (!job) {
      return NextResponse.json(
        { error: "Optimization job not found" },
        { status: 404 },
      );
    }

    // Check if job is completed
    if (job.status !== "COMPLETED") {
      return NextResponse.json(
        {
          error:
            "Plan confirmation is only available for completed optimization jobs",
          jobStatus: job.status,
        },
        { status: 400 },
      );
    }

    // Check if already confirmed
    if (job.configuration.status === "CONFIRMED") {
      return NextResponse.json(
        {
          error: "Plan has already been confirmed",
          confirmedAt: job.configuration,
        },
        { status: 409 },
      );
    }

    // Parse optimization result
    let result: OptimizationResult | null = null;
    try {
      result = job.result
        ? (safeParseJson(job.result) as OptimizationResult)
        : null;
    } catch (_error) {
      return NextResponse.json(
        { error: "Failed to parse optimization result" },
        { status: 500 },
      );
    }

    if (!result) {
      return NextResponse.json(
        { error: "No optimization result available" },
        { status: 400 },
      );
    }

    // Validate the plan before confirmation
    const validationResult = await validatePlanForConfirmation(
      tenantContext.companyId,
      result,
    );

    // Check if there are blocking errors
    if (!canConfirmPlan(validationResult)) {
      return NextResponse.json(
        {
          error: "Plan cannot be confirmed due to validation errors",
          validationResult: {
            isValid: validationResult.isValid,
            canConfirm: validationResult.canConfirm,
            summary: validationResult.summary,
            issuesBySeverity: {
              errors: validationResult.issues.filter(
                (i) => i.severity === "ERROR",
              ),
              warnings: validationResult.issues.filter(
                (i) => i.severity === "WARNING",
              ),
            },
            summaryText:
              validationResult.summary.errorCount > 0
                ? `${validationResult.summary.errorCount} error(s) must be resolved before confirmation`
                : "Plan validation failed",
          },
        },
        { status: 400 },
      );
    }

    // If there are warnings but override is not enabled, show warnings
    const hasWarnings = validationResult.issues.some(
      (i) => i.severity === "WARNING",
    );
    if (hasWarnings && !data.overrideWarnings) {
      return NextResponse.json(
        {
          error: "Plan has warnings that should be reviewed",
          requiresOverride: true,
          validationResult: {
            isValid: validationResult.isValid,
            canConfirm: validationResult.canConfirm,
            summary: validationResult.summary,
            warnings: validationResult.issues.filter(
              (i) => i.severity === "WARNING",
            ),
            summaryText: `Plan has ${validationResult.summary.warningCount} warning(s). Set overrideWarnings=true to confirm anyway.`,
          },
        },
        { status: 409 },
      );
    }

    // Confirm the plan - update configuration status AND name if provided
    const now = new Date();
    const updateData: Record<string, unknown> = {
      status: "CONFIRMED",
      confirmedAt: now,
      confirmedBy: auditContext.userId || null,
      updatedAt: now,
    };
    if (data.planName) {
      updateData.name = data.planName;
    }
    const [updatedConfiguration] = await db
      .update(optimizationConfigurations)
      .set(updateData)
      .where(eq(optimizationConfigurations.id, job.configurationId))
      .returning();

    // Job stays as COMPLETED (optimization finished successfully)
    // The configuration is what gets marked as CONFIRMED
    // Mobile app finds routes via route_stops table, not job status

    // Update orders status to ASSIGNED for all orders in routes
    // Extract all order IDs from routes (including grouped orders)
    const assignedOrderIds: string[] = [];
    for (const route of result.routes) {
      for (const stop of route.stops) {
        // Check if this stop has grouped orders
        if (stop.groupedOrderIds && stop.groupedOrderIds.length > 0) {
          // Add all grouped order IDs
          assignedOrderIds.push(...stop.groupedOrderIds);
        } else {
          // Single order stop
          assignedOrderIds.push(stop.orderId);
        }
      }
    }

    // Update orders status to ASSIGNED
    let ordersUpdatedCount = 0;
    if (assignedOrderIds.length > 0) {
      await db
        .update(orders)
        .set({
          status: "ASSIGNED",
          updatedAt: now,
        })
        .where(
          and(
            inArray(orders.id, assignedOrderIds),
            eq(orders.companyId, tenantContext.companyId),
          ),
        );
      ordersUpdatedCount = assignedOrderIds.length;
      console.log(
        `[Confirm Plan] Updated ${ordersUpdatedCount} orders to ASSIGNED status`,
      );
    }

    // Create route_stops for each stop in the routes
    // This enables the mobile app to show the driver's route
    const routeStopsToCreate: Array<{
      companyId: string;
      jobId: string;
      routeId: string;
      userId: string;
      vehicleId: string;
      orderId: string;
      sequence: number;
      address: string;
      latitude: string;
      longitude: string;
      estimatedArrival: Date | null;
      estimatedServiceTime: number | null;
      timeWindowStart: Date | null;
      timeWindowEnd: Date | null;
      status: "PENDING";
    }> = [];

    for (const route of result.routes) {
      // Skip routes without driver assigned
      if (!route.driverId) continue;

      for (const stop of route.stops) {
        // Parse time window dates if available
        let timeWindowStart: Date | null = null;
        let timeWindowEnd: Date | null = null;
        let estimatedArrival: Date | null = null;

        if (stop.timeWindow?.start) {
          try {
            timeWindowStart = new Date(stop.timeWindow.start);
          } catch {
            // Ignore invalid date
          }
        }
        if (stop.timeWindow?.end) {
          try {
            timeWindowEnd = new Date(stop.timeWindow.end);
          } catch {
            // Ignore invalid date
          }
        }
        if (stop.estimatedArrival) {
          try {
            estimatedArrival = new Date(stop.estimatedArrival);
          } catch {
            // Ignore invalid date
          }
        }

        // Handle grouped orders (same location, multiple orders)
        const orderIds =
          stop.groupedOrderIds && stop.groupedOrderIds.length > 0
            ? stop.groupedOrderIds
            : [stop.orderId];

        for (const orderId of orderIds) {
          routeStopsToCreate.push({
            companyId: tenantContext.companyId,
            jobId: job.id,
            routeId: route.routeId,
            userId: route.driverId,
            vehicleId: route.vehicleId,
            orderId,
            sequence: stop.sequence,
            address: stop.address,
            latitude: stop.latitude,
            longitude: stop.longitude,
            estimatedArrival,
            estimatedServiceTime: 600, // Default 10 minutes
            timeWindowStart,
            timeWindowEnd,
            status: "PENDING",
          });
        }
      }
    }

    // Insert route stops
    let routeStopsCreatedCount = 0;
    if (routeStopsToCreate.length > 0) {
      await db.insert(routeStops).values(routeStopsToCreate);
      routeStopsCreatedCount = routeStopsToCreate.length;
      console.log(
        `[Confirm Plan] Created ${routeStopsCreatedCount} route stops`,
      );
    }

    // Generate and save plan metrics
    const planMetricsData = calculatePlanMetrics(
      tenantContext.companyId,
      job.id,
      job.configurationId,
      result,
      validationResult,
    );

    // Calculate comparison metrics against previous session
    const comparisonMetrics = await calculateComparisonMetrics(
      tenantContext.companyId,
      planMetricsData,
      job.id,
    );

    // Save metrics to database
    const metricsId = await savePlanMetrics(planMetricsData, comparisonMetrics);

    // Create audit log with safe serialization
    // Note: All values here should be primitives or simple objects
    const auditChanges = {
      jobId: job.id,
      previousStatus: job.configuration.status,
      newStatus: "CONFIRMED",
      validationSummary: validationResult.summary,
      overrideWarnings: data.overrideWarnings,
      confirmationNote: data.confirmationNote || null,
      metricsId,
      ordersAssigned: ordersUpdatedCount,
      routeStopsCreated: routeStopsCreatedCount,
      comparisonMetrics: comparisonMetrics
        ? {
            comparedToJobId: comparisonMetrics.comparedToJobId ?? null,
            distanceChangePercent: comparisonMetrics.distanceChangePercent ?? null,
            durationChangePercent: comparisonMetrics.durationChangePercent ?? null,
            complianceChangePercent: comparisonMetrics.complianceChangePercent ?? null,
          }
        : null,
    };

    try {
      await createAuditLog({
        entityType: "optimization_configuration",
        entityId: job.configurationId,
        action: "CONFIRM_PLAN",
        changes: auditChanges,
      });
    } catch (auditError) {
      // Log but don't fail the confirmation if audit fails
      console.error("Failed to create audit log:", auditError);
    }

    // Serialize configuration with safe date handling
    // Create explicit object to avoid any hidden date-like fields from Drizzle
    const safeConfiguration = {
      id: updatedConfiguration.id,
      companyId: updatedConfiguration.companyId,
      name: updatedConfiguration.name,
      depotLatitude: updatedConfiguration.depotLatitude,
      depotLongitude: updatedConfiguration.depotLongitude,
      depotAddress: updatedConfiguration.depotAddress,
      selectedVehicleIds: updatedConfiguration.selectedVehicleIds,
      selectedDriverIds: updatedConfiguration.selectedDriverIds,
      objective: updatedConfiguration.objective,
      capacityEnabled: updatedConfiguration.capacityEnabled,
      workWindowStart: String(updatedConfiguration.workWindowStart),
      workWindowEnd: String(updatedConfiguration.workWindowEnd),
      serviceTimeMinutes: updatedConfiguration.serviceTimeMinutes,
      timeWindowStrictness: updatedConfiguration.timeWindowStrictness,
      penaltyFactor: updatedConfiguration.penaltyFactor,
      maxRoutes: updatedConfiguration.maxRoutes,
      status: updatedConfiguration.status,
      confirmedAt: safeToISOString(updatedConfiguration.confirmedAt),
      confirmedBy: updatedConfiguration.confirmedBy,
      active: updatedConfiguration.active,
      createdAt: safeToISOString(updatedConfiguration.createdAt),
      updatedAt: safeToISOString(updatedConfiguration.updatedAt),
    };

    // Build response object with all primitives to avoid serialization issues
    const responseData = {
      success: true,
      message: "Plan confirmed successfully",
      ordersAssigned: ordersUpdatedCount,
      routeStopsCreated: routeStopsCreatedCount,
      configuration: safeConfiguration,
      validationResult: {
        isValid: validationResult.isValid,
        summary: validationResult.summary,
        metrics: validationResult.metrics,
      },
      planMetrics: {
        id: metricsId,
        companyId: planMetricsData.companyId,
        jobId: planMetricsData.jobId,
        configurationId: planMetricsData.configurationId,
        totalRoutes: planMetricsData.totalRoutes,
        totalStops: planMetricsData.totalStops,
        totalDistance: planMetricsData.totalDistance,
        totalDuration: planMetricsData.totalDuration,
        averageUtilizationRate: planMetricsData.averageUtilizationRate,
        maxUtilizationRate: planMetricsData.maxUtilizationRate,
        minUtilizationRate: planMetricsData.minUtilizationRate,
        timeWindowComplianceRate: planMetricsData.timeWindowComplianceRate,
        totalTimeWindowViolations: planMetricsData.totalTimeWindowViolations,
        driverAssignmentCoverage: planMetricsData.driverAssignmentCoverage,
        averageAssignmentQuality: planMetricsData.averageAssignmentQuality,
        assignmentsWithWarnings: planMetricsData.assignmentsWithWarnings,
        assignmentsWithErrors: planMetricsData.assignmentsWithErrors,
        skillCoverage: planMetricsData.skillCoverage,
        licenseCompliance: planMetricsData.licenseCompliance,
        fleetAlignment: planMetricsData.fleetAlignment,
        workloadBalance: planMetricsData.workloadBalance,
        unassignedOrders: planMetricsData.unassignedOrders,
        objective: planMetricsData.objective,
        processingTimeMs: planMetricsData.processingTimeMs,
        comparison: comparisonMetrics
          ? {
              comparedToJobId: comparisonMetrics.comparedToJobId ?? null,
              distanceChangePercent: comparisonMetrics.distanceChangePercent ?? null,
              durationChangePercent: comparisonMetrics.durationChangePercent ?? null,
              complianceChangePercent: comparisonMetrics.complianceChangePercent ?? null,
            }
          : null,
      },
    };

    return NextResponse.json(responseData);
  } catch (error) {
    // Enhanced error logging to identify the exact location of the error
    console.error("Error confirming plan:", error);
    if (error instanceof Error) {
      console.error("Error stack:", error.stack);
    }
    return NextResponse.json(
      {
        error: "Internal server error",
        message: String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/optimization/jobs/[id]/confirm
 *
 * Returns the confirmation status of a plan.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: jobId } = await params;
    const tenantContext = extractTenantContext(request);

    if (!tenantContext?.companyId) {
      return NextResponse.json(
        { error: "Company context required" },
        { status: 400 },
      );
    }

    setTenantContext(tenantContext);

    // Fetch the job with configuration
    const [job] = await db
      .select({
        id: optimizationJobs.id,
        companyId: optimizationJobs.companyId,
        configurationId: optimizationJobs.configurationId,
        configuration: {
          id: optimizationConfigurations.id,
          status: optimizationConfigurations.status,
          confirmedAt: optimizationConfigurations.confirmedAt,
          confirmedBy: optimizationConfigurations.confirmedBy,
        },
      })
      .from(optimizationJobs)
      .innerJoin(
        optimizationConfigurations,
        eq(optimizationJobs.configurationId, optimizationConfigurations.id),
      )
      .where(
        and(
          eq(optimizationJobs.id, jobId),
          eq(optimizationJobs.companyId, tenantContext.companyId),
        ),
      )
      .limit(1);

    if (!job) {
      return NextResponse.json(
        { error: "Optimization job not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      jobId: job.id,
      configurationId: job.configurationId,
      isConfirmed: job.configuration.status === "CONFIRMED",
      confirmedAt: safeToISOString(job.configuration.confirmedAt),
      confirmedBy: job.configuration.confirmedBy,
    });
  } catch (error) {
    console.error("Error getting confirmation status:", error);
    return NextResponse.json(
      { error: "Internal server error", message: String(error) },
      { status: 500 },
    );
  }
}
