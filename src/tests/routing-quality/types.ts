import type {
  OptimizerConfig,
  OptimizerOrder,
  OptimizerVehicle,
} from "@/lib/optimization/optimizer-interface";

export interface ScenarioExpectations {
  /** Maximum tolerated HARD violations. Default 0. */
  maxHardViolations?: number;
  /** Maximum tolerated SOFT violations. Default infinite (not checked). */
  maxSoftViolations?: number;
  /** Maximum orders allowed to be unassigned. Default 0. */
  maxUnassigned?: number;
  /** Minimum expected routes (e.g. >= 1). */
  minRoutes?: number;
  /** Maximum expected routes (e.g. "should fit in 2 vehicles"). */
  maxRoutes?: number;
  /** Scenarios built specifically to be infeasible set this true. */
  infeasible?: boolean;
}

export interface Scenario {
  name: string;
  description: string;
  orders: OptimizerOrder[];
  vehicles: OptimizerVehicle[];
  config: OptimizerConfig;
  expected: ScenarioExpectations;
}
