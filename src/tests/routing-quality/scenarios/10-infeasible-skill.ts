import type { Scenario } from "../types";
import { baseConfig, makeOrder, makeVehicle } from "../fixtures";

/**
 * 5 orders require HAZMAT skill, but NO vehicle has it.
 * Solver MUST return these as unassigned with a sensible reason.
 * The other 5 orders (no skill) should be assigned.
 */
export const scenario: Scenario = {
  name: "10-infeasible-skill",
  description: "Orders require skill no vehicle provides — must unassign",
  orders: [
    ...Array.from({ length: 5 }, (_, i) =>
      makeOrder(i, { skillsRequired: ["HAZMAT"] }),
    ),
    ...Array.from({ length: 5 }, (_, i) => makeOrder(i + 5)),
  ],
  vehicles: [
    makeVehicle(1, { skills: ["REFRIGERATED"] }),
    makeVehicle(2, { skills: [] }),
  ],
  config: baseConfig(),
  expected: {
    // 5 orders must be unassigned — acceptable, expected
    maxHardViolations: 0,
    maxUnassigned: 5,
    minRoutes: 1,
    maxRoutes: 2,
    infeasible: true,
  },
};
