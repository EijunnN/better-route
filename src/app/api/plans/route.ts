import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationJobs, planMetrics } from "@/db/schema";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

/**
 * GET /api/plans - List confirmed plans with metrics
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.PLAN, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Get completed jobs with their metrics
    const jobs = await db
      .select({
        id: optimizationJobs.id,
        status: optimizationJobs.status,
        progress: optimizationJobs.progress,
        inputHash: optimizationJobs.inputHash,
        createdAt: optimizationJobs.createdAt,
        startedAt: optimizationJobs.startedAt,
        completedAt: optimizationJobs.completedAt,
      })
      .from(optimizationJobs)
      .where(
        and(
          eq(optimizationJobs.companyId, tenantCtx.companyId),
          eq(optimizationJobs.status, "COMPLETED"),
        ),
      )
      .orderBy(desc(optimizationJobs.completedAt))
      .limit(limit)
      .offset(offset);

    // Get metrics for each job
    const plansWithMetrics = await Promise.all(
      jobs.map(async (job) => {
        const metrics = await db
          .select()
          .from(planMetrics)
          .where(eq(planMetrics.jobId, job.id))
          .limit(1);

        return {
          ...job,
          metrics: metrics[0] || null,
        };
      }),
    );

    // Get total count
    const totalResult = await db
      .select({ id: optimizationJobs.id })
      .from(optimizationJobs)
      .where(
        and(
          eq(optimizationJobs.companyId, tenantCtx.companyId),
          eq(optimizationJobs.status, "COMPLETED"),
        ),
      );

    return NextResponse.json({
      data: plansWithMetrics,
      meta: {
        total: totalResult.length,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error("Error fetching plans:", error);
    return NextResponse.json(
      { error: "Error fetching plans" },
      { status: 500 },
    );
  }
}
