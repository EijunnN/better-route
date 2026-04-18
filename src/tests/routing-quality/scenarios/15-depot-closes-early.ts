import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle, LIMA_DEPOT } from "../fixtures";

/**
 * Depot closes at 16:00 even though vehicles can work until 18:00.
 * A vehicle that returns to depot must make it back by 16:00, so
 * effective workday is shorter than the vehicle's stated window.
 * Tests that the solver respects the depot-level window, not just
 * the vehicle workday.
 */
export const scenario: Scenario = {
  name: "15-depot-closes-early",
  description: "Depot 08:00-16:00, vehicle 08:00-18:00 — depot window binds",
  orders: Array.from({ length: 15 }, (_, i) => makeOrder(i, { serviceTime: 600 })),
  vehicles: [
    makeVehicle(1, {
      timeWindowStart: "08:00",
      timeWindowEnd: "18:00",
      maxWeight: 9999,
    }),
  ],
  config: baseConfig({
    depot: {
      ...LIMA_DEPOT,
      timeWindowStart: "08:00",
      timeWindowEnd: "16:00",
    },
  }),
  expected: {
    maxHardViolations: 0,
    // Fewer orders can fit than the vehicle could in isolation —
    // any excess should appear as unassigned, not as late arrivals.
    maxUnassigned: 15,
    minRoutes: 0,
    maxRoutes: 1,
  },
};
