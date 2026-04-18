import type {
  OptimizerOrder,
  OptimizerVehicle,
  OptimizerConfig,
  OptimizationResult,
} from "../optimizer-interface";

export type ViolationSeverity = "HARD" | "SOFT" | "INFO";

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
  /** Arbitrary extra context for debugging (e.g. time values, matrices). */
  context?: Record<string, unknown>;
}

export interface VerifierInput {
  orders: OptimizerOrder[];
  vehicles: OptimizerVehicle[];
  config: OptimizerConfig;
  result: OptimizationResult;
}

export interface VerifierReport {
  optimizer: string;
  violations: Violation[];
  summary: {
    hard: number;
    soft: number;
    info: number;
    byCode: Record<string, number>;
  };
  totals: {
    ordersInput: number;
    ordersAssigned: number;
    ordersUnassigned: number;
    routes: number;
  };
}

/**
 * A single verifier function takes the full VerifierInput and returns
 * any violations it detects. Verifiers never throw — they report.
 */
export type VerifierFn = (input: VerifierInput) => Violation[];
