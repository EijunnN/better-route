import { type NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/db/tenant-aware";
import {
  getHistoricalMetrics,
  getMetricsSummaryStats,
} from "@/lib/plan-metrics";

/**
 * GET /api/metrics/history
 *
 * Retrieves historical metrics for the company.
 * Supports pagination and filtering.
 */
export async function GET(request: NextRequest) {
  try {
    const tenantContext = getTenantContext();

    if (!tenantContext.companyId) {
      return NextResponse.json(
        { error: "Company context required" },
        { status: 400 },
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const includeSummary = searchParams.get("includeSummary") === "true";

    // Validate pagination parameters
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const safeOffset = Math.max(0, offset);

    // Get historical metrics
    const historical = await getHistoricalMetrics(
      tenantContext.companyId,
      safeLimit,
      safeOffset,
    );

    const response: any = {
      metrics: historical,
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        count: historical.length,
      },
    };

    // Optionally include summary statistics
    if (includeSummary) {
      const summary = await getMetricsSummaryStats(tenantContext.companyId);
      response.summary = summary;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error retrieving historical metrics:", error);
    return NextResponse.json(
      { error: "Internal server error", message: String(error) },
      { status: 500 },
    );
  }
}
