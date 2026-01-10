import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationJobs } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/tenant";
import { cancelJob as cancelJobQueue } from "@/lib/job-queue";
import { eq, and } from "drizzle-orm";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// GET - Get job status
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json({ error: "Missing tenant context" }, { status: 401 });
  }

  setTenantContext(tenantCtx);

  try {
    const job = await db.query.optimizationJobs.findFirst({
      where: and(
        eq(optimizationJobs.id, params.id),
        withTenantFilter(optimizationJobs)
      ),
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Parse result if available
    let parsedResult = null;
    if (job.result) {
      try {
        parsedResult = JSON.parse(job.result);
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
      { status: 500 }
    );
  }
}

// DELETE - Cancel running job
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json({ error: "Missing tenant context" }, { status: 401 });
  }

  setTenantContext(tenantCtx);

  try {
    // Check if job exists and belongs to tenant
    const job = await db.query.optimizationJobs.findFirst({
      where: and(
        eq(optimizationJobs.id, params.id),
        withTenantFilter(optimizationJobs)
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
        { status: 400 }
      );
    }

    // Attempt to cancel the job
    const cancelled = await cancelJobQueue(params.id);

    if (!cancelled) {
      return NextResponse.json(
        { error: "Failed to cancel job - job may have already completed" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      data: {
        id: params.id,
        status: "CANCELLED",
        message: "Job cancelled successfully",
      },
    });
  } catch (error) {
    console.error("Error cancelling job:", error);
    return NextResponse.json(
      { error: "Failed to cancel job" },
      { status: 500 }
    );
  }
}
