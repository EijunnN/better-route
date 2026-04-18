import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * maxDistanceKm=30 forces the solver to split orders across vehicles
 * even when weight/volume would fit a single route. Lima points are
 * scattered enough that a "visit all 15 in one go" route easily
 * exceeds 30 km including the return leg.
 */
export const scenario: Scenario = {
  name: "24-max-distance-km-tight",
  description: "15 orders with a 30km per-route distance cap",
  orders: Array.from({ length: 15 }, (_, i) => makeOrder(i)),
  vehicles: [
    makeVehicle(1, { maxWeight: 9999 }),
    makeVehicle(2, { maxWeight: 9999 }),
    makeVehicle(3, { maxWeight: 9999 }),
  ],
  config: baseConfig({ maxDistanceKm: 30 }),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 15,
    minRoutes: 1,
    maxRoutes: 3,
  },
};
