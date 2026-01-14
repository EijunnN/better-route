import { and, desc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationConfigurations, optimizationJobs } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { logCreate } from "@/lib/audit";
import { createAndExecuteJob } from "@/lib/optimization-runner";
import { setTenantContext } from "@/lib/tenant";
import {
  optimizationJobCreateSchema,
  optimizationJobQuerySchema,
} from "@/lib/validations/optimization-job";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

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
    const query = optimizationJobQuerySchema.parse(
      Object.fromEntries(searchParams),
    );

    const conditions = [withTenantFilter(optimizationJobs)];

    if (query.status) {
      conditions.push(eq(optimizationJobs.status, query.status));
    }

    const jobs = await db
      .select({
        id: optimizationJobs.id,
        configurationId: optimizationJobs.configurationId,
        status: optimizationJobs.status,
        progress: optimizationJobs.progress,
        error: optimizationJobs.error,
        startedAt: optimizationJobs.startedAt,
        completedAt: optimizationJobs.completedAt,
        cancelledAt: optimizationJobs.cancelledAt,
        timeoutMs: optimizationJobs.timeoutMs,
        createdAt: optimizationJobs.createdAt,
        updatedAt: optimizationJobs.updatedAt,
      })
      .from(optimizationJobs)
      .where(and(...conditions))
      .orderBy(desc(optimizationJobs.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(optimizationJobs)
      .where(and(...conditions));

    return NextResponse.json({
      data: jobs,
      meta: {
        total: count,
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (error) {
    console.error("Error fetching optimization jobs:", error);
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
    const body = await request.json();
    const data = optimizationJobCreateSchema.parse(body);

    // Verify configuration exists and belongs to tenant
    const config = await db.query.optimizationConfigurations.findFirst({
      where: and(
        eq(optimizationConfigurations.id, data.configurationId),
        withTenantFilter(optimizationConfigurations),
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

    // Log job creation
    await logCreate("optimization_job", jobId, {
      configurationId: data.configurationId,
      vehicleCount: data.vehicleIds.length,
      driverCount: data.driverIds.length,
      cached,
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
    console.error("Error creating optimization job:", error);
    return NextResponse.json(
      { error: "Failed to create optimization job" },
      { status: 500 },
    );
  }
}
