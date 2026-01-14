import { type NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/db/tenant-aware";
import {
  getHistoricalMetrics,
  getMetricsSummaryStats,
  getPlanMetrics,
} from "@/lib/plan-metrics";

/**
 * GET /api/optimization/jobs/[id]/metrics
 *
 * Retrieves plan metrics for a specific job.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: jobId } = await params;
    const tenantContext = getTenantContext();

    if (!tenantContext.companyId) {
      return NextResponse.json(
        { error: "Company context required" },
        { status: 400 },
      );
    }

    // Get query parameters for historical data
    const { searchParams } = new URL(request.url);
    const includeHistorical = searchParams.get("includeHistorical") === "true";
    const historicalLimit = parseInt(
      searchParams.get("historicalLimit") || "10",
      10,
    );
    const includeSummary = searchParams.get("includeSummary") === "true";

    // Get plan metrics for this job
    const metrics = await getPlanMetrics(tenantContext.companyId, jobId);

    if (!metrics) {
      return NextResponse.json(
        { error: "Plan metrics not found for this job" },
        { status: 404 },
      );
    }

    const response: any = {
      metrics,
    };

    // Optionally include historical metrics
    if (includeHistorical) {
      const historical = await getHistoricalMetrics(
        tenantContext.companyId,
        historicalLimit,
      );
      response.historical = historical;
    }

    // Optionally include summary statistics
    if (includeSummary) {
      const summary = await getMetricsSummaryStats(tenantContext.companyId);
      response.summary = summary;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error retrieving plan metrics:", error);
    return NextResponse.json(
      { error: "Internal server error", message: String(error) },
      { status: 500 },
    );
  }
}
