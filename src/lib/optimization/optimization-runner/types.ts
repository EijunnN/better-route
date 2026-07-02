/**
 * Runner-level types.
 *
 * The output shapes (route, stop, full result) live in `solved-plan` and are
 * re-exported here for callers that prefer to import from the runner module.
 *
 * The runner is responsible for producing a `VerifiedPlan` end-to-end.
 */

export type {
  AggregatedPlan,
  AssignedSolvedRoute,
  RawSolvedRoute,
  SolvedStop,
  UnassignedOrderRecord,
  VerifiedPlan,
} from "../solved-plan";

export interface OptimizationInput {
  configurationId: string;
  companyId: string;
  vehicleIds: string[];
  driverIds: string[];
}
