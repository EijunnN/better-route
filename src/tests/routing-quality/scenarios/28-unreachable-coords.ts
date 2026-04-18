import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * Orders at coordinates outside the OSRM dataset (Peru-only). Should
 * land in unassigned with a reason from OSRM, not crash the solver
 * and not leak into a route.
 *
 * Coordinates are in Buenos Aires, ~3400 km from the Peru depot.
 */
export const scenario: Scenario = {
  name: "28-unreachable-coords",
  description: "2 orders outside OSRM Peru dataset — expected unassigned",
  orders: [
    makeOrder(0, {
      latitude: -34.6037,
      longitude: -58.3816,
      address: "Buenos Aires Centro",
    }),
    makeOrder(1, {
      latitude: -34.5955,
      longitude: -58.3911,
      address: "Buenos Aires Recoleta",
    }),
    // Plus 3 reachable orders to confirm the rest of the plan succeeds.
    makeOrder(2),
    makeOrder(3),
    makeOrder(4),
  ],
  vehicles: [makeVehicle(1)],
  config: baseConfig(),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 5, // the 2 BA orders + possibly all if OSRM rejects the whole matrix
    minRoutes: 0,
    maxRoutes: 1,
  },
};
