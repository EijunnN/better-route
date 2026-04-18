import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * Mixed fleet: 2 LIGHT vehicles (500 kg each) + 1 HEAVY (2000 kg).
 * 5 orders × 400 kg = 2000 kg total. The HEAVY should absorb most of
 * the load in a single route; splitting across the LIGHT vehicles is
 * technically feasible but worse.
 */
export const scenario: Scenario = {
  name: "19-mixed-fleet-heavy-light",
  description: "5 × 400kg orders, 2 LIGHT (500kg) + 1 HEAVY (2000kg)",
  orders: Array.from({ length: 5 }, (_, i) =>
    makeOrder(i, { weightRequired: 400 }),
  ),
  vehicles: [
    makeVehicle(1, { maxWeight: 500, identifier: "LIGHT-1" }),
    makeVehicle(2, { maxWeight: 500, identifier: "LIGHT-2" }),
    makeVehicle(3, { maxWeight: 2000, identifier: "HEAVY-1" }),
  ],
  config: baseConfig({ minimizeVehicles: true }),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    // Ideally 1 route on HEAVY; the solver is free to choose otherwise,
    // but we expect capacity constraints to be respected.
    minRoutes: 1,
    maxRoutes: 3,
  },
};
