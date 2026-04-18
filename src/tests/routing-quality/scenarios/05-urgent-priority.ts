import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * 15 orders, 1 vehicle with capacity for only 10.
 * 3 orders are URGENT / priority=100 — these MUST be assigned.
 * The solver will have to leave 5 orders unassigned; those 5 must NOT be the URGENT ones.
 */
export const scenario: Scenario = {
  name: "05-urgent-priority",
  description: "Capacity-constrained: URGENT orders must prevail",
  orders: [
    ...Array.from({ length: 3 }, (_, i) =>
      makeOrder(i, {
        weightRequired: 50,
        priority: 100,
        orderType: "URGENT",
      }),
    ),
    ...Array.from({ length: 12 }, (_, i) =>
      makeOrder(i + 3, {
        weightRequired: 50,
        priority: 30,
        orderType: "NEW",
      }),
    ),
  ],
  vehicles: [makeVehicle(1, { maxWeight: 500 })], // fits 10 orders
  config: baseConfig(),
  expected: {
    // We can't force 0 unassigned (it's overcapacity by design)
    maxHardViolations: 0,
    maxUnassigned: 5, // some orders will be left out — acceptable
    minRoutes: 1,
    maxRoutes: 1,
  },
};
