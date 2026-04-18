import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * Realistic morning import size. 200 orders with mixed weights +
 * occasional time windows, 10 vehicles. Validates that both solvers
 * (VROOM especially) handle CLARO-scale inputs without timing out or
 * producing corrupt routes. PyVRP may run up against its default
 * timeout on this case — that's expected and documented.
 */
export const scenario: Scenario = {
  name: "22-200-orders-real-scale",
  description: "200 orders, 10 vehicles, mixed constraints — real morning import",
  orders: Array.from({ length: 200 }, (_, i) => {
    const hasWindow = i % 4 === 0; // 25% have a TW
    return makeOrder(i, {
      weightRequired: 5 + (i % 20) * 3, // 5..62 kg
      volumeRequired: 1 + (i % 5),
      ...(hasWindow && {
        timeWindowStart: i % 8 < 4 ? "09:00" : "14:00",
        timeWindowEnd: i % 8 < 4 ? "12:00" : "17:00",
      }),
    });
  }),
  vehicles: Array.from({ length: 10 }, (_, i) =>
    makeVehicle(i + 1, {
      timeWindowStart: "08:00",
      timeWindowEnd: "18:00",
      maxWeight: 1500,
      maxVolume: 50,
      maxOrders: 30,
    }),
  ),
  config: baseConfig({ timeoutMs: 120000 }),
  expected: {
    maxHardViolations: 0,
    // At this scale we allow some unassigned — not every combo of
    // window + capacity fits.
    maxUnassigned: 40,
    minRoutes: 3,
    maxRoutes: 10,
  },
};
