import { describe, test, expect, mock } from "bun:test";
import type {
  AssignedSolvedRoute,
  UnassignedOrderRecord,
} from "@/lib/optimization/solved-plan";

// Both `aggregatePlan` and the driver-assignment helpers it transitively
// pulls in import `@/db`. Stub it; nothing is queried inside aggregatePlan.
mock.module("@/db", () => ({ db: {} }));

const { aggregatePlan } = await import(
  "@/lib/optimization/optimization-runner/stages/aggregate-plan"
);

/**
 * Stage 5 of the runner pipeline. Pure-ish: only external call is the
 * pure helper `getAssignmentQualityMetrics`. We exercise it directly
 * (no mocks) and assert the metrics + leftover lists end up correctly.
 *
 * See ADR-0004 (runner pipeline stages).
 */

function route(overrides: Partial<AssignedSolvedRoute> = {}): AssignedSolvedRoute {
  return {
    routeId: "route-1",
    vehicleId: "veh-1",
    vehicleIdentifier: "ABC-123",
    stops: [
      {
        orderId: "o1",
        trackingId: "T1",
        sequence: 1,
        address: "addr",
        latitude: -12,
        longitude: -77,
      },
    ],
    totalDistance: 1000,
    totalDuration: 600,
    totalServiceTime: 100,
    totalTravelTime: 500,
    capacityUsed: { WEIGHT: 50 },
    utilizationPercentage: 60,
    timeWindowViolations: 0,
    driverId: "d1",
    driverName: "Juan",
    assignmentQuality: { score: 90, warnings: [], errors: [] },
    ...overrides,
  };
}

const baseArgs = {
  unassignedOrders: [] as UnassignedOrderRecord[],
  selectedDrivers: [
    { id: "d1", name: "Juan" },
    { id: "d2", name: "Pedro" },
  ],
  driverVehicleOriginMap: new Map([
    ["d2", { latitude: "-12.05", longitude: "-77.05" }],
  ]),
  vehiclesForFallback: [
    { id: "veh-1", plate: "ABC-123" },
    { id: "veh-2", plate: "XYZ-789", originLatitude: "-12.06", originLongitude: "-77.06" },
  ],
  warnings: [] as string[],
  startTime: Date.now() - 1500,
  engineUsed: "VROOM",
  objective: "BALANCED" as const,
  depot: { latitude: -12.0, longitude: -77.0 },
};

