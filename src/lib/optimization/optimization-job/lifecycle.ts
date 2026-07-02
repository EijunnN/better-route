/**
 * OptimizationJob lifecycle — domain-aware persistence operations and the
 * orchestrator that creates + executes a job end-to-end.
 *
 * State machine:
 *
 *     PENDING  ──createJobRow──>  RUNNING
 *                                    │
 *                  ┌─────────────────┼─────────────────┐
 *                  ▼                 ▼                 ▼
 *               COMPLETED         FAILED          CANCELLED
 *
 * Transitions:
 *   - PENDING → RUNNING: `createAndExecuteJob` inserts the row and
 *     schedules an async execution that immediately marks it RUNNING.
 *   - RUNNING → COMPLETED: `completeJob` (set on successful return from
 *     the runner; stores the canonical VerifiedPlan in `result`).
 *   - RUNNING → FAILED: `failJob` (set on thrown exception from the runner
 *     OR on the timeout watchdog).
 *   - RUNNING → CANCELLED: `cancelOptimizationJob` (set when the user
 *     aborts; the runner's partial snapshot is persisted in `result`).
 *
 * Terminal states (COMPLETED, FAILED, CANCELLED) never transition back.
 *
 * Process-level primitives — concurrency limits, in-memory locks, abort
 * controllers, timeouts — live in `infra/job-queue.ts`. This module owns
 * everything that touches the `optimization_jobs` table or knows about
 * the OptimizationConfiguration / VerifiedPlan domain shapes.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  optimizationConfigurations,
  optimizationJobs,
  orders,
} from "@/db/schema";
import {
  acquireCompanyLock,
  cancelJobControl,
  canStartJob,
  isJobAborting,
  markCompanyLockCompleted,
  registerJob,
  releaseCompanyLock,
  setJobTimeout,
  unregisterJob,
} from "@/lib/infra/job-queue";
import { safeParseJson } from "@/lib/utils/safe-json";
import { takePartialResult } from "../optimization-runner/partial-results";
import { runOptimization } from "../optimization-runner/run";
import type { OptimizationInput } from "../optimization-runner/types";
import { loadOptimizationPreset } from "../preset-config";
import { calculateInputHash } from "./input-hash";

export { calculateInputHash };

// ─── Hash + cache primitives ───────────────────────────────────────────

/**
 * Find a previously COMPLETED job with the same input hash. Returns the
 * parsed result if found, or null. Used to short-circuit re-runs.
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

// ─── Status transitions ────────────────────────────────────────────────

/**
 * RUNNING → COMPLETED. Persists the full VerifiedPlan in `result`.
 *
 * Guarded on status: if the watchdog already marked the job FAILED (or the
 * user cancelled) while the runner was finishing, the terminal state wins —
 * COMPLETED must never overwrite it.
 */
export async function completeJob(
  jobId: string,
  result: unknown,
): Promise<void> {
  const updated = await db
    .update(optimizationJobs)
    .set({
      status: "COMPLETED",
      progress: 100,
      result,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(optimizationJobs.id, jobId),
        eq(optimizationJobs.status, "RUNNING"),
      ),
    )
    .returning({ id: optimizationJobs.id });
  if (updated.length === 0) {
    console.warn(
      `[jobs] completeJob skipped: job ${jobId} is no longer RUNNING (timeout/cancel won the race)`,
    );
  }
  unregisterJob(jobId);
}

/**
 * PENDING/RUNNING → FAILED. Persists the error message in `error`.
 * Guarded on status so a late watchdog can't flip an already-terminal job.
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
    .where(
      and(
        eq(optimizationJobs.id, jobId),
        inArray(optimizationJobs.status, ["PENDING", "RUNNING"]),
      ),
    );
  unregisterJob(jobId);
}

/**
 * RUNNING → CANCELLED. Persists optional partial results.
 *
 * Returns true if the job was active and cancellation was scheduled, false
 * if the job was unknown (already terminal or never started).
 */
export async function cancelOptimizationJob(
  jobId: string,
  partialResults?: unknown,
): Promise<boolean> {
  const aborted = cancelJobControl(jobId);
  if (!aborted) return false;

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
  if (partialResults) {
    updateData.result = partialResults;
  }

  await db
    .update(optimizationJobs)
    .set(updateData)
    .where(
      and(
        eq(optimizationJobs.id, jobId),
        inArray(optimizationJobs.status, ["PENDING", "RUNNING"]),
      ),
    );

  unregisterJob(jobId);
  return true;
}

/**
 * Update progress percentage on a RUNNING job. Clamped to [0, 100].
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
 * Read current row from DB. Returns null if not found.
 */
export async function getJobStatus(jobId: string) {
  return await db.query.optimizationJobs.findFirst({
    where: eq(optimizationJobs.id, jobId),
  });
}

