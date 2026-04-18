import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * Zone-restricted vehicles modeled via skills. At the adapter level we
 * cannot pass zone-vehicle associations directly, so we encode geography
 * as skills: "NORTE" and "SUR". Each vehicle has its zone skill; each
 * order requires its zone skill. A solver that tries to cross zones
 * would show SKILL_MISSING violations.
 */
export const scenario: Scenario = {
  name: "17-zone-by-skill-proxy",
  description: "2 zones modeled via required skills; vehicles can't cross",
  orders: [
    ...Array.from({ length: 6 }, (_, i) =>
      makeOrder(i, { skillsRequired: ["NORTE"] }),
    ),
    ...Array.from({ length: 6 }, (_, i) =>
      makeOrder(i + 6, { skillsRequired: ["SUR"] }),
    ),
  ],
  vehicles: [
    makeVehicle(1, { skills: ["NORTE"] }),
    makeVehicle(2, { skills: ["SUR"] }),
  ],
  config: baseConfig(),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 2,
    maxRoutes: 2,
  },
};
