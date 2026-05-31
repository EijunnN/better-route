import { type NextRequest, NextResponse } from "next/server";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  getHistoricalMetrics,
  getMetricsSummaryStats,
  getPlanMetrics,
} from "@/lib/optimization/plan-metrics";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

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
    const authResult = await requireRoutePermission(
      request,
      EntityType.METRICS,
      Action.READ,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const { id: jobId } = await params;

    // Get query parameters for historical data
    const { searchParams } = new URL(request.url);
    const includeHistorical = searchParams.get("includeHistorical") === "true";
    const historicalLimit = parseInt(
      searchParams.get("historicalLimit") || "10",
      10,
    );
    const includeSummary = searchParams.get("includeSummary") === "true";

    // Get plan metrics for this job
    const metrics = await getPlanMetrics(tenantCtx.companyId, jobId);

    if (!metrics) {
      return NextResponse.json(
        { error: "Plan metrics not found for this job" },
        { status: 404 },
      );
    }

    const response: {
      metrics: typeof metrics;
      historical?: Awaited<ReturnType<typeof getHistoricalMetrics>>;
      summary?: Awaited<ReturnType<typeof getMetricsSummaryStats>>;
    } = {
      metrics,
    };

    // Optionally include historical metrics
    if (includeHistorical) {
      const historical = await getHistoricalMetrics(
        tenantCtx.companyId,
        historicalLimit,
      );
      response.historical = historical;
    }

    // Optionally include summary statistics
    if (includeSummary) {
      const summary = await getMetricsSummaryStats(tenantCtx.companyId);
      response.summary = summary;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error retrieving plan metrics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