/**
 * Server-startup recovery: any RUNNING jobs left over from a crash get
 * marked FAILED so the UI doesn't show them as in-flight forever.
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

// ─── Orchestrator: create + execute ────────────────────────────────────

/**
 * Create a new OptimizationJob row, register it with the queue, and
 * execute the runner asynchronously. The function returns once the row
 * is registered; the runner's completion (or failure) is observed via
 * the job's status in the DB.
 *
 * Cache hit: if a previously-COMPLETED job exists with the same input
 * hash, returns its id with `cached: true` and does NOT create a new row.
 *
 * Concurrency: rejected if `MAX_CONCURRENT_JOBS` is reached, or if
 * another job is already running for the same company (per-company lock
 * is held until confirmation, with a stale-fallback timeout).
 */
export async function createAndExecuteJob(
  input: OptimizationInput,
  timeoutMs: number = 300000, // 5 minutes default
): Promise<{ jobId: string; cached: boolean }> {
  // Bounded-context invariant: a CONFIRMED OptimizationConfiguration
  // represents an already-finalised plan and cannot be re-optimised.
  // This used to live in the API route — moving it here ensures any caller
  // (mobile, scripts, future endpoints) gets the same guard.
  const config = await db.query.optimizationConfigurations.findFirst({
    where: eq(optimizationConfigurations.id, input.configurationId),
    columns: { status: true, selectedOrderIds: true, updatedAt: true },
  });
  if (!config) {
    throw new Error("Configuration not found");
  }
  if (config.status === "CONFIRMED") {
    throw new Error(
      "Esta configuración ya tiene un plan confirmado y no puede re-optimizarse.",
    );
  }

  // Cache lookup — same inputs as a prior COMPLETED job ⇒ reuse it.
  // Mismo filtro de pedidos que loadInputs: hash y run ven el mismo set.
  // El hash incluye updatedAt de pedidos/config/preset: editar coordenadas,
  // ventanas o el preset invalida el caché (antes devolvía planes viejos).
  const configOrderIds = config.selectedOrderIds ?? [];
  const pendingOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.companyId, input.companyId),
      eq(orders.status, "PENDING"),
      eq(orders.active, true),
      configOrderIds.length > 0
        ? inArray(orders.id, configOrderIds)
        : undefined,
    ),
  });
  const preset = await loadOptimizationPreset({
    companyId: input.companyId,
    configurationId: input.configurationId,
  });
  const inputHash = calculateInputHash(
    input.configurationId,
    input.vehicleIds,
    input.driverIds,
    pendingOrders.map((o) => ({ id: o.id, updatedAt: o.updatedAt })),
    {
      configurationUpdatedAt: config.updatedAt,
      presetUpdatedAt: preset?.updatedAt,
    },
  );
  const cachedResult = await getCachedResult(inputHash, input.companyId);
  if (cachedResult) {
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

  if (!canStartJob()) {
    throw new Error("Maximum concurrent jobs reached. Please try again later.");
  }

  const abortController = new AbortController();

  // PENDING row first — the async block below transitions it to RUNNING.
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

  // Per-company lock — prevents two simultaneous optimizations from
  // touching the same PENDING orders.
  if (!acquireCompanyLock(input.companyId, jobId)) {
    await db
      .update(optimizationJobs)
      .set({
        status: "FAILED",
        error:
          "Another optimization is already running for this company. Please wait for it to finish.",
        updatedAt: new Date(),
      })
      .where(eq(optimizationJobs.id, jobId));
    throw new Error(
      "Ya hay una optimización en ejecución para esta empresa. Espera a que termine.",
    );
  }

  registerJob(jobId, abortController);
  setJobTimeout(jobId, timeoutMs, async () => {
    releaseCompanyLock(input.companyId, jobId);
    await failJob(jobId, "Optimization timed out");
  });

  // Fire-and-forget execution. Status transitions are persisted by the
  // helpers above (completeJob / failJob / cancelOptimizationJob) which
  // also unregister the job from the in-memory queue.
  (async () => {
    try {
      await db
        .update(optimizationJobs)
        .set({
          status: "RUNNING",
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(optimizationJobs.id, jobId));

      const result = await runOptimization(
        input,
        abortController.signal,
        jobId,
      );

      await completeJob(jobId, result);
      // Lock stays held (with `completedAt` set) until the user confirms
      // or the 5-min stale fallback releases it.
      markCompanyLockCompleted(input.companyId, jobId);
    } catch (error) {
      releaseCompanyLock(input.companyId, jobId);
      if (isJobAborting(jobId)) {
        // Keyed by jobId — the old single global slot could leak another
        // company's partial routes under concurrent cancellations.
        const partialResults = takePartialResult(jobId);
        await cancelOptimizationJob(jobId, partialResults);
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
