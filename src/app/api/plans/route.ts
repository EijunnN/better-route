import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationConfigurations, optimizationJobs, planMetrics } from "@/db/schema";
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

    // Get completed jobs with their metrics and configuration name
    const jobs = await db
      .select({
        id: optimizationJobs.id,
        status: optimizationJobs.status,
        progress: optimizationJobs.progress,
        inputHash: optimizationJobs.inputHash,
        configurationId: optimizationJobs.configurationId,
        configurationName: optimizationConfigurations.name,
        createdAt: optimizationJobs.createdAt,
        startedAt: optimizationJobs.startedAt,
        completedAt: optimizationJobs.completedAt,
      })
      .from(optimizationJobs)
      .leftJoin(optimizationConfigurations, eq(optimizationJobs.configurationId, optimizationConfigurations.id))
      .where(
        and(
          eq(optimizationJobs.companyId, tenantCtx.companyId),
          eq(optimizationJobs.status, "COMPLETED"),
        ),
      )
      .orderBy(desc(optimizationJobs.completedAt))
      .limit(limit)
      .offset(offset);

    // Batch-fetch metrics for all jobs at once (avoids N+1)
    const jobIds = jobs.map((job) => job.id);
    const allMetrics =
      jobIds.length > 0
        ? await db
            .select()
            .from(planMetrics)
            .where(inArray(planMetrics.jobId, jobIds))
        : [];

    const metricsMap = new Map(
      allMetrics.map((m) => [m.jobId, m]),
    );

    const plansWithMetrics = jobs.map((job) => ({
      ...job,
      metrics: metricsMap.get(job.id) || null,
    }));

    // Get total count efficiently with COUNT(*)
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)` })
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
        total,
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
