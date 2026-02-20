import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationJobs } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { cancelJob as cancelJobQueue } from "@/lib/infra/job-queue";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";

import { safeParseJson } from "@/lib/utils/safe-json";
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

// DELETE - Cancel running job
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

    // Check if job can be cancelled
    if (job.status !== "PENDING" && job.status !== "RUNNING") {
      return NextResponse.json(
        {
          error: "Job cannot be cancelled",
          reason: `Job is in ${job.status} state`,
        },
        { status: 400 },
      );
    }

    // Attempt to cancel the job
    const cancelled = await cancelJobQueue(id);

    if (!cancelled) {
      return NextResponse.json(
        { error: "Failed to cancel job - job may have already completed" },
        { status: 400 },
      );
    }

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
