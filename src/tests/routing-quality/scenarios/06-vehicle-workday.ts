import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * 20 orders, 1 vehicle with a narrow workday (09:00-13:00, 4 hours).
 * Tests whether the solver respects vehicle time windows.
 *
 * If it ignores workday, some stops will be after 13:00 → VEHICLE_WORKDAY_EXCEEDED.
 */
export const scenario: Scenario = {
  name: "06-vehicle-workday",
  description: "Narrow vehicle workday — stops must not spill past window",
  orders: Array.from({ length: 20 }, (_, i) =>
    makeOrder(i, { serviceTime: 600 }),
  ),
  vehicles: [
    makeVehicle(1, {
      timeWindowStart: "09:00",
      timeWindowEnd: "13:00",
      maxWeight: 9999,
    }),
  ],
  config: baseConfig({
    depot: {
      latitude: -12.046374,
      longitude: -77.042793,
      timeWindowStart: "09:00",
      timeWindowEnd: "13:00",
    },
  }),
  expected: {
    maxHardViolations: 0,
    // Vehicle physically cannot serve all 20 in 4 hours — some will be unassigned
    maxUnassigned: 20,
    minRoutes: 0,
    maxRoutes: 1,
  },
};
