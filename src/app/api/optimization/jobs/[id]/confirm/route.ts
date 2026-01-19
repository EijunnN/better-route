import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationConfigurations, optimizationJobs } from "@/db/schema";
import { createAuditLog } from "@/lib/audit";
import type { OptimizationResult } from "@/lib/optimization-runner";
import {
  calculateComparisonMetrics,
  calculatePlanMetrics,
  savePlanMetrics,
} from "@/lib/plan-metrics";
import {
  canConfirmPlan,
  validatePlanForConfirmation,
} from "@/lib/plan-validation";
import { setTenantContext } from "@/lib/tenant";
import {
  type PlanConfirmationSchema,
  planConfirmationSchema,
} from "@/lib/validations/plan-confirmation";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
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
      tenantId: tenantContext.companyId,
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
        ? (JSON.parse(job.result) as OptimizationResult)
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

    // Confirm the plan - update configuration status
    const now = new Date();
    const [updatedConfiguration] = await db
      .update(optimizationConfigurations)
      .set({
        status: "CONFIRMED",
        confirmedAt: now,
        confirmedBy: auditContext.userId || null,
        updatedAt: now,
      })
      .where(eq(optimizationConfigurations.id, job.configurationId))
      .returning();

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

    // Create audit log
    await createAuditLog({
      entityType: "optimization_configuration",
      entityId: job.configurationId,
      action: "CONFIRM_PLAN",
      changes: JSON.stringify({
        jobId: job.id,
        previousStatus: job.configuration.status,
        newStatus: "CONFIRMED",
        validationSummary: validationResult.summary,
        overrideWarnings: data.overrideWarnings,
        confirmationNote: data.confirmationNote || null,
        metricsId,
        comparisonMetrics,
      }),
    });

    return NextResponse.json({
      success: true,
      message: "Plan confirmed successfully",
      configuration: updatedConfiguration,
      validationResult: {
        isValid: validationResult.isValid,
        summary: validationResult.summary,
        metrics: validationResult.metrics,
      },
      planMetrics: {
        id: metricsId,
        ...planMetricsData,
        comparison: comparisonMetrics,
      },
    });
  } catch (error) {
    console.error("Error confirming plan:", error);
    return NextResponse.json(
      { error: "Internal server error", message: String(error) },
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
      confirmedAt: job.configuration.confirmedAt,
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
