/**
 * Canonical Solved Plan module.
 *
 * Single source of truth for the shape of an optimizer output across the
 * entire pipeline (solver → driver assignment → aggregation → verification
 * → persistence). See docs/CONTEXT.md → "Shapes canónicos del solver output".
 */

export type {
  AggregatedPlan,
  AssignedSolvedRoute,
  AssignmentMetrics,
  CapacityDimension,
  CapacityUsage,
  DriverWithoutRoute,
  OptimizationObjective,
  PlanLevelMetrics,
  PlanSummary,
  RawSolvedRoute,
  SolvedStop,
  UnassignedOrderRecord,
  VehicleWithoutRoute,
  VerificationReport,
  VerifiedPlan,
  Violation,
  ViolationSeverity,
} from "./types";

export {
  aggregatedPlanSchema,
  assertPersistableVerifiedPlan,
  assignedSolvedRouteSchema,
  capacityUsageSchema,
  parseRawSolvedRoute,
  parseVerifiedPlan,
  rawSolvedRouteSchema,
  solvedStopSchema,
  verificationReportSchema,
  verifiedPlanSchema,
} from "./schemas";
