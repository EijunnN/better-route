import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { type OPTIMIZATION_JOB_STATUS, optimizationJobs } from "@/db/schema";

import { safeParseJson } from "@/lib/utils/safe-json";
// Job queue state (in-memory for simplicity, can be migrated to Redis/BullMQ later)
interface JobState {
  id: string;
  status: keyof typeof OPTIMIZATION_JOB_STATUS;
  abortController: AbortController | null;
  timeoutHandle: NodeJS.Timeout | null;
}

const activeJobs = new Map<string, JobState>();
const MAX_CONCURRENT_JOBS = 3; // Configurable concurrency limit

// Per-company lock to prevent concurrent optimizations using the same PENDING orders
const companyOptimizationLocks = new Map<string, string>(); // companyId -> jobId

/**
 * Calculate input hash for result caching
 */
export function calculateInputHash(
  configurationId: string,
  vehicleIds: string[],
  driverIds: string[],
  pendingOrderIds: string[],
): string {
  const data = JSON.stringify({
    configurationId,
    vehicleIds: vehicleIds.sort(),
    driverIds: driverIds.sort(),
    pendingOrderIds: pendingOrderIds.sort(),
  });
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Check if a job can be started based on concurrency limits
 */
export function canStartJob(): boolean {
  const runningCount = Array.from(activeJobs.values()).filter(
    (job) => job.status === "RUNNING",
  ).length;
  return runningCount < MAX_CONCURRENT_JOBS;
}

/**
 * Acquire a per-company optimization lock.
 * Prevents two simultaneous optimizations from using the same PENDING orders.
 * Returns true if lock acquired, false if another optimization is running for this company.
 */
export function acquireCompanyLock(companyId: string, jobId: string): boolean {
  const existingJobId = companyOptimizationLocks.get(companyId);
  if (existingJobId) {
    // Check if the existing job is still active
    const existingJob = activeJobs.get(existingJobId);
    if (existingJob && existingJob.status === "RUNNING") {
      return false; // Another optimization is running for this company
    }
    // Stale lock, clean it up
    companyOptimizationLocks.delete(companyId);
  }
  companyOptimizationLocks.set(companyId, jobId);
  return true;
}

/**
 * Release a per-company optimization lock.
 */
export function releaseCompanyLock(companyId: string, jobId: string): void {
  const currentLockHolder = companyOptimizationLocks.get(companyId);
  if (currentLockHolder === jobId) {
    companyOptimizationLocks.delete(companyId);
  }
}

/**
 * Get active job count by status
 */
export function getActiveJobCount(): number {
  return Array.from(activeJobs.values()).filter(
    (job) => job.status === "RUNNING",
  ).length;
}

/**
 * Register a job in the queue
 */
export function registerJob(
  jobId: string,
  abortController: AbortController,
): void {
  activeJobs.set(jobId, {
    id: jobId,
    status: "RUNNING",
    abortController,
    timeoutHandle: null,
  });
}

/**
 * Unregister a job from the queue
 */
export function unregisterJob(jobId: string): void {
  const job = activeJobs.get(jobId);
  if (job?.timeoutHandle) {
    clearTimeout(job.timeoutHandle);
  }
  if (job?.abortController) {
    job.abortController.abort();
  }
  activeJobs.delete(jobId);
}

/**
 * Set timeout for a job
 */
export function setJobTimeout(
  jobId: string,
  timeoutMs: number,
  onTimeout: () => void,
): void {
  const job = activeJobs.get(jobId);
  if (!job) return;

  if (job.timeoutHandle) {
    clearTimeout(job.timeoutHandle);
  }

  job.timeoutHandle = setTimeout(() => {
    onTimeout();
  }, timeoutMs);
}

/**
 * Cancel a running job with optional partial results
 */
export async function cancelJob(
  jobId: string,
  partialResults?: unknown,
): Promise<boolean> {
  const job = activeJobs.get(jobId);
  if (!job) {
    return false; // Job not found or not running
  }

  // Abort the job execution
  if (job.abortController) {
    job.abortController.abort();
  }

  // Clear timeout if exists
  if (job.timeoutHandle) {
    clearTimeout(job.timeoutHandle);
  }

  // Update job status in database with optional partial results
  const updateData: {
    status: "CANCELLED";
    cancelledAt: Date;
    updatedAt: Date;
    result?: unknown;
  } = {
    status: "CANCELLED",
    cancelledAt: new Date(),
    updatedAt: new Date(),
  };

  // Save partial results if provided
  if (partialResults) {
    updateData.result = partialResults;
  }

  await db
    .update(optimizationJobs)
    .set(updateData)
    .where(eq(optimizationJobs.id, jobId));

  // Remove from active jobs
  unregisterJob(jobId);

  return true;
}

/**
 * Update job progress
 */
export async function updateJobProgress(
  jobId: string,
  progress: number,
): Promise<void> {
  await db
    .update(optimizationJobs)
    .set({
      progress: Math.min(100, Math.max(0, progress)),
      updatedAt: new Date(),
    })
    .where(eq(optimizationJobs.id, jobId));
}

/**
 * Complete a job with results
 */
export async function completeJob(
  jobId: string,
  result: unknown,
): Promise<void> {
  await db
    .update(optimizationJobs)
    .set({
      status: "COMPLETED",
      progress: 100,
      result,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(optimizationJobs.id, jobId));

  unregisterJob(jobId);
}

/**
 * Fail a job with error message
 */
export async function failJob(jobId: string, error: string): Promise<void> {
  await db
    .update(optimizationJobs)
    .set({
      status: "FAILED",
      error,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(optimizationJobs.id, jobId));

  unregisterJob(jobId);
}

/**
 * Check for cached results with matching input hash
 */
export async function getCachedResult(
  inputHash: string,
  companyId: string,
): Promise<unknown | null> {
  const cached = await db.query.optimizationJobs.findFirst({
    where: and(
      eq(optimizationJobs.inputHash, inputHash),
      eq(optimizationJobs.companyId, companyId),
      eq(optimizationJobs.status, "COMPLETED"),
    ),
    orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
  });

  if (cached?.result) {
    try {
      return safeParseJson(cached.result);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Get job status from database
 */
export async function getJobStatus(jobId: string) {
  return await db.query.optimizationJobs.findFirst({
    where: eq(optimizationJobs.id, jobId),
  });
}

/**
 * Check if job is aborting
 */
export function isJobAborting(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  return job?.abortController?.signal.aborted ?? false;
}

/**
 * Recover stale jobs on server startup.
 * Marks any RUNNING jobs as FAILED since they were interrupted by a restart.
 */
export async function recoverStaleJobs(): Promise<void> {
  try {
    const staleJobs = await db
      .update(optimizationJobs)
      .set({
        status: "FAILED",
        error: "Job interrupted by server restart",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(optimizationJobs.status, "RUNNING"))
      .returning({ id: optimizationJobs.id });

    if (staleJobs.length > 0) {
      console.log(
        `[Job Recovery] Marked ${staleJobs.length} stale RUNNING jobs as FAILED:`,
        staleJobs.map((j) => j.id),
      );
    }
  } catch (error) {
    console.error("[Job Recovery] Failed to recover stale jobs:", error);
  }
}
