import type { Scenario } from "../types";
import { defaultProfileSchema } from "@/lib/orders/profile-schema";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * Company profile with VALUE dimension active. Orders carry a
 * monetary valorizado (orderValue), vehicles have a maxValueCapacity
 * cap instead of weight. Mirrors a "high-value goods" fleet like
 * phones/electronics where the constraint is $, not kg.
 */
const valueProfile = {
  ...defaultProfileSchema("test-company"),
  activeDimensions: ["VALUE"] as const,
};

export const scenario: Scenario = {
  name: "18-value-dimension-active",
  description: "VALUE dimension — orders have orderValue, vehicles have maxValueCapacity",
  orders: Array.from({ length: 10 }, (_, i) =>
    makeOrder(i, {
      weightRequired: 1, // irrelevant
      volumeRequired: 0,
      orderValue: 100_000, // 1,000 soles (céntimos)
    }),
  ),
  vehicles: [
    makeVehicle(1, {
      maxWeight: 9999,
      maxVolume: 9999,
      maxValueCapacity: 500_000, // fits 5 orders
    }),
    makeVehicle(2, {
      maxWeight: 9999,
      maxVolume: 9999,
      maxValueCapacity: 500_000,
    }),
  ],
  config: baseConfig({
    // biome-ignore lint/suspicious/noExplicitAny: readonly tuple from const asserion
    profile: valueProfile as any,
  }),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 2,
    maxRoutes: 2,
  },
};
