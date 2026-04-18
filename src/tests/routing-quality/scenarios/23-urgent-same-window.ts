import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * Contention on a narrow window: 13 orders all with 14:00-16:00 window,
 * 3 marked URGENT. 1 vehicle with limited capacity can only do ~8 in
 * that 2-hour slot. The URGENT orders must be in the assigned 8, not
 * the unassigned 5.
 */
export const scenario: Scenario = {
  name: "23-urgent-same-window",
  description: "3 URGENT + 10 NEW all at 14:00-16:00; URGENT must prevail",
  orders: [
    ...Array.from({ length: 3 }, (_, i) =>
      makeOrder(i, {
        timeWindowStart: "14:00",
        timeWindowEnd: "16:00",
        serviceTime: 600,
        orderType: "URGENT",
        priority: 100,
      }),
    ),
    ...Array.from({ length: 10 }, (_, i) =>
      makeOrder(i + 3, {
        timeWindowStart: "14:00",
        timeWindowEnd: "16:00",
        serviceTime: 600,
        orderType: "NEW",
        priority: 30,
      }),
    ),
  ],
  vehicles: [
    makeVehicle(1, {
      timeWindowStart: "08:00",
      timeWindowEnd: "18:00",
      maxWeight: 9999,
    }),
  ],
  config: baseConfig(),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 10,
    minRoutes: 1,
    maxRoutes: 1,
  },
};
