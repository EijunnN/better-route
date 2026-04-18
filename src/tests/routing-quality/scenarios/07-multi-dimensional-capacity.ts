import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * 10 orders, heavy but low-volume. Vehicle has TIGHT weight, LOOSE volume.
 * Plus 10 orders light-weight high-volume. Vehicle volume will be the binding constraint.
 *
 * Purpose: confirm multi-dimensional capacity is enforced when weight fits but volume doesn't.
 */
export const scenario: Scenario = {
  name: "07-multi-dimensional-capacity",
  description: "Mixed weight/volume demands — both dimensions matter",
  orders: [
    ...Array.from({ length: 10 }, (_, i) =>
      makeOrder(i, { weightRequired: 80, volumeRequired: 2 }),
    ),
    ...Array.from({ length: 10 }, (_, i) =>
      makeOrder(i + 10, { weightRequired: 5, volumeRequired: 20 }),
    ),
  ],
  vehicles: [
    makeVehicle(1, { maxWeight: 900, maxVolume: 120 }),
    makeVehicle(2, { maxWeight: 900, maxVolume: 120 }),
  ],
  config: baseConfig(),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 1,
    maxRoutes: 2,
  },
};
