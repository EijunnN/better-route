import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * 15 orders, 1 vehicle with a mandatory lunch break 12:00-13:00.
 * Workday 08:00-18:00. Solver must schedule stops around the break.
 *
 * This scenario primarily surfaces whether the adapter even SENDS break_time
 * to the solver — we already know VROOM adapter does NOT (Gap #1).
 */
export const scenario: Scenario = {
  name: "09-break-time",
  description: "Mandatory lunch break 12:00-13:00 inside 08:00-18:00 workday",
  orders: Array.from({ length: 15 }, (_, i) =>
    makeOrder(i, { serviceTime: 600 }),
  ),
  vehicles: [
    makeVehicle(1, {
      maxWeight: 9999,
      timeWindowStart: "08:00",
      timeWindowEnd: "18:00",
      hasBreakTime: true,
      breakDuration: 60,
      breakTimeStart: "12:00",
      breakTimeEnd: "13:00",
    }),
  ],
  config: baseConfig({
    depot: {
      latitude: -12.046374,
      longitude: -77.042793,
      timeWindowStart: "08:00",
      timeWindowEnd: "18:00",
    },
  }),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 1,
    maxRoutes: 1,
  },
};
