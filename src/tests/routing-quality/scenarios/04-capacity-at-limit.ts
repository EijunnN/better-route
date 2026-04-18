import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * 10 orders each weighing 100kg. 2 vehicles with 500kg capacity each.
 * Total demand = 1000kg, total capacity = 1000kg — exactly at the limit.
 * Solver must split orders 5+5 across the two vehicles.
 */
export const scenario: Scenario = {
  name: "04-capacity-at-limit",
  description: "10 orders × 100kg, 2 vehicles × 500kg — exactly at limit",
  orders: Array.from({ length: 10 }, (_, i) =>
    makeOrder(i, { weightRequired: 100 }),
  ),
  vehicles: [
    makeVehicle(1, { maxWeight: 500 }),
    makeVehicle(2, { maxWeight: 500 }),
  ],
  config: baseConfig(),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 2,
    maxRoutes: 2,
  },
};
