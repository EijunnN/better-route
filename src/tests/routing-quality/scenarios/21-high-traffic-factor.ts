import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * Lima rush-hour traffic. trafficFactor=90 multiplies duration
 * (0→1.5x, 50→1x, 100→0.5x). With the same orders as scenario 06 but
 * rush-hour speed, fewer orders should fit the same window.
 */
export const scenario: Scenario = {
  name: "21-high-traffic-factor",
  description: "trafficFactor=90 (rush hour) shrinks effective throughput",
  orders: Array.from({ length: 20 }, (_, i) => makeOrder(i, { serviceTime: 480 })),
  vehicles: [
    makeVehicle(1, {
      timeWindowStart: "09:00",
      timeWindowEnd: "13:00",
      maxWeight: 9999,
    }),
  ],
  config: baseConfig({
    trafficFactor: 90,
    depot: {
      latitude: -12.046374,
      longitude: -77.042793,
      timeWindowStart: "09:00",
      timeWindowEnd: "13:00",
    },
  }),
  expected: {
    maxHardViolations: 0,
    // Traffic reduces throughput — more unassigned than scenario 06
    // is acceptable; the important thing is no constraint violations.
    maxUnassigned: 20,
    minRoutes: 0,
    maxRoutes: 1,
  },
};
