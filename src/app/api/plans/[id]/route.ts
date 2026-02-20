import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationJobs, planMetrics } from "@/db/schema";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";

import { safeParseJson } from "@/lib/utils/safe-json";
/**
 * GET /api/plans/[id] - Get a specific plan with full details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { id } = await params;

    // Get the job
    const job = await db.query.optimizationJobs.findFirst({
      where: and(
        eq(optimizationJobs.id, id),
        eq(optimizationJobs.companyId, tenantCtx.companyId),
      ),
      with: {
        configuration: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Get metrics
    const metrics = await db
      .select()
      .from(planMetrics)
      .where(eq(planMetrics.jobId, id))
      .limit(1);

    // Parse the result JSON if available
    let resultData = null;
    if (job.result) {
      try {
        resultData =
          typeof job.result === "string" ? safeParseJson(job.result) : job.result;
      } catch {
        // Result is not valid JSON
      }
    }

    return NextResponse.json({
      ...job,
      result: resultData,
      metrics: metrics[0] || null,
    });
  } catch (error) {
    console.error("Error fetching plan:", error);
    return NextResponse.json({ error: "Error fetching plan" }, { status: 500 });
  }
}
