import type { AggregatedPlan, ViolationSeverity } from "../solved-plan";
import type { OptimizerConfig, OptimizerOrder, OptimizerVehicle } from "./input-types";

export type { ViolationSeverity };

export type ViolationCode =
  | "TIME_WINDOW_VIOLATED"
  | "TIME_WINDOW_MISSING_ON_OUTPUT"
  | "VEHICLE_WORKDAY_EXCEEDED"
  | "SKILL_MISSING"
  | "CAPACITY_EXCEEDED_WEIGHT"
  | "CAPACITY_EXCEEDED_VOLUME"
  | "CAPACITY_EXCEEDED_VALUE"
  | "CAPACITY_EXCEEDED_UNITS"
  | "MAX_ORDERS_EXCEEDED"
  | "BREAK_TIME_NOT_TAKEN"
  | "PRIORITY_INVERSION"
  | "MAX_DISTANCE_EXCEEDED"
  | "MAX_TRAVEL_TIME_EXCEEDED"
  | "UNASSIGNED_ORDER"
  | "DUPLICATE_ORDER_ASSIGNMENT"
  | "MISSING_ORDER"
  | "INVALID_SEQUENCE"
  | "UNKNOWN_ORDER_ID"
  | "UNKNOWN_VEHICLE_ID"
  // Driver-assignment concerns (validated against the runner's per-route
  // assignmentQuality output produced by assignDriversToRoutes + validateDriverAssignment).
  | "DRIVER_ASSIGNMENT_ERROR"
  | "DRIVER_ASSIGNMENT_WARNING"
  | "ROUTE_WITHOUT_DRIVER"
  | "DRIVER_LICENSE_MISMATCH"
  | "DRIVER_SKILL_MISSING"
  | "DRIVER_UNAVAILABLE";

/**
 * Verifier-internal violation shape. Uses `ViolationCode` (typed enum) for
 * exhaustive coverage in checkers. Structurally assignable to the canonical
 * `Violation` from solved-plan where `code: string`.
 */
export interface Violation {
  code: ViolationCode;
  severity: ViolationSeverity;
  message: string;
  vehicleId?: string;
  vehicleIdentifier?: string;
  orderId?: string;
  trackingId?: string;
  stopSequence?: number;
  expected?: string | number;
  actual?: string | number;
  /** Arbitrary debugging metadata (raw values, computed deltas, etc.). */
  context?: Record<string, unknown>;
}

export interface VerifierInput {
  orders: OptimizerOrder[];
  vehicles: OptimizerVehicle[];
  config: OptimizerConfig;
  /** The aggregated solver output to validate. */
  plan: AggregatedPlan;
}

/**
 * A single verifier function takes the full VerifierInput and returns
 * any violations it detects. Verifiers never throw — they report.
 */
export type VerifierFn = (input: VerifierInput) => Violation[];
