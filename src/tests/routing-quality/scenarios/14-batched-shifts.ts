import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * Morning + afternoon batching at real shift scale (40 orders).
 * 20 orders have MAÑANA 08:00-12:00 windows, 20 have TARDE 14:00-18:00.
 * 3 vehicles with full workday. The solver should batch by shift
 * without splitting orders into the wrong half of the day.
 */
export const scenario: Scenario = {
  name: "14-batched-shifts",
  description: "40 orders across two shifts (MAÑANA / TARDE), 3 vehicles full-day",
  orders: [
    ...Array.from({ length: 20 }, (_, i) =>
      makeOrder(i, {
        timeWindowStart: "08:00",
        timeWindowEnd: "12:00",
      }),
    ),
    ...Array.from({ length: 20 }, (_, i) =>
      makeOrder(i + 20, {
        timeWindowStart: "14:00",
        timeWindowEnd: "18:00",
      }),
    ),
  ],
  vehicles: [
    makeVehicle(1, { timeWindowStart: "08:00", timeWindowEnd: "18:00", maxWeight: 9999 }),
    makeVehicle(2, { timeWindowStart: "08:00", timeWindowEnd: "18:00", maxWeight: 9999 }),
    makeVehicle(3, { timeWindowStart: "08:00", timeWindowEnd: "18:00", maxWeight: 9999 }),
  ],
  config: baseConfig(),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 1,
    maxRoutes: 3,
  },
};
