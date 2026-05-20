/**
 * Process-level primitives for async jobs.
 *
 * In-memory concurrency limit, per-company locks, abort controllers and
 * timeout watchdogs. **No DB knowledge** — domain-specific persistence
 * (transitions on `optimization_jobs`, cache lookups, etc.) lives in
 * `lib/optimization/optimization-job/`.
 */

import type { OPTIMIZATION_JOB_STATUS } from "@/db/schema";

interface JobState {
  id: string;
  status: keyof typeof OPTIMIZATION_JOB_STATUS;
  abortController: AbortController | null;
  timeoutHandle: NodeJS.Timeout | null;
}

const activeJobs = new Map<string, JobState>();
const MAX_CONCURRENT_JOBS = 3;

// Per-company lock — prevents two simultaneous optimizations from using
// the same PENDING orders. Lock persists after job completion until
// confirmation (or 5-min stale fallback).
interface CompanyLock {
  jobId: string;
  acquiredAt: Date;
  completedAt?: Date;
}
const companyOptimizationLocks = new Map<string, CompanyLock>();
const STALE_RUNNING_TIMEOUT_MS = 10 * 60 * 1000;

// ─── Concurrency ──────────────────────────────────────────────────────

export function canStartJob(): boolean {
  const runningCount = Array.from(activeJobs.values()).filter(
    (job) => job.status === "RUNNING",
  ).length;
  return runningCount < MAX_CONCURRENT_JOBS;
}

export function getActiveJobCount(): number {
  return Array.from(activeJobs.values()).filter(
    (job) => job.status === "RUNNING",
  ).length;
}

// ─── Per-company lock ─────────────────────────────────────────────────

export function acquireCompanyLock(companyId: string, jobId: string): boolean {
  const existing = companyOptimizationLocks.get(companyId);
  if (existing) {
    const now = Date.now();

    const existingJob = activeJobs.get(existing.jobId);
    if (existingJob && existingJob.status === "RUNNING") {
      const runningElapsed = now - existing.acquiredAt.getTime();
      if (runningElapsed < STALE_RUNNING_TIMEOUT_MS) {
        return false; // genuinely running
      }
      console.warn(
        `[JobQueue] Stale running lock detected for company ${companyId}, job ${existing.jobId} (running ${Math.round(runningElapsed / 1000)}s). Releasing.`,
      );
      activeJobs.delete(existing.jobId);
    }

    if (!existingJob) {
      console.warn(
        `[JobQueue] Orphaned lock detected for company ${companyId}, job ${existing.jobId}. Releasing.`,
      );
      companyOptimizationLocks.delete(companyId);
      companyOptimizationLocks.set(companyId, {
        jobId,
        acquiredAt: new Date(),
      });
      return true;
    }

    if (existing.completedAt) {
      const elapsed = now - existing.completedAt.getTime();
      if (elapsed < 5 * 60 * 1000) {
        return false; // awaiting confirmation
      }
    }

    companyOptimizationLocks.delete(companyId);
  }
  companyOptimizationLocks.set(companyId, { jobId, acquiredAt: new Date() });
  return true;
}

export function releaseCompanyLock(companyId: string, jobId: string): void {
  const current = companyOptimizationLocks.get(companyId);
  if (current?.jobId === jobId) {
    companyOptimizationLocks.delete(companyId);
  }
}

/** Release regardless of jobId. Use when deleting history or fixing stuck locks. */
export function forceReleaseCompanyLock(companyId: string): void {
  companyOptimizationLocks.delete(companyId);
}

export function markCompanyLockCompleted(
  companyId: string,
  jobId: string,
): void {
  const current = companyOptimizationLocks.get(companyId);
  if (current?.jobId === jobId) {
    current.completedAt = new Date();
  }
}

// ─── Job registration + abort ─────────────────────────────────────────

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
  job.timeoutHandle = setTimeout(onTimeout, timeoutMs);
}

export function isJobAborting(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  return job?.abortController?.signal.aborted ?? false;
}

/**
 * Process-level cancel: trigger the abort signal and clear the watchdog.
 * Returns true if the job was tracked, false if unknown. Does NOT touch
 * the DB — the domain layer (`cancelOptimizationJob`) handles persistence.
 */
export function cancelJobControl(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (!job) return false;
  if (job.abortController) {
    job.abortController.abort();
  }
  if (job.timeoutHandle) {
    clearTimeout(job.timeoutHandle);
  }
  return true;
}
