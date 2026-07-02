import { describe, expect, test } from "bun:test";
import {
  type AssignmentRouteInput,
  checkDriverAssignments,
} from "@/lib/optimization/verifier";

function route(
  overrides: Partial<AssignmentRouteInput> = {},
): AssignmentRouteInput {
  return {
    vehicleId: "veh-1",
    vehicleIdentifier: "TRUCK-1",
    driverId: "drv-1",
    driverName: "Ana Tester",
    stopCount: 5,
    assignmentQuality: { score: 100, warnings: [], errors: [] },
    ...overrides,
  };
}

describe("checkDriverAssignments", () => {
  test("clean route with a driver and no issues produces no violations", () => {
    const v = checkDriverAssignments([route()]);
    expect(v).toEqual([]);
  });

  test("route with stops but no driver → ROUTE_WITHOUT_DRIVER (HARD)", () => {
    const v = checkDriverAssignments([
      route({ driverId: undefined, driverName: undefined, stopCount: 8 }),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].code).toBe("ROUTE_WITHOUT_DRIVER");
    expect(v[0].severity).toBe("HARD");
    expect(v[0].message).toContain("8");
  });

  test("empty route without driver is NOT flagged", () => {
    const v = checkDriverAssignments([
      route({ driverId: undefined, driverName: undefined, stopCount: 0 }),
    ]);
    expect(v).toEqual([]);
  });

  test.each([
    ["LICENSE_EXPIRED", "DRIVER_LICENSE_MISMATCH"],
    ["LICENSE_EXPIRY_MISSING", "DRIVER_LICENSE_MISMATCH"],
    ["LICENSE_CATEGORY_MISMATCH", "DRIVER_LICENSE_MISMATCH"],
    ["MISSING_SKILLS", "DRIVER_SKILL_MISSING"],
    ["DRIVER_UNAVAILABLE", "DRIVER_UNAVAILABLE"],
    ["DRIVER_NOT_FOUND", "DRIVER_ASSIGNMENT_ERROR"],
    ["VEHICLE_NOT_FOUND", "DRIVER_ASSIGNMENT_ERROR"],
  ] as const)(
    "error code %s maps to violation %s (HARD)",
    (errorCode, violationCode) => {
      const v = checkDriverAssignments([
        route({
          assignmentQuality: {
            score: 40,
            warnings: [],
            errors: [{ code: errorCode, message: "detalle para UI" }],
          },
        }),
      ]);
      expect(v).toHaveLength(1);
      expect(v[0].code).toBe(violationCode);
      expect(v[0].severity).toBe("HARD");
      expect(v[0].message).toBe("detalle para UI");
    },
  );

  test("warnings map to DRIVER_ASSIGNMENT_WARNING SOFT", () => {
    const v = checkDriverAssignments([
      route({
        assignmentQuality: {
          score: 80,
          warnings: ["License expires in 15 days"],
          errors: [],
        },
      }),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].code).toBe("DRIVER_ASSIGNMENT_WARNING");
    expect(v[0].severity).toBe("SOFT");
  });

  test("mixed errors and warnings preserve both", () => {
    const v = checkDriverAssignments([
      route({
        assignmentQuality: {
          score: 60,
          warnings: ["License expires in 20 days", "Skill X expired"],
          errors: [
            {
              code: "LICENSE_EXPIRED",
              message: "Driver's license has expired",
            },
          ],
        },
      }),
    ]);
    expect(v).toHaveLength(3);
    const hard = v.filter((x) => x.severity === "HARD");
    const soft = v.filter((x) => x.severity === "SOFT");
    expect(hard).toHaveLength(1);
    expect(soft).toHaveLength(2);
  });

  test("multiple routes aggregate violations with vehicle context", () => {
    const v = checkDriverAssignments([
      route({
        vehicleId: "veh-a",
        vehicleIdentifier: "TRUCK-A",
        driverId: undefined,
        driverName: undefined,
        stopCount: 2,
      }),
      route({
        vehicleId: "veh-b",
        vehicleIdentifier: "TRUCK-B",
        assignmentQuality: {
          score: 50,
          warnings: [],
          errors: [
            {
              code: "MISSING_SKILLS",
              message: "Driver missing required skills: HAZMAT",
            },
          ],
        },
      }),
    ]);
    expect(v).toHaveLength(2);
    expect(v[0].vehicleIdentifier).toBe("TRUCK-A");
    expect(v[0].code).toBe("ROUTE_WITHOUT_DRIVER");
    expect(v[1].vehicleIdentifier).toBe("TRUCK-B");
    expect(v[1].code).toBe("DRIVER_SKILL_MISSING");
  });
});
