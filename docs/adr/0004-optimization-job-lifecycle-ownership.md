# 0004. OptimizationJob lifecycle owned by its own module [Accepted]

Date: 2026-05-07
Status: Accepted

## Context

The OptimizationJob lifecycle was scattered across four locations:

| Location | What it did |
|---|---|
| `infra/job-queue.ts` | Concurrency limits, in-memory locks, abort controllers, **and** DB transitions (cancelJob, completeJob, failJob, etc.) |
| `optimization-runner/jobs.ts` | `createAndExecuteJob` orchestrator (cache lookup + insert + register + run async) |
| `optimization-runner/run.ts` | Status transitions during execution |
| `app/api/optimization/jobs/[id]/confirm/route.ts` | The DRAFT→CONFIGURED→CONFIRMED status check on the *configuration* (not the job) |

Symptoms:
- No single place documented the state machine
  (`PENDING → RUNNING → COMPLETED|FAILED|CANCELLED`).
- The "you can't re-optimize a CONFIRMED config" guard lived in an API
  route, leaking the bounded-context invariant into the HTTP layer.
- `infra/job-queue.ts` mixed generic process-level primitives
  (concurrency, locks) with optimization-specific DB writes.
- Mocking jobs in tests required mocking ~12 functions across two modules.

## Decision

Two clearly-separated modules:

**`lib/optimization/optimization-job/`** — owns the OptimizationJob domain.
- `lifecycle.ts`: state machine, DB transitions
  (`createAndExecuteJob`, `cancelOptimizationJob`, `completeJob`, `failJob`,
  `updateJobProgress`, `getJobStatus`, `getCachedResult`,
  `recoverStaleJobs`, `calculateInputHash`).
- The state machine is documented at the top of `lifecycle.ts` as a JSDoc
  diagram.
- The "you can't re-optimize a CONFIRMED config" guard runs inside
  `createAndExecuteJob`, not in the API route.

**`lib/infra/job-queue.ts`** — owns process-level primitives only.
- Concurrency limits (`canStartJob`, `getActiveJobCount`).
- Per-company locks (`acquireCompanyLock`, `releaseCompanyLock`,
  `markCompanyLockCompleted`, `forceReleaseCompanyLock`).
- Abort controller registration (`registerJob`, `unregisterJob`,
  `setJobTimeout`, `isJobAborting`, `cancelJobControl`).
- **No DB knowledge.** Reusable for any future async job type.

## Consequences

- **Single ownership.** The OptimizationJob state machine lives in one
  file with one diagram. Adding a new transition is a localized change.
- **The CONFIRMED guard is enforced for any caller.** Mobile, scripts,
  future endpoints — they all hit the same guard. The HTTP layer no
  longer carries domain rules.
- **Tests mock less.** `infra/job-queue` mocks only the in-memory
  primitives; `optimization-job/lifecycle` mocks the DB ops with no-ops
  plus a stub `createAndExecuteJob` that just inserts a PENDING row.
- **`infra/job-queue.ts` is now reusable.** If another bounded context
  needs async jobs, it can layer its own lifecycle module on top.
- **API routes are thinner.** Confirm/cancel routes call into
  `optimization-job/` instead of mixing infra and domain calls.
