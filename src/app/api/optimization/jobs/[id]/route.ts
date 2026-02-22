import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationJobs } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { cancelJob as cancelJobQueue, releaseCompanyLock } from "@/lib/infra/job-queue";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";

import { safeParseJson } from "@/lib/utils/safe-json";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";
// GET - Get job status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);
  const { id } = await params;

  try {
    const authResult = await requireRoutePermission(request, EntityType.OPTIMIZATION_JOB, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

    const job = await db.query.optimizationJobs.findFirst({
      where: and(
        eq(optimizationJobs.id, id),
        withTenantFilter(optimizationJobs, [], tenantCtx.companyId),
      ),
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Parse result if available
    let parsedResult = null;
    if (job.result) {
      try {
        parsedResult = safeParseJson(job.result);
      } catch {
        // If result is not valid JSON, return as-is
        parsedResult = job.result;
      }
    }

    return NextResponse.json({
      data: {
        id: job.id,
        configurationId: job.configurationId,
        status: job.status,
        progress: job.progress,
        result: parsedResult,
        error: job.error,
        startedAt: job.startedAt?.toISOString() || null,
        completedAt: job.completedAt?.toISOString() || null,
        cancelledAt: job.cancelledAt?.toISOString() || null,
        timeoutMs: job.timeoutMs,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching job status:", error);
    return NextResponse.json(
      { error: "Failed to fetch job status" },
      { status: 500 },
    );
  }
}

// DELETE - Cancel running job or delete completed job
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);
  const { id } = await params;

  try {
    const authResult = await requireRoutePermission(request, EntityType.OPTIMIZATION_JOB, Action.DELETE);
    if (authResult instanceof NextResponse) return authResult;

    // Check if job exists and belongs to tenant
    const job = await db.query.optimizationJobs.findFirst({
      where: and(
        eq(optimizationJobs.id, id),
        withTenantFilter(optimizationJobs, [], tenantCtx.companyId),
      ),
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // For COMPLETED/FAILED/CANCELLED jobs: soft-delete and release company lock
    if (job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED") {
      await db
        .update(optimizationJobs)
        .set({ status: "CANCELLED", cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(optimizationJobs.id, id));

      // Release the company lock so user can start a new optimization
      releaseCompanyLock(tenantCtx.companyId, id);

      return NextResponse.json({
        data: {
          id: id,
          status: "CANCELLED",
          message: "Job deleted and lock released",
        },
      });
    }

    // For PENDING/RUNNING jobs: cancel via queue
    const cancelled = await cancelJobQueue(id);

    if (!cancelled) {
      return NextResponse.json(
        { error: "Failed to cancel job - job may have already completed" },
        { status: 400 },
      );
    }

    // Release the company lock
    releaseCompanyLock(tenantCtx.companyId, id);

    return NextResponse.json({
      data: {
        id: id,
        status: "CANCELLED",
        message: "Job cancelled successfully",
      },
    });
  } catch (error) {
    console.error("Error cancelling job:", error);
    return NextResponse.json(
      { error: "Failed to cancel job" },
      { status: 500 },
    );
  }
}
