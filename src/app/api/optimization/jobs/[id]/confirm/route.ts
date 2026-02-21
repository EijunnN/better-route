import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationConfigurations, optimizationJobs, orders, planMetrics, routeStops } from "@/db/schema";
import { createAuditLog } from "@/lib/infra/audit";
import { releaseCompanyLock } from "@/lib/infra/job-queue";
import type { OptimizationResult } from "@/lib/optimization/optimization-runner";
import {
  calculateComparisonMetrics,
  calculatePlanMetrics,
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
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

import { safeParseJson } from "@/lib/utils/safe-json";

/**
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
    const authResult = await requireRoutePermission(request, EntityType.PLAN, Action.CONFIRM);
    if (authResult instanceof NextResponse) return authResult;

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

    // Optimistic lock: only allow confirmation if configuration is still DRAFT
    if (job.configuration.status === "CONFIRMED") {
      return NextResponse.json(
        {
          error: "Plan has already been confirmed",
          confirmedAt: job.configuration,
        },
        { status: 409 },
      );
    }

    if (job.configuration.status !== "DRAFT") {
      return NextResponse.json(
        {
          error: `Plan cannot be confirmed from status "${job.configuration.status}". Only DRAFT plans can be confirmed.`,
          currentStatus: job.configuration.status,
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

    // Validate routes exist before confirming
    if (!result.routes || result.routes.length === 0) {
      return NextResponse.json(
        { error: "Cannot confirm plan with no routes. Optimization produced no valid routes." },
        { status: 400 },
      );
    }

    // Extract all order IDs from routes (including grouped orders)
    let assignedOrderIds: string[] = [];
    for (const route of result.routes) {
      for (const stop of route.stops) {
        if (stop.groupedOrderIds && stop.groupedOrderIds.length > 0) {
          assignedOrderIds.push(...stop.groupedOrderIds);
        } else {
          assignedOrderIds.push(stop.orderId);
        }
      }
    }

    // Pre-validate: check which orders still exist and are PENDING
    const existingOrders = assignedOrderIds.length > 0
      ? await db
          .select({ id: orders.id, status: orders.status })
          .from(orders)
          .where(
            and(
              inArray(orders.id, assignedOrderIds),
              eq(orders.companyId, tenantContext.companyId),
            ),
          )
      : [];

    const existingOrderMap = new Map(existingOrders.map((o) => [o.id, o.status]));
    const missingOrderIds = assignedOrderIds.filter((id) => !existingOrderMap.has(id));
    const nonPendingOrderIds = assignedOrderIds.filter((id) => {
      const status = existingOrderMap.get(id);
      return status != null && status !== "PENDING";
    });
    const skippedOrderIds = [...new Set([...missingOrderIds, ...nonPendingOrderIds])];

    if (missingOrderIds.length > 0) {
      console.warn(
        `[Confirm Plan] ${missingOrderIds.length} orders no longer exist, skipping: ${missingOrderIds.join(", ")}`,
      );
    }
    if (nonPendingOrderIds.length > 0) {
      console.warn(
        `[Confirm Plan] ${nonPendingOrderIds.length} orders are no longer PENDING (already modified), skipping: ${nonPendingOrderIds.join(", ")}`,
      );
    }

    if (skippedOrderIds.length > 0) {
      const validOrderIds = assignedOrderIds.filter((id) => !skippedOrderIds.includes(id));
      if (validOrderIds.length === 0) {
        return NextResponse.json(
          { error: "All orders from this plan no longer exist or are no longer PENDING." },
          { status: 400 },
        );
      }
      assignedOrderIds = validOrderIds;
    }

    // Build route stops data before transaction
    const now = new Date();
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
      if (!route.driverId) continue;

      for (const stop of route.stops) {
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

    // Calculate plan metrics before transaction (read-only computation)
    const planMetricsData = calculatePlanMetrics(
      tenantContext.companyId,
      job.id,
      job.configurationId,
      result,
      validationResult,
    );

    const comparisonMetrics = await calculateComparisonMetrics(
      tenantContext.companyId,
      planMetricsData,
      job.id,
    );

    // Wrap all DB mutations in a single transaction
    const txResult = await db.transaction(async (tx) => {
      // 1. Confirm the plan - update configuration status AND name
      const updateData: Record<string, unknown> = {
        status: "CONFIRMED",
        confirmedAt: now,
        confirmedBy: auditContext.userId || null,
        updatedAt: now,
      };
      if (data.planName) {
        updateData.name = data.planName;
      }
      const [updatedConfiguration] = await tx
        .update(optimizationConfigurations)
        .set(updateData)
        .where(
          and(
            eq(optimizationConfigurations.id, job.configurationId),
            eq(optimizationConfigurations.status, "DRAFT"),
          ),
        )
        .returning();

      if (!updatedConfiguration) {
        throw new Error("CONFLICT:Plan was confirmed by another request. Please refresh.");
      }

      // 2. Update orders status to ASSIGNED with race condition guard
      let ordersUpdatedCount = 0;
      if (assignedOrderIds.length > 0) {
        const updatedOrders = await tx
          .update(orders)
          .set({
            status: "ASSIGNED",
            updatedAt: now,
          })
          .where(
            and(
              inArray(orders.id, assignedOrderIds),
              eq(orders.companyId, tenantContext.companyId),
              eq(orders.status, "PENDING"),
            ),
          )
          .returning({ id: orders.id });

        if (updatedOrders.length !== assignedOrderIds.length) {
          // Some orders changed status between pre-validation and transaction - warn but continue
          console.warn(
            `[Confirm Plan] Race condition: expected ${assignedOrderIds.length} PENDING orders but only ${updatedOrders.length} were updated. Continuing with partial assignment.`,
          );
        }
        ordersUpdatedCount = updatedOrders.length;
        console.log(
          `[Confirm Plan] Updated ${ordersUpdatedCount} orders to ASSIGNED status`,
        );
      }

      // 3. Insert route stops
      let routeStopsCreatedCount = 0;
      if (routeStopsToCreate.length > 0) {
        await tx.insert(routeStops).values(routeStopsToCreate);
        routeStopsCreatedCount = routeStopsToCreate.length;
        console.log(
          `[Confirm Plan] Created ${routeStopsCreatedCount} route stops`,
        );
      }

      // 4. Save plan metrics
      const [insertedMetrics] = await tx
        .insert(planMetrics)
        .values({
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
          objective: planMetricsData.objective as
            | "DISTANCE"
            | "TIME"
            | "BALANCED"
            | undefined,
          processingTimeMs: planMetricsData.processingTimeMs,
          comparedToJobId: comparisonMetrics?.comparedToJobId,
          distanceChangePercent: comparisonMetrics?.distanceChangePercent,
          durationChangePercent: comparisonMetrics?.durationChangePercent,
          complianceChangePercent: comparisonMetrics?.complianceChangePercent,
        })
        .returning();

      return {
        updatedConfiguration,
        ordersUpdatedCount,
        routeStopsCreatedCount,
        metricsId: insertedMetrics.id,
      };
    });

    const { updatedConfiguration, ordersUpdatedCount, routeStopsCreatedCount, metricsId } = txResult;

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

    // Release the per-company optimization lock now that the plan is confirmed
    releaseCompanyLock(job.companyId, job.id);

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
      message: skippedOrderIds.length > 0
        ? `Plan confirmed with ${skippedOrderIds.length} order(s) skipped (missing or no longer PENDING)`
        : "Plan confirmed successfully",
      ordersAssigned: ordersUpdatedCount,
      routeStopsCreated: routeStopsCreatedCount,
      skippedOrders: skippedOrderIds.length > 0
        ? {
            count: skippedOrderIds.length,
            missingCount: missingOrderIds.length,
            nonPendingCount: nonPendingOrderIds.length,
            missingOrderIds,
            nonPendingOrderIds,
          }
        : undefined,
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
    // Handle conflict errors thrown from transaction
    if (error instanceof Error && error.message.startsWith("CONFLICT:")) {
      const message = error.message.slice("CONFLICT:".length);
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("Error confirming plan:", error);
    if (error instanceof Error) {
      console.error("Error stack:", error.stack);
    }
    return NextResponse.json(
      { error: "Internal server error" },
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
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
