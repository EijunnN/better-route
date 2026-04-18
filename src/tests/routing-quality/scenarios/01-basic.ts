import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * Baseline: 10 simple orders, 2 identical vehicles, no time windows, no skills.
 * Both solvers should produce a valid plan with 0 unassigned and 0 hard violations.
 */
export const scenario: Scenario = {
  name: "01-basic-10-orders",
  description: "10 orders, 2 vehicles, no constraints — smoke test",
  orders: Array.from({ length: 10 }, (_, i) => makeOrder(i)),
  vehicles: [makeVehicle(1), makeVehicle(2)],
  config: baseConfig(),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 1,
    maxRoutes: 2,
  },
};
