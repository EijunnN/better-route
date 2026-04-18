import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * Narrow "exact time" windows — simulates the EXACT preset type
 * (e.g. "deliver at 10:00 ± 15 min"). 5 orders with 30-min windows
 * spread across the day. Vehicle can do them but must respect each
 * narrow slot.
 */
export const scenario: Scenario = {
  name: "16-exact-time-tolerance",
  description: "5 orders with 30-minute windows at specific times",
  orders: [
    makeOrder(0, { timeWindowStart: "09:45", timeWindowEnd: "10:15" }),
    makeOrder(1, { timeWindowStart: "11:15", timeWindowEnd: "11:45" }),
    makeOrder(2, { timeWindowStart: "13:00", timeWindowEnd: "13:30" }),
    makeOrder(3, { timeWindowStart: "15:00", timeWindowEnd: "15:30" }),
    makeOrder(4, { timeWindowStart: "16:30", timeWindowEnd: "17:00" }),
  ],
  vehicles: [
    makeVehicle(1, { timeWindowStart: "08:00", timeWindowEnd: "18:00" }),
  ],
  config: baseConfig(),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 1,
    maxRoutes: 1,
  },
};