describe("aggregatePlan", () => {
  test("sums distances, durations and stop counts across routes", async () => {
    const r1 = route({ totalDistance: 1000, totalDuration: 600 });
    const r2 = route({
      routeId: "route-2",
      vehicleId: "veh-2",
      driverId: "d2",
      totalDistance: 500,
      totalDuration: 300,
      utilizationPercentage: 40,
      stops: [
        { ...r1.stops[0], orderId: "o2", trackingId: "T2" },
        { ...r1.stops[0], orderId: "o3", trackingId: "T3", sequence: 2 },
      ],
    });

    const plan = await aggregatePlan({ ...baseArgs, routes: [r1, r2] });

    expect(plan.metrics.totalRoutes).toBe(2);
    expect(plan.metrics.totalDistance).toBe(1500);
    expect(plan.metrics.totalDuration).toBe(900);
    expect(plan.metrics.totalStops).toBe(3);
  });

  test("utilizationRate is the average of per-route utilization, rounded", async () => {
    const r1 = route({ utilizationPercentage: 60 });
    const r2 = route({
      routeId: "route-2",
      vehicleId: "veh-2",
      driverId: "d2",
      utilizationPercentage: 41, // avg = 50.5 → rounds to 51
    });

    const plan = await aggregatePlan({ ...baseArgs, routes: [r1, r2] });
    expect(plan.metrics.utilizationRate).toBe(51);
  });

  test("timeWindowComplianceRate reflects the violation share", async () => {
    const r1 = route({
      timeWindowViolations: 1,
      stops: [
        { ...route().stops[0], orderId: "a", trackingId: "TA" },
        { ...route().stops[0], orderId: "b", trackingId: "TB", sequence: 2 },
        { ...route().stops[0], orderId: "c", trackingId: "TC", sequence: 3 },
        { ...route().stops[0], orderId: "d", trackingId: "TD", sequence: 4 },
      ],
    });

    const plan = await aggregatePlan({ ...baseArgs, routes: [r1] });
    // 4 stops total, 1 violation → (3/4)*100 = 75
    expect(plan.metrics.timeWindowComplianceRate).toBe(75);
  });

  test("empty routes yields 100% time window compliance and 0 utilization", async () => {
    const plan = await aggregatePlan({ ...baseArgs, routes: [] });

    expect(plan.metrics.totalRoutes).toBe(0);
    expect(plan.metrics.totalStops).toBe(0);
    expect(plan.metrics.utilizationRate).toBe(0);
    expect(plan.metrics.timeWindowComplianceRate).toBe(100);
  });

  test("driversWithoutRoutes lists drivers not assigned to any route, with origin from map", async () => {
    const plan = await aggregatePlan({ ...baseArgs, routes: [route()] });

    expect(plan.driversWithoutRoutes).toHaveLength(1);
    expect(plan.driversWithoutRoutes[0]).toEqual({
      id: "d2",
      name: "Pedro",
      originLatitude: -12.05,
      originLongitude: -77.05,
    });
  });

  test("vehiclesWithoutRoutes excludes the vehicles that ran routes", async () => {
    const plan = await aggregatePlan({ ...baseArgs, routes: [route()] });

    expect(plan.vehiclesWithoutRoutes).toHaveLength(1);
    expect(plan.vehiclesWithoutRoutes[0]).toMatchObject({
      id: "veh-2",
      plate: "XYZ-789",
      originLatitude: -12.06,
      originLongitude: -77.06,
    });
  });

  test("vehicle without a configured origin yields undefined coords (not 0)", async () => {
    const plan = await aggregatePlan({ ...baseArgs, routes: [] });
    const vehWithoutOrigin = plan.vehiclesWithoutRoutes.find(
      (v) => v.id === "veh-1",
    );
    expect(vehWithoutOrigin).toBeDefined();
    expect(vehWithoutOrigin!.originLatitude).toBeUndefined();
    expect(vehWithoutOrigin!.originLongitude).toBeUndefined();
  });

  test("warnings are forwarded only when non-empty", async () => {
    const empty = await aggregatePlan({ ...baseArgs, routes: [] });
    expect(empty.warnings).toBeUndefined();

    const withWarn = await aggregatePlan({
      ...baseArgs,
      routes: [],
      warnings: ["fallback to NN"],
    });
    expect(withWarn.warnings).toEqual(["fallback to NN"]);
  });

  test("summary captures the engine, objective and processing time", async () => {
    const startTime = Date.now() - 2500;
    const plan = await aggregatePlan({
      ...baseArgs,
      routes: [],
      startTime,
      engineUsed: "VROOM",
      objective: "DISTANCE",
    });

    expect(plan.summary.engineUsed).toBe("VROOM");
    expect(plan.summary.objective).toBe("DISTANCE");
    expect(plan.summary.processingTimeMs).toBeGreaterThanOrEqual(2500);
    expect(typeof plan.summary.optimizedAt).toBe("string");
  });

  test("assignmentMetrics surfaces warnings/errors per route", async () => {
    const r = route({
      assignmentQuality: {
        score: 70,
        warnings: ["close to capacity"],
        errors: [],
      },
    });
    const plan = await aggregatePlan({ ...baseArgs, routes: [r] });

    expect(plan.assignmentMetrics.totalAssignments).toBe(1);
    expect(plan.assignmentMetrics.assignmentsWithWarnings).toBe(1);
    expect(plan.assignmentMetrics.assignmentsWithErrors).toBe(0);
    expect(plan.assignmentMetrics.averageScore).toBe(70);
  });

  test("propagates depot and unassignedOrders verbatim", async () => {
    const unassigned: UnassignedOrderRecord[] = [
      { orderId: "o9", trackingId: "T9", reason: "Outside zone" },
    ];
    const plan = await aggregatePlan({
      ...baseArgs,
      routes: [],
      unassignedOrders: unassigned,
    });

    expect(plan.depot).toEqual({ latitude: -12.0, longitude: -77.0 });
    expect(plan.unassignedOrders).toBe(unassigned);
  });
});
