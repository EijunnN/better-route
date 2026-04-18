import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * Mix of URGENT, RESCHEDULED, NEW. Capacity fits all. Tests that the solver
 * doesn't leave high-priority orders unassigned when capacity is ample.
 */
export const scenario: Scenario = {
  name: "11-mixed-priorities",
  description: "Mixed orderTypes — all must be assigned when capacity suffices",
  orders: [
    ...Array.from({ length: 4 }, (_, i) =>
      makeOrder(i, { orderType: "URGENT", priority: 95 }),
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      makeOrder(i + 4, { orderType: "RESCHEDULED", priority: 70 }),
    ),
    ...Array.from({ length: 8 }, (_, i) =>
      makeOrder(i + 8, { orderType: "NEW", priority: 30 }),
    ),
  ],
  vehicles: [makeVehicle(1), makeVehicle(2)],
  config: baseConfig(),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 1,
    maxRoutes: 2,
  },
};
