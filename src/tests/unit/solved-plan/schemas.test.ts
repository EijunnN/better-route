import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";
import type {
  RawSolvedRoute,
  VerifiedPlan,
} from "@/lib/optimization/solved-plan";
import {
  assertPersistableVerifiedPlan,
  parseRawSolvedRoute,
  parseVerifiedPlan,
} from "@/lib/optimization/solved-plan/schemas";

/**
 * The Solved-Plan boundary parsers are the only place where Zod runs
 * inside the optimization pipeline. They must accept the canonical
 * shape and reject drift loudly.
 *
 * See ADR-0003 (canonical SolvedPlan).
 */

function validRawRoute(
  overrides: Partial<RawSolvedRoute> = {},
): RawSolvedRoute {
  return {
    routeId: "route-1",
    vehicleId: "veh-1",
    vehicleIdentifier: "ABC-123",
    stops: [
      {
        orderId: "order-1",
        trackingId: "TRK-1",
        sequence: 1,
        address: "Av. Test 123",
        latitude: -12.04,
        longitude: -77.04,
        estimatedArrival: "08:30",
      },
    ],
    totalDistance: 1200,
    totalDuration: 600,
    totalServiceTime: 200,
    totalTravelTime: 400,
    capacityUsed: { WEIGHT: 100 },
    utilizationPercentage: 45,
    timeWindowViolations: 0,
    ...overrides,
  };
}

function validVerifiedPlan(): VerifiedPlan {
  return {
    routes: [
      {
        ...validRawRoute(),
        driverId: "driver-1",
        driverName: "Juan",
        assignmentQuality: {
          score: 92,
          warnings: [],
          errors: [],
        },
      },
    ],
    unassignedOrders: [],
    driversWithoutRoutes: [],
    vehiclesWithoutRoutes: [],
    metrics: {
      totalRoutes: 1,
      totalStops: 1,
      totalDistance: 1200,
      totalDuration: 600,
      utilizationRate: 45,
      timeWindowComplianceRate: 100,
    },
    assignmentMetrics: {
      totalAssignments: 1,
      assignmentsWithWarnings: 0,
      assignmentsWithErrors: 0,
      averageScore: 92,
      skillCoverage: 100,
      licenseCompliance: 100,
      fleetAlignment: 100,
      workloadBalance: 100,
    },
    summary: {
      optimizedAt: "2026-05-08T10:00:00.000Z",
      objective: "BALANCED",
      processingTimeMs: 1500,
      engineUsed: "VROOM",
    },
    depot: { latitude: -12.0, longitude: -77.0 },
    verification: {
      optimizer: "VROOM",
      summary: { hard: 0, soft: 0, info: 0, byCode: {} },
      totals: {
        ordersInput: 1,
        ordersAssigned: 1,
        ordersUnassigned: 0,
        routes: 1,
      },
      violations: [],
    },
  };
}

describe("parseRawSolvedRoute", () => {
  test("accepts a canonical RawSolvedRoute", () => {
    const parsed = parseRawSolvedRoute(validRawRoute());
    expect(parsed.routeId).toBe("route-1");
    expect(parsed.stops).toHaveLength(1);
    expect(parsed.utilizationPercentage).toBe(45);
  });

  test("rejects when vehicleIdentifier is empty", () => {
    expect(() =>
      parseRawSolvedRoute(validRawRoute({ vehicleIdentifier: "" })),
    ).toThrow(ZodError);
  });

  test("rejects when latitude is a string (DB shape leaking through)", () => {
    const bad = validRawRoute();
    // Simulate an old caller passing varchar lat/lng straight from DB.
    (bad.stops[0] as unknown as { latitude: string }).latitude = "-12.04";
    expect(() => parseRawSolvedRoute(bad)).toThrow(ZodError);
  });

  test("rejects utilizationPercentage above 100", () => {
    expect(() =>
      parseRawSolvedRoute(validRawRoute({ utilizationPercentage: 150 })),
    ).toThrow(ZodError);
  });

  test("rejects negative totalDistance", () => {
    expect(() =>
      parseRawSolvedRoute(validRawRoute({ totalDistance: -1 })),
    ).toThrow(ZodError);
  });

  test("rejects estimatedArrival in non HH:MM format", () => {
    const bad = validRawRoute();
    bad.stops[0].estimatedArrival = "8h30";
    expect(() => parseRawSolvedRoute(bad)).toThrow(ZodError);
  });

  test("accepts HH:MM:SS arrival", () => {
    const route = validRawRoute();
    route.stops[0].estimatedArrival = "08:30:15";
    expect(() => parseRawSolvedRoute(route)).not.toThrow();
  });

  test("accepts route without zoneId (unzoned bucket)", () => {
    const parsed = parseRawSolvedRoute(validRawRoute());
    expect(parsed.zoneId).toBeUndefined();
  });

  test("rejects entirely non-object input", () => {
    expect(() => parseRawSolvedRoute(null)).toThrow(ZodError);
    expect(() => parseRawSolvedRoute("not-a-route")).toThrow(ZodError);
  });
});

