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
// Lock persists after job completion until confirmation or 30-min timeout
interface CompanyLock {
  jobId: string;
  acquiredAt: Date; // When the lock was acquired
  completedAt?: Date; // Set when job completes, used for stale detection
}
const companyOptimizationLocks = new Map<string, CompanyLock>(); // companyId -> lock info
const STALE_RUNNING_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes - if a job is still "running" after this, consider it stale

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
 * Lock persists after job completion until confirmation or 30-min fallback timeout.
 * Returns true if lock acquired, false if another optimization holds the lock.
 */
export function acquireCompanyLock(companyId: string, jobId: string): boolean {
  const existing = companyOptimizationLocks.get(companyId);
  if (existing) {
    const now = Date.now();

    // Check if the existing job is still actively running
    const existingJob = activeJobs.get(existing.jobId);
    if (existingJob && existingJob.status === "RUNNING") {
      // But if it's been running too long, it's probably stuck — release it
      const runningElapsed = now - existing.acquiredAt.getTime();
      if (runningElapsed < STALE_RUNNING_TIMEOUT_MS) {
        return false; // Another optimization is genuinely running
      }
      console.warn(`[JobQueue] Stale running lock detected for company ${companyId}, job ${existing.jobId} (running ${Math.round(runningElapsed / 1000)}s). Releasing.`);
      // Clean up the stale job
      activeJobs.delete(existing.jobId);
    }

    // If the job completed but lock is still held (awaiting confirmation),
    // check if it's been more than 30 minutes (stale fallback)
    if (existing.completedAt) {
      const elapsed = now - existing.completedAt.getTime();
      if (elapsed < 5 * 60 * 1000) {
        return false; // Lock still held, awaiting confirmation (5 min window)
      }
    }

    // Stale lock, clean it up
    companyOptimizationLocks.delete(companyId);
  }
  companyOptimizationLocks.set(companyId, { jobId, acquiredAt: new Date() });
  return true;
}

/**
 * Release a per-company optimization lock.
 */
export function releaseCompanyLock(companyId: string, jobId: string): void {
  const current = companyOptimizationLocks.get(companyId);
  if (current?.jobId === jobId) {
    companyOptimizationLocks.delete(companyId);
  }
}

/**
 * Mark a company lock as completed (job finished, awaiting confirmation).
 */
export function markCompanyLockCompleted(companyId: string, jobId: string): void {
  const current = companyOptimizationLocks.get(companyId);
  if (current?.jobId === jobId) {
    current.completedAt = new Date();
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
