import type { Scenario } from "../types";
import { baseConfig, makeVehicle } from "../fixtures";

/**
 * Edge case: no orders to route. The solver should return an empty
 * result gracefully. The verifier should report zero violations and
 * zero routes without throwing.
 */
export const scenario: Scenario = {
  name: "27-zero-orders",
  description: "Empty order list — exercises the empty-input code path",
  orders: [],
  vehicles: [makeVehicle(1), makeVehicle(2)],
  config: baseConfig(),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 0,
    maxRoutes: 0,
  },
};
