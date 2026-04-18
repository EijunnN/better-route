import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * routeEndMode=OPEN_END — vehicle does not return to the depot. Last
 * stop is the end of route. Total distance should not include a
 * return leg; the verifier should not flag anything extra.
 */
export const scenario: Scenario = {
  name: "25-open-end-mode",
  description: "10 orders with OPEN_END route mode — no return to depot",
  orders: Array.from({ length: 10 }, (_, i) => makeOrder(i)),
  vehicles: [makeVehicle(1)],
  config: baseConfig({ routeEndMode: "OPEN_END" }),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 1,
    maxRoutes: 1,
  },
};
