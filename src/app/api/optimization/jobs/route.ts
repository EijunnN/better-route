import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { after } from "next/server";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationConfigurations, optimizationJobs } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { logCreate } from "@/lib/infra/audit";
import { createAndExecuteJob } from "@/lib/optimization/optimization-runner";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  optimizationJobCreateSchema,
  optimizationJobQuerySchema,
} from "@/lib/validations/optimization-job";

import { extractTenantContext } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

// GET - List optimization jobs
export async function GET(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);
  const { searchParams } = new URL(request.url);

  try {
    const authResult = await requireRoutePermission(request, EntityType.OPTIMIZATION_JOB, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

    const query = optimizationJobQuerySchema.parse(
      Object.fromEntries(searchParams),
    );

    const conditions = [
      withTenantFilter(optimizationJobs, [], tenantCtx.companyId),
    ];

    if (query.status) {
      conditions.push(eq(optimizationJobs.status, query.status));
    }

    if (query.search) {
      conditions.push(
        ilike(optimizationConfigurations.name, `%${query.search}%`),
      );
    }

    // Always JOIN with configurations to get name and support search
    const joinClause = eq(
      optimizationJobs.configurationId,
      optimizationConfigurations.id,
    );

    // Execute paginated query and count in parallel
    const [jobs, [{ count }]] = await Promise.all([
      db
        .select({
          id: optimizationJobs.id,
          configurationId: optimizationJobs.configurationId,
          configurationName: optimizationConfigurations.name,
          status: optimizationJobs.status,
          progress: optimizationJobs.progress,
          result: optimizationJobs.result,
          error: optimizationJobs.error,
          startedAt: optimizationJobs.startedAt,
          completedAt: optimizationJobs.completedAt,
          cancelledAt: optimizationJobs.cancelledAt,
          timeoutMs: optimizationJobs.timeoutMs,
          createdAt: optimizationJobs.createdAt,
          updatedAt: optimizationJobs.updatedAt,
        })
        .from(optimizationJobs)
        .leftJoin(optimizationConfigurations, joinClause)
        .where(and(...conditions))
        .orderBy(desc(optimizationJobs.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(optimizationJobs)
        .leftJoin(optimizationConfigurations, joinClause)
        .where(and(...conditions)),
    ]);

    return NextResponse.json({
      data: jobs,
      meta: {
        total: count,
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (error) {
    after(() => console.error("Error fetching optimization jobs:", error));
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 },
    );
  }
}

// POST - Create and start optimization job
export async function POST(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    const authResult = await requireRoutePermission(request, EntityType.OPTIMIZATION_JOB, Action.CREATE);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const data = optimizationJobCreateSchema.parse(body);

    // Verify configuration exists and belongs to tenant
    const config = await db.query.optimizationConfigurations.findFirst({
      where: and(
        eq(optimizationConfigurations.id, data.configurationId),
        withTenantFilter(optimizationConfigurations, [], tenantCtx.companyId),
      ),
    });

    if (!config) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 },
      );
    }

    // Create and execute job
    const { jobId, cached } = await createAndExecuteJob(
      {
        configurationId: data.configurationId,
        companyId: tenantCtx.companyId,
        vehicleIds: data.vehicleIds,
        driverIds: data.driverIds,
      },
      data.timeoutMs,
    );

    // Log job creation (non-blocking)
    after(async () => {
      await logCreate("optimization_job", jobId, {
        configurationId: data.configurationId,
        vehicleCount: data.vehicleIds.length,
        driverCount: data.driverIds.length,
        cached,
      });
    });

    return NextResponse.json(
      {
        data: {
          id: jobId,
          cached,
          message: cached
            ? "Returned cached optimization result"
            : "Optimization job started",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error) {
      // Handle known errors
      if (error.message.includes("Maximum concurrent jobs")) {
        return NextResponse.json(
          { error: error.message },
          { status: 429 }, // Too Many Requests
        );
      }
    }
    after(() => console.error("Error creating optimization job:", error));
    return NextResponse.json(
      { error: "Failed to create optimization job" },
      { status: 500 },
    );
  }
}