describe("parseVerifiedPlan", () => {
  test("accepts a canonical VerifiedPlan", () => {
    const parsed = parseVerifiedPlan(validVerifiedPlan());
    expect(parsed.verification.optimizer).toBe("VROOM");
    expect(parsed.routes).toHaveLength(1);
  });

  test("rejects a plan missing the verification block", () => {
    const plan = validVerifiedPlan();
    // Strip verification — this is the AggregatedPlan shape, NOT VerifiedPlan.
    delete (plan as Partial<VerifiedPlan>).verification;
    expect(() => parseVerifiedPlan(plan)).toThrow(ZodError);
  });

  test("rejects a violation with unknown severity", () => {
    const plan = validVerifiedPlan();
    plan.verification.violations.push({
      code: "TEST",
      // @ts-expect-error intentionally invalid severity
      severity: "BLOCKING",
      message: "test",
    });
    expect(() => parseVerifiedPlan(plan)).toThrow(ZodError);
  });

  test("rejects negative byCode count", () => {
    const plan = validVerifiedPlan();
    plan.verification.summary.byCode.TIME_WINDOW_VIOLATION = -1;
    expect(() => parseVerifiedPlan(plan)).toThrow(ZodError);
  });

  test("rejects route missing driverId (must be AssignedSolvedRoute, not Raw)", () => {
    const plan = validVerifiedPlan();
    delete (plan.routes[0] as Partial<(typeof plan.routes)[0]>).driverId;
    expect(() => parseVerifiedPlan(plan)).toThrow(ZodError);
  });

  test("rejects metrics.utilizationRate above 100", () => {
    const plan = validVerifiedPlan();
    plan.metrics.utilizationRate = 120;
    expect(() => parseVerifiedPlan(plan)).toThrow(ZodError);
  });

  test("accepts plan with isPartial=true (cancelled mid-run)", () => {
    const plan = validVerifiedPlan();
    plan.isPartial = true;
    plan.warnings = ["aborted by user"];
    expect(() => parseVerifiedPlan(plan)).not.toThrow();
  });
});

describe("assertPersistableVerifiedPlan", () => {
  test("returns a structurally equal plan on success", () => {
    const plan = validVerifiedPlan();
    const out = assertPersistableVerifiedPlan(plan);
    // Zod parse returns a clone, not the same reference — what we care
    // about is that the data round-trips intact.
    expect(out).toEqual(plan);
  });

  test("throws before persisting if assignmentMetrics drift (e.g. score > 100)", () => {
    const plan = validVerifiedPlan();
    plan.assignmentMetrics.averageScore = 200;
    expect(() => assertPersistableVerifiedPlan(plan)).toThrow(ZodError);
  });

  test("throws if depot lat/lng is a string (would corrupt JSONB)", () => {
    const plan = validVerifiedPlan();
    (plan.depot as unknown as { latitude: string }).latitude = "-12.0";
    expect(() => assertPersistableVerifiedPlan(plan)).toThrow(ZodError);
  });
});
