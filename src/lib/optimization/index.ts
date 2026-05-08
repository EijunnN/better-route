/**
 * Optimization Module — public surface.
 *
 * The canonical solver-output shapes live in `solved-plan/`; the verifier
 * exposes its own input shapes for callers that need to verify a plan.
 * VROOM is the only supported solver — the previous `IOptimizer` /
 * `VroomAdapter` / `optimizer-factory` indirection was deleted as a
 * hypothetical seam.
 */

export type {
  AggregatedPlan,
  AssignedSolvedRoute,
  CapacityDimension,
  CapacityUsage,
  RawSolvedRoute,
  SolvedStop,
  UnassignedOrderRecord,
  VerificationReport,
  VerifiedPlan,
  Violation,
  ViolationSeverity,
} from "./solved-plan";
