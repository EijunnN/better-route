import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * Scale test: 50 orders, 5 vehicles, no constraints. Measures whether both solvers
 * scale reasonably and produce valid plans.
 */
export const scenario: Scenario = {
  name: "12-stress-50-orders",
  description: "Scale test — 50 orders, 5 vehicles",
  orders: Array.from({ length: 50 }, (_, i) => makeOrder(i)),
  vehicles: [
    makeVehicle(1),
    makeVehicle(2),
    makeVehicle(3),
    makeVehicle(4),
    makeVehicle(5),
  ],
  config: baseConfig(),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 1,
    maxRoutes: 5,
  },
};
