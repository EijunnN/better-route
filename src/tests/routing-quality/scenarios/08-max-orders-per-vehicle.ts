import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * 20 orders, 3 vehicles each limited to 7 orders. Weight is abundant.
 * Binding constraint is maxOrders, not weight. Solver should split roughly 7+7+6.
 */
export const scenario: Scenario = {
  name: "08-max-orders-per-vehicle",
  description: "maxOrders limit forces distribution across vehicles",
  orders: Array.from({ length: 20 }, (_, i) => makeOrder(i)),
  vehicles: [
    makeVehicle(1, { maxOrders: 7, maxWeight: 9999 }),
    makeVehicle(2, { maxOrders: 7, maxWeight: 9999 }),
    makeVehicle(3, { maxOrders: 7, maxWeight: 9999 }),
  ],
  config: baseConfig(),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 2,
    maxRoutes: 3,
  },
};
