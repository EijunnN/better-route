/**
 * Partial plans captured when a job is cancelled mid-run, keyed by jobId.
 *
 * The old implementation parked the snapshot in a single
 * `globalThis.__partialOptimizationResult` slot — with concurrent jobs from
 * different companies, two overlapping cancellations could persist company
 * A's partial routes into company B's job (cross-tenant leak).
 */

import type { AggregatedPlan, VerificationReport } from "../solved-plan";

export type PartialPlan = AggregatedPlan & {
  verification?: VerificationReport;
};

const partialResults = new Map<string, PartialPlan>();

export function setPartialResult(jobId: string, plan: PartialPlan): void {
  partialResults.set(jobId, plan);
}

/** Read-and-delete: a partial snapshot is consumed exactly once. */
export function takePartialResult(jobId: string): PartialPlan | undefined {
  const plan = partialResults.get(jobId);
  partialResults.delete(jobId);
  return plan;
}
