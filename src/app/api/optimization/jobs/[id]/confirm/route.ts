import { and, eq, inArray, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  deliveryVisits,
  optimizationConfigurations,
  optimizationJobs,
  orders,
  planMetrics,
  routeStops,
} from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { createAuditLog } from "@/lib/infra/audit";
import { releaseCompanyLock } from "@/lib/infra/job-queue";
import { setTenantContext } from "@/lib/infra/tenant";
import type { VerifiedPlan } from "@/lib/optimization/optimization-runner";
import {
  calculateComparisonMetrics,
  calculatePlanMetrics,
} from "@/lib/optimization/plan-metrics";
import {
  canConfirmPlan,
  validatePlanForConfirmation,
} from "@/lib/optimization/plan-validation";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import { safeParseJson } from "@/lib/utils/safe-json";
import {
  type PlanConfirmationSchema,
  planConfirmationSchema,
} from "@/lib/validations/plan-confirmation";

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
    if (Number.isNaN(value.getTime())) {
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
 * Thrown from inside the transaction so the busy-vehicle detail survives
 * the rollback and can be shaped into the 409 response.
 */
class VehiclesBusyError extends Error {
  constructor(
    readonly vehicles: Array<{ vehicleId: string; activeStopsCount: number }>,
  ) {
    super("Vehicles have active route stops");
  }
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
    const authResult = await requireRoutePermission(
      request,
      EntityType.PLAN,
      Action.CONFIRM,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantContext = extractTenantContextAuthed(request, authResult);
    if (tenantContext instanceof NextResponse) return tenantContext;
    setTenantContext(tenantContext);

    const { id: jobId } = await params;

    const auditContext = {
      companyId: tenantContext.companyId,
      userId: tenantContext.userId,
    };

    // An empty body means "confirm with defaults", but malformed JSON must
    // fail loudly: silently falling back to {} would e.g. drop a badly
    // serialized `overrideWarnings` and confirm a plan the operator meant
    // to review.
    let body: Record<string, unknown> = {};
    const rawBody = await request.text();
    if (rawBody.trim().length > 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return NextResponse.json(
          { error: "Malformed JSON in request body" },
          { status: 400 },
        );
      }
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return NextResponse.json(
          { error: "Request body must be a JSON object" },
          { status: 400 },
        );
      }
      body = parsed as Record<string, unknown>;
    }

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
          confirmedAt: optimizationConfigurations.confirmedAt,
          serviceTimeMinutes: optimizationConfigurations.serviceTimeMinutes,
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

    // Optimistic lock: only allow confirmation if configuration is DRAFT or CONFIGURED
    if (job.configuration.status === "CONFIRMED") {
      return NextResponse.json(
        {
          error: "Plan has already been confirmed",
          confirmedAt: safeToISOString(job.configuration.confirmedAt),
        },
        { status: 409 },
      );
    }

    if (
      job.configuration.status !== "DRAFT" &&
      job.configuration.status !== "CONFIGURED"
    ) {
      return NextResponse.json(
        {
          error: `Plan cannot be confirmed from status "${job.configuration.status}". Only DRAFT or CONFIGURED plans can be confirmed.`,
          currentStatus: job.configuration.status,
        },
        { status: 409 },
      );
    }

    // Parse optimization result
    let result: VerifiedPlan | null = null;
    try {
      result = job.result ? (safeParseJson(job.result) as VerifiedPlan) : null;
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

    // Apply the user's driver dropdown picks BEFORE validation/insert.
    // The dialog lets the operator reassign drivers per vehicle, but
    // we'd previously ignored that map and used `route.driverId` from
    // the optimizer output — so a route that came back with no driver
    // (or with a different one) silently dropped the operator's pick.
    // Now we mutate the result in place so both the validation pass
    // and the routeStops insert see the post-edit assignments.
    if (data.driverAssignments) {
      for (const route of result.routes) {
        const picked = data.driverAssignments[route.vehicleId];
        if (picked && picked.length > 0) {
          route.driverId = picked;
        }
      }
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
        {
          error:
            "Cannot confirm plan with no routes. Optimization produced no valid routes.",
        },
        { status: 400 },
      );
    }

    // Vehicles must not have active stops from other plans. The check itself
    // runs inside the transaction (see below) so it cannot race a concurrent
    // confirm; here we only collect the vehicle ids.
    const routeVehicleIds = [...new Set(result.routes.map((r) => r.vehicleId))];

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
    const existingOrders =
      assignedOrderIds.length > 0
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

    const existingOrderMap = new Map(
      existingOrders.map((o) => [o.id, o.status]),
    );
    const missingOrderIds = assignedOrderIds.filter(
      (id) => !existingOrderMap.has(id),
    );
    const nonPendingOrderIds = assignedOrderIds.filter((id) => {
      const status = existingOrderMap.get(id);
      return status != null && status !== "PENDING";
    });
    const skippedOrderIds = [
      ...new Set([...missingOrderIds, ...nonPendingOrderIds]),
    ];

    // Missing or non-pending orders are filtered out and skipped

    if (skippedOrderIds.length > 0) {
      const skippedOrderIdSet = new Set(skippedOrderIds);
      const validOrderIds = assignedOrderIds.filter(
        (id) => !skippedOrderIdSet.has(id),
      );
      if (validOrderIds.length === 0) {
        return NextResponse.json(
          {
            error:
              "All orders from this plan no longer exist or are no longer PENDING.",
          },
          { status: 400 },
        );
      }
      assignedOrderIds = validOrderIds;
    }

    // Build route stops data before transaction
    const now = new Date();

    // Parse the plan's start date to combine with HH:mm times from the optimizer
    // The optimizer returns times as HH:mm strings (e.g., "09:01"), which need
    // to be combined with the actual planned date to form full timestamps.
    // An unparseable startDate is rejected: silently falling back to today
    // would schedule tomorrow's plan on today's route.
    let planDate: string;
    if (data.startDate) {
      const parsed = new Date(data.startDate);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          {
            error: `Invalid startDate "${data.startDate}". Use YYYY-MM-DD or an ISO datetime.`,
          },
          { status: 400 },
        );
      }
      planDate = parsed.toISOString().split("T")[0];
    } else {
      planDate = now.toISOString().split("T")[0];
    }

    // Helper: combine a date string with an HH:mm time string into a Date
    function parseTimeWithDate(timeStr: string): Date | null {
      // Handle HH:mm or HH:mm:ss format. The "HH:mm" the operator types
      // is the wall-clock the driver should see — we treat it as UTC so
      // the digits round-trip through Postgres `timestamp` (no TZ) and
      // back through `.toISOString()` unchanged, regardless of which
      // timezone the server happens to be running in. Mirrors the
      // `setUTCHours` convention used by `composeTimestamp` in
      // `/api/mobile/driver/my-route`.
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeStr)) {
        const fullTime = timeStr.length <= 5 ? `${timeStr}:00` : timeStr;
        const d = new Date(`${planDate}T${fullTime}Z`);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      // Try as full ISO string
      const d = new Date(timeStr);
      return Number.isNaN(d.getTime()) ? null : d;
    }

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
      zoneId: string | null;
      scheduledDate: string;
      status: "PENDING";
    }> = [];

    const assignedOrderIdSet = new Set(assignedOrderIds);
    const estimatedServiceTimeSeconds =
      job.configuration.serviceTimeMinutes * 60;

    for (const route of result.routes) {
      if (!route.driverId) continue;

      for (const stop of route.stops) {
        const timeWindowStart = stop.timeWindow?.start
          ? parseTimeWithDate(stop.timeWindow.start)
          : null;
        const timeWindowEnd = stop.timeWindow?.end
          ? parseTimeWithDate(stop.timeWindow.end)
          : null;
        const estimatedArrival = stop.estimatedArrival
          ? parseTimeWithDate(stop.estimatedArrival)
          : null;

        const orderIds =
          stop.groupedOrderIds && stop.groupedOrderIds.length > 0
            ? stop.groupedOrderIds
            : [stop.orderId];

        for (const orderId of orderIds) {
          // Skip stops for orders that weren't assigned (missing or non-PENDING)
          if (!assignedOrderIdSet.has(orderId)) continue;

          routeStopsToCreate.push({
            companyId: tenantContext.companyId,
            jobId: job.id,
            routeId: route.routeId,
            userId: route.driverId,
            vehicleId: route.vehicleId,
            orderId,
            sequence: stop.sequence,
            address: stop.address,
            latitude: String(stop.latitude),
            longitude: String(stop.longitude),
            estimatedArrival,
            estimatedServiceTime: estimatedServiceTimeSeconds,
            timeWindowStart,
            timeWindowEnd,
            zoneId: route.zoneId ?? null,
            scheduledDate: planDate,
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
      // Serialize confirms per company: under READ COMMITTED, the busy-vehicle
      // check and the per-order PENDING guard below would otherwise race a
      // concurrent confirm of a *different* configuration sharing vehicles or
      // orders. Released automatically at commit/rollback.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${tenantContext.companyId}))`,
      );

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
            inArray(optimizationConfigurations.status, ["DRAFT", "CONFIGURED"]),
          ),
        )
        .returning();

      if (!updatedConfiguration) {
        throw new Error(
          "CONFLICT:Plan was confirmed by another request. Please refresh.",
        );
      }

      // 2. Vehicles must not carry active stops from another plan. Runs
      // inside the tx (behind the advisory lock) so a concurrent confirm
      // of another plan with the same vehicle cannot slip through.
      if (routeVehicleIds.length > 0) {
        const vehiclesWithActiveStops = await tx
          .select({
            vehicleId: routeStops.vehicleId,
            count: sql<number>`count(*)::int`,
          })
          .from(routeStops)
          .where(
            and(
              eq(routeStops.companyId, tenantContext.companyId),
              inArray(routeStops.vehicleId, routeVehicleIds),
              inArray(routeStops.status, ["PENDING", "IN_PROGRESS"]),
            ),
          )
          .groupBy(routeStops.vehicleId);

        if (vehiclesWithActiveStops.length > 0) {
          throw new VehiclesBusyError(
            vehiclesWithActiveStops.map((v) => ({
              vehicleId: v.vehicleId,
              activeStopsCount: v.count,
            })),
          );
        }
      }

      // 3. Update orders status to ASSIGNED with race condition guard
      const updatedOrderIdSet = new Set<string>();
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

        for (const o of updatedOrders) {
          updatedOrderIdSet.add(o.id);
        }

        if (updatedOrderIdSet.size === 0) {
          throw new Error(
            "CONFLICT:All orders in this plan changed status while confirming. Re-run the optimization with current orders.",
          );
        }
      }
      const ordersUpdatedCount = updatedOrderIdSet.size;

      // Orders that lost PENDING between the pre-check and this statement
      // must not receive a stop: re-filter the insert list against the ids
      // the UPDATE actually touched, or a stop would be born orphaned
      // (PENDING stop for a non-ASSIGNED order).
      const staleOrderIds = assignedOrderIds.filter(
        (id) => !updatedOrderIdSet.has(id),
      );
      const stopsToInsert = routeStopsToCreate.filter((rs) =>
        updatedOrderIdSet.has(rs.orderId),
      );

      // 4. Insert route stops with computed `attempt_number`.
      // For each Order being assigned, attempt_number = (existing
      // delivery_visits for that Order) + 1. First-time Orders get 1;
      // revisitas (Orders that previously had a Visit logged) get 2+.
      // See ADR-0005.
      let routeStopsCreatedCount = 0;
      if (stopsToInsert.length > 0) {
        const visitCountByOrder = new Map<string, number>();
        const counts = await tx
          .select({
            orderId: deliveryVisits.orderId,
            c: sql<number>`count(*)::int`,
          })
          .from(deliveryVisits)
          .where(
            and(
              eq(deliveryVisits.companyId, tenantContext.companyId),
              inArray(deliveryVisits.orderId, [...updatedOrderIdSet]),
            ),
          )
          .groupBy(deliveryVisits.orderId);
        for (const row of counts) {
          visitCountByOrder.set(row.orderId, row.c);
        }
        const enriched = stopsToInsert.map((rs) => ({
          ...rs,
          attemptNumber: (visitCountByOrder.get(rs.orderId) ?? 0) + 1,
        }));
        await tx.insert(routeStops).values(enriched);
        routeStopsCreatedCount = enriched.length;
      }

      // 5. Save plan metrics
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
        staleOrderIds,
        metricsId: insertedMetrics.id,
      };
    });

    const {
      updatedConfiguration,
      ordersUpdatedCount,
      routeStopsCreatedCount,
      staleOrderIds,
      metricsId,
    } = txResult;

    // Orders skipped in the pre-check plus those that lost PENDING inside
    // the confirmation window — both are excluded from update AND insert,
    // and both are reported.
    const allNonPendingOrderIds = [...nonPendingOrderIds, ...staleOrderIds];
    const allSkippedOrderIds = [...skippedOrderIds, ...staleOrderIds];

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
            distanceChangePercent:
              comparisonMetrics.distanceChangePercent ?? null,
            durationChangePercent:
              comparisonMetrics.durationChangePercent ?? null,
            complianceChangePercent:
              comparisonMetrics.complianceChangePercent ?? null,
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
      message:
        allSkippedOrderIds.length > 0
          ? `Plan confirmed with ${allSkippedOrderIds.length} order(s) skipped (missing or no longer PENDING)`
          : "Plan confirmed successfully",
      ordersAssigned: ordersUpdatedCount,
      routeStopsCreated: routeStopsCreatedCount,
      skippedOrders:
        allSkippedOrderIds.length > 0
          ? {
              count: allSkippedOrderIds.length,
              missingCount: missingOrderIds.length,
              nonPendingCount: allNonPendingOrderIds.length,
              missingOrderIds,
              nonPendingOrderIds: allNonPendingOrderIds,
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
              distanceChangePercent:
                comparisonMetrics.distanceChangePercent ?? null,
              durationChangePercent:
                comparisonMetrics.durationChangePercent ?? null,
              complianceChangePercent:
                comparisonMetrics.complianceChangePercent ?? null,
            }
          : null,
      },
    };

    return NextResponse.json(responseData);
  } catch (error) {
    if (error instanceof VehiclesBusyError) {
      const busyList = error.vehicles
        .map((v) => `${v.vehicleId} (${v.activeStopsCount} paradas activas)`)
        .join(", ");
      return NextResponse.json(
        {
          error: `No se puede confirmar: los siguientes vehículos tienen rutas activas sin completar: ${busyList}`,
          vehiclesWithActiveStops: error.vehicles,
        },
        { status: 409 },
      );
    }
    // Handle conflict errors thrown from transaction
    if (error instanceof Error && error.message.startsWith("CONFLICT:")) {
      const message = error.message.slice("CONFLICT:".length);
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("Error confirming plan:", error);
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
    const authResult = await requireRoutePermission(
      request,
      EntityType.PLAN,
      Action.READ,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantContext = extractTenantContextAuthed(request, authResult);
    if (tenantContext instanceof NextResponse) return tenantContext;
    setTenantContext(tenantContext);

    const { id: jobId } = await params;

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
