import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * Realistic full day: 25 orders, 2 vehicles with a mandatory lunch
 * break 12:00-13:00. Workday 08:00-18:00. Tests that the combined
 * "break + workday + service time" constraints produce a feasible
 * plan at moderate scale.
 */
export const scenario: Scenario = {
  name: "20-full-day-with-break",
  description: "25 orders across a 08:00-18:00 workday with 12:00-13:00 break",
  orders: Array.from({ length: 25 }, (_, i) =>
    makeOrder(i, { serviceTime: 420 }),
  ),
  vehicles: [
    makeVehicle(1, {
      timeWindowStart: "08:00",
      timeWindowEnd: "18:00",
      hasBreakTime: true,
      breakDuration: 60,
      breakTimeStart: "12:00",
      breakTimeEnd: "13:00",
      maxWeight: 9999,
    }),
    makeVehicle(2, {
      timeWindowStart: "08:00",
      timeWindowEnd: "18:00",
      hasBreakTime: true,
      breakDuration: 60,
      breakTimeStart: "12:00",
      breakTimeEnd: "13:00",
      maxWeight: 9999,
    }),
  ],
  config: baseConfig(),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 1,
    maxRoutes: 2,
  },
};
