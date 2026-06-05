import { describe, expect, mock, test } from "bun:test";
import {
  parseRequiredSkills,
  serializeRequiredSkills,
} from "@/lib/orders/required-skills";

/**
 * `orders.required_skills` is a plain CSV text column. Every reader must parse
 * it like the solver does (split/trim/filter) — never JSON.parse, which threw a
 * SyntaxError on values like "REFRIGERADO, FRAGIL" and tumbled the whole run.
 */
describe("parseRequiredSkills", () => {
  test("splits a CSV of codes, trims, drops empties", () => {
    expect(parseRequiredSkills("REFRIGERADO, FRAGIL")).toEqual([
      "REFRIGERADO",
      "FRAGIL",
    ]);
  });

  test("does not uppercase — codes are kept verbatim to match vehicle skills", () => {
    expect(parseRequiredSkills("refrigerado, Fragil")).toEqual([
      "refrigerado",
      "Fragil",
    ]);
  });

  test("empty / null / undefined → []", () => {
    expect(parseRequiredSkills("")).toEqual([]);
    expect(parseRequiredSkills(null)).toEqual([]);
    expect(parseRequiredSkills(undefined)).toEqual([]);
    expect(parseRequiredSkills(" , ,, ")).toEqual([]);
  });

  test("round-trips through serializeRequiredSkills", () => {
    const csv = serializeRequiredSkills(["REFRIGERADO", "FRAGIL"]);
    expect(csv).toBe("REFRIGERADO, FRAGIL");
    expect(parseRequiredSkills(csv)).toEqual(["REFRIGERADO", "FRAGIL"]);
  });
});

// ── Regression: getRequiredSkillsForRoute must not throw on a CSV ──────────
// It is private; we reach it via the exported `assignDriversToRoutes`, which
// calls it directly. The DB is stubbed so the order row carries a CSV string,
// exactly the shape that used to crash JSON.parse.

mock.module("@/db", () => ({
  db: {
    query: {
      users: {
        findMany: async () => [
          {
            id: "driver-1",
            name: "Ana",
            companyId: "co-1",
            driverStatus: "AVAILABLE",
            primaryFleetId: "fleet-1",
            licenseExpiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
            licenseCategories: "A-IIb",
            primaryFleet: { id: "fleet-1" },
            userSkills: [
              {
                skill: {
                  id: "uuid-1",
                  code: "REFRIGERADO",
                  name: "Refrigerado",
                },
                expiresAt: null,
              },
            ],
            availability: [],
            secondaryFleets: [],
          },
        ],
      },
      vehicles: {
        findFirst: async () => ({
          id: "veh-1",
          licenseRequired: null,
          vehicleFleets: [{ fleetId: "fleet-1", fleet: { id: "fleet-1" } }],
        }),
      },
      orders: {
        findMany: async () => [
          {
            id: "order-1",
            companyId: "co-1",
            requiredSkills: "REFRIGERADO, FRAGIL",
          },
        ],
      },
    },
  },
}));

const { assignDriversToRoutes } = await import(
  "@/lib/routing/driver-assignment"
);

describe("assignDriversToRoutes (getRequiredSkillsForRoute regression)", () => {
  test("does not throw on a CSV required_skills value", async () => {
    const promise = assignDriversToRoutes([
      {
        companyId: "co-1",
        vehicleId: "veh-1",
        routeStops: [{ orderId: "order-1" }],
        candidateDriverIds: ["driver-1"],
        assignedDrivers: new Map(),
      },
    ]);

    await expect(promise).resolves.toBeInstanceOf(Map);
    const result = await promise;
    expect(result.get("veh-1")?.driverId).toBe("driver-1");
  });
});
