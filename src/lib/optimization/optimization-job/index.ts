/**
 * `optimization-job` — owns the OptimizationJob lifecycle.
 *
 * See `lifecycle.ts` for the state machine diagram and transition rules.
 *
 * What lives here:
 *   - createAndExecuteJob — the orchestrator (POST /api/optimization/jobs)
 *   - cancelOptimizationJob — DELETE /api/optimization/jobs/:id
 *   - completeJob, failJob, updateJobProgress — runner-internal transitions
 *   - getJobStatus — DB read
 *   - getCachedResult, calculateInputHash — cache primitives
 *   - recoverStaleJobs — server startup recovery
 *
 * What does NOT live here (in `infra/job-queue.ts`):
 *   - In-memory concurrency limit + active-job tracking
 *   - Per-company locks
 *   - Abort controller registration / signal propagation
 *   - Timeout watchdogs
 *
 * That separation lets the lifecycle module own everything that touches
 * the `optimization_jobs` table or knows the OptimizationConfiguration /
 * VerifiedPlan shape, while the infra module stays a generic process-level
 * primitive that any future async work could reuse.
 */

export {
  calculateInputHash,
  cancelOptimizationJob,
  completeJob,
  createAndExecuteJob,
  failJob,
  getCachedResult,
  getJobStatus,
  recoverStaleJobs,
  updateJobProgress,
} from "./lifecycle";
