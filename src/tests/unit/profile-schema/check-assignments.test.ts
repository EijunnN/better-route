import { describe, test, expect } from "bun:test";
import {
  checkDriverAssignments,
  type AssignmentRouteInput,
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

  test("license error is classified as DRIVER_LICENSE_MISMATCH HARD", () => {
    const v = checkDriverAssignments([
      route({
        assignmentQuality: {
          score: 40,
          warnings: [],
          errors: ["Driver missing required license category: A-II"],
        },
      }),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].code).toBe("DRIVER_LICENSE_MISMATCH");
    expect(v[0].severity).toBe("HARD");
  });

  test("skill error is classified as DRIVER_SKILL_MISSING HARD", () => {
    const v = checkDriverAssignments([
      route({
        assignmentQuality: {
          score: 30,
          warnings: [],
          errors: ["Driver missing required skills: REFRIGERATED"],
        },
      }),
    ]);
    expect(v[0].code).toBe("DRIVER_SKILL_MISSING");
    expect(v[0].severity).toBe("HARD");
  });

  test("availability error is classified as DRIVER_UNAVAILABLE HARD", () => {
    const v = checkDriverAssignments([
      route({
        assignmentQuality: {
          score: 10,
          warnings: [],
          errors: ["Driver is unavailable"],
        },
      }),
    ]);
    expect(v[0].code).toBe("DRIVER_UNAVAILABLE");
    expect(v[0].severity).toBe("HARD");
  });

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

  test("unrecognized error string falls back to DRIVER_ASSIGNMENT_ERROR HARD", () => {
    const v = checkDriverAssignments([
      route({
        assignmentQuality: {
          score: 50,
          warnings: [],
          errors: ["Algo inesperado"],
        },
      }),
    ]);
    expect(v[0].code).toBe("DRIVER_ASSIGNMENT_ERROR");
    expect(v[0].severity).toBe("HARD");
  });

  test("mixed errors and warnings preserve both", () => {
    const v = checkDriverAssignments([
      route({
        assignmentQuality: {
          score: 60,
          warnings: ["License expires in 20 days", "Skill X expired"],
          errors: ["Driver's license has expired"],
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
          errors: ["Driver missing required skills: HAZMAT"],
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
