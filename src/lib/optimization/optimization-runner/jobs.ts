import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  optimizationJobs,
  orders,
} from "@/db/schema";
import {
  acquireCompanyLock,
  calculateInputHash,
  cancelJob,
  canStartJob,
  completeJob,
  failJob,
  getCachedResult,
  isJobAborting,
  markCompanyLockCompleted,
  registerJob,
  releaseCompanyLock,
  setJobTimeout,
} from "../../infra/job-queue";
import type { OptimizationInput } from "./types";
import { runOptimization } from "./run";
import { sleep } from "./utils";

// Re-export sleep to preserve the original `jobs.ts` surface described in the spec
export { sleep };

/**
 * Create and execute an optimization job
 */
export async function createAndExecuteJob(
  input: OptimizationInput,
  timeoutMs: number = 300000, // 5 minutes default
): Promise<{ jobId: string; cached: boolean }> {
  // Calculate input hash for caching
  const pendingOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.companyId, input.companyId),
      eq(orders.status, "PENDING"),
      eq(orders.active, true),
    ),
  });

  const inputHash = calculateInputHash(
    input.configurationId,
    input.vehicleIds,
    input.driverIds,
    pendingOrders.map((o) => o.id),
  );

  // Check for cached results
  const cachedResult = await getCachedResult(inputHash, input.companyId);
  if (cachedResult) {
    // Return cached job without creating a new one
    // The caller should look up the cached job by inputHash
    const cachedJob = await db.query.optimizationJobs.findFirst({
      where: and(
        eq(optimizationJobs.inputHash, inputHash),
        eq(optimizationJobs.companyId, input.companyId),
        eq(optimizationJobs.status, "COMPLETED"),
      ),
      orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
    });

    if (cachedJob) {
      return { jobId: cachedJob.id, cached: true };
    }
  }

  // Check concurrency limit
  if (!canStartJob()) {
    throw new Error("Maximum concurrent jobs reached. Please try again later.");
  }

  // Create abort controller for this job
  const abortController = new AbortController();

  // Create new job in database
  const [newJob] = await db
    .insert(optimizationJobs)
    .values({
      companyId: input.companyId,
      configurationId: input.configurationId,
      status: "PENDING",
      inputHash,
      timeoutMs,
    })
    .returning();

  const jobId = newJob.id;

  // Acquire per-company lock to prevent concurrent optimizations
  // using the same PENDING orders
  if (!acquireCompanyLock(input.companyId, jobId)) {
    // Another optimization is running for this company - fail this job
    await db
      .update(optimizationJobs)
      .set({ status: "FAILED", error: "Another optimization is already running for this company. Please wait for it to finish.", updatedAt: new Date() })
      .where(eq(optimizationJobs.id, jobId));
    throw new Error("Ya hay una optimización en ejecución para esta empresa. Espera a que termine.");
  }

  // Register job in queue
  registerJob(jobId, abortController);

  // Set timeout
  setJobTimeout(jobId, timeoutMs, async () => {
    releaseCompanyLock(input.companyId, jobId);
    await failJob(jobId, "Optimization timed out");
  });

  // Execute optimization asynchronously
  (async () => {
    try {
      // Update job status to running
      await db
        .update(optimizationJobs)
        .set({ status: "RUNNING", startedAt: new Date(), updatedAt: new Date() })
        .where(eq(optimizationJobs.id, jobId));

      // Run optimization
      const result = await runOptimization(
        input,
        abortController.signal,
        jobId,
      );

      // Complete job - mark lock as completed (awaiting confirmation)
      // Lock will be released on confirmation or after 30 min stale fallback
      await completeJob(jobId, result);
      markCompanyLockCompleted(input.companyId, jobId);
    } catch (error) {
      releaseCompanyLock(input.companyId, jobId);
      if (isJobAborting(jobId)) {
        // Get partial results if available
        const partialResults = globalThis.__partialOptimizationResult;
        await cancelJob(jobId, partialResults);
        // Clean up global state
        globalThis.__partialOptimizationResult = undefined;
      } else {
        await failJob(
          jobId,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
    }
  })();

  return { jobId, cached: false };
}
