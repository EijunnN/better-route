import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * 8 orders with narrow morning windows, 8 with narrow afternoon windows.
 * 2 vehicles, full-day workday. Solver must respect order time windows.
 *
 * If a stop ends up scheduled outside its window, TIME_WINDOW_VIOLATED fires.
 */
export const scenario: Scenario = {
  name: "02-tight-time-windows",
  description: "16 orders split into strict morning and afternoon windows",
  orders: [
    ...Array.from({ length: 8 }, (_, i) =>
      makeOrder(i, {
        timeWindowStart: "08:00",
        timeWindowEnd: "11:00",
      }),
    ),
    ...Array.from({ length: 8 }, (_, i) =>
      makeOrder(i + 8, {
        timeWindowStart: "14:00",
        timeWindowEnd: "17:00",
      }),
    ),
  ],
  vehicles: [
    makeVehicle(1, { timeWindowStart: "08:00", timeWindowEnd: "18:00" }),
    makeVehicle(2, { timeWindowStart: "08:00", timeWindowEnd: "18:00" }),
  ],
  config: baseConfig(),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 1,
    maxRoutes: 2,
  },
};
