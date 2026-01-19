import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationConfigurations, optimizationJobs } from "@/db/schema";
import type { OptimizationResult } from "@/lib/optimization-runner";
import {
  getIssuesByCategory,
  getIssuesBySeverity,
  getValidationSummaryText,
  validatePlanForConfirmation,
} from "@/lib/plan-validation";
import { setTenantContext } from "@/lib/tenant";
import type { PlanValidationRequestSchema } from "@/lib/validations/plan-confirmation";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

/**
 * GET /api/optimization/jobs/[id]/validate
 *
 * Validates an optimization plan for confirmation.
 * Returns validation result with errors, warnings, and metrics.
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

    // Parse query parameters for validation config
    const searchParams = request.nextUrl.searchParams;
    const configParam = searchParams.get("config");
    let validationConfig: PlanValidationRequestSchema["config"] | undefined;

    if (configParam) {
      try {
        validationConfig = JSON.parse(configParam);
      } catch {
        // Use default config if JSON parse fails
      }
    }

    // Fetch the job with result
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
      .leftJoin(
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
            "Plan validation is only available for completed optimization jobs",
          jobStatus: job.status,
        },
        { status: 400 },
      );
    }

    // Check if configuration is already confirmed
    if (job.configuration?.status === "CONFIRMED") {
      return NextResponse.json({
        isValid: true,
        canConfirm: false,
        issues: [],
        summary: {
          totalRoutes: 0,
          routesWithDrivers: 0,
          routesWithoutDrivers: 0,
          unassignedOrders: 0,
          errorCount: 0,
          warningCount: 0,
          infoCount: 0,
        },
        metrics: {
          driverAssignmentCoverage: 100,
          timeWindowCompliance: 100,
          averageAssignmentQuality: 100,
        },
        alreadyConfirmed: true,
        message: "This plan has already been confirmed",
      });
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

    // Validate the plan
    const validationResult = await validatePlanForConfirmation(
      tenantContext.companyId,
      result,
      validationConfig,
    );

    // Enrich response with additional information
    const response = {
      ...validationResult,
      jobId: job.id,
      configurationId: job.configurationId,
      configurationStatus: job.configuration?.status,
      issuesByCategory: getIssuesByCategory(validationResult.issues),
      issuesBySeverity: getIssuesBySeverity(validationResult.issues),
      summaryText: getValidationSummaryText(validationResult),
      // Include result for confirmation dialog display
      result: {
        routes: result.routes,
        summary: result.summary,
        metrics: result.metrics,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error validating plan:", error);
    return NextResponse.json(
      { error: "Internal server error", message: String(error) },
      { status: 500 },
    );
  }
}
