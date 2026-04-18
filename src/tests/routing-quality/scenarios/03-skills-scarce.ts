import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * 12 orders total: 4 require REFRIGERATED skill, 4 require LIFTING, 4 generic.
 * 3 vehicles: 1 refrigerated+lifting, 1 only lifting, 1 generic.
 *
 * Solver must assign REFRIGERATED orders exclusively to vehicle 1,
 * LIFTING orders to vehicle 1 or 2, and generic anywhere.
 */
export const scenario: Scenario = {
  name: "03-skills-scarce",
  description: "Skill-gated orders with limited capable vehicles",
  orders: [
    ...Array.from({ length: 4 }, (_, i) =>
      makeOrder(i, { skillsRequired: ["REFRIGERATED"] }),
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      makeOrder(i + 4, { skillsRequired: ["LIFTING"] }),
    ),
    ...Array.from({ length: 4 }, (_, i) => makeOrder(i + 8)),
  ],
  vehicles: [
    makeVehicle(1, { skills: ["REFRIGERATED", "LIFTING"] }),
    makeVehicle(2, { skills: ["LIFTING"] }),
    makeVehicle(3, { skills: [] }),
  ],
  config: baseConfig(),
  expected: {
    maxHardViolations: 0,
    maxUnassigned: 0,
    minRoutes: 1,
    maxRoutes: 3,
  },
};
