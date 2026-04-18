import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * Flex-mode time windows. Same inputs as scenario 02 but with
 * flexibleTimeWindows=true — the solver is allowed ±30 min slack.
 * The verifier should still flag no HARD violations (flex extends the
 * windows the solver uses), but the scenario validates that enabling
 * flex does not degrade correctness on otherwise-tight windows.
 */
export const scenario: Scenario = {
  name: "13-soft-time-windows",
  description: "Tight windows with flexibleTimeWindows=true — solver gets ±30min",
  orders: [
    ...Array.from({ length: 8 }, (_, i) =>
      makeOrder(i, {
        timeWindowStart: "09:00",
        timeWindowEnd: "11:00",
      }),
    ),
    ...Array.from({ length: 8 }, (_, i) =>
      makeOrder(i + 8, {
        timeWindowStart: "15:00",
        timeWindowEnd: "17:00",
      }),
    ),
  ],
  vehicles: [
    makeVehicle(1, { timeWindowStart: "08:00", timeWindowEnd: "18:00" }),
    makeVehicle(2, { timeWindowStart: "08:00", timeWindowEnd: "18:00" }),
  ],
  config: baseConfig({ flexibleTimeWindows: true }),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 1,
    maxRoutes: 2,
  },
};
