/**
 * Contract tests for the confirm-plan debts C-1..C-9
 * (docs/specs/confirm-plan.md §6): concurrency races, partial confirm
 * with intercalated non-PENDING orders, and the input-validation guards.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/optimization/jobs/[id]/confirm/route";
import {
  optimizationConfigurations,
  orders,
  planMetrics,
  routeStops,
} from "@/db/schema";
import { createTestToken } from "../setup/test-auth";
import {
  buildOptimizationResult,
  createCompany,
  createDriver,
  createOptimizationConfig,
  createOptimizationJob,
  createOrder,
  createPlanner,
  createVehicle,
  type RouteFixture,
} from "../setup/test-data";
import { cleanDatabase, testDb } from "../setup/test-db";
import { createTestRequest } from "../setup/test-request";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callConfirm(
  jobId: string,
  token: string,
  companyId: string,
  body: unknown = {},
) {
  const request = await createTestRequest(
    `/api/optimization/jobs/${jobId}/confirm`,
    { method: "POST", body, token, companyId },
  );
  return POST(request, { params: Promise.resolve({ id: jobId }) });
}

interface OrderLike {
  id: string;
  trackingId: string;
  address: string;
  latitude: string;
  longitude: string;
}

function routeFixture(
  routeId: string,
  vehicle: { id: string; plate: string | null },
  driverId: string,
  orderList: OrderLike[],
): RouteFixture {
  return {
    routeId,
    vehicleId: vehicle.id,
    vehiclePlate: vehicle.plate,
    driverId,
    stops: orderList.map((o, i) => ({
      orderId: o.id,
      trackingId: o.trackingId,
      sequence: i + 1,
      address: o.address,
      latitude: o.latitude,
      longitude: o.longitude,
    })),
    totalDistance: 5000,
    totalDuration: 1800,
    totalWeight: 100,
    totalVolume: 10,
    utilizationPercentage: 50,
    timeWindowViolations: 0,
  };
}

async function setupBase() {
  const company = await createCompany();
  const planner = await createPlanner(company.id);
  const driver = await createDriver(company.id);
  const vehicle = await createVehicle({ companyId: company.id });
  const token = await createTestToken({
    userId: planner.id,
    companyId: company.id,
    email: planner.email,
    role: planner.role,
  });
  return { company, planner, driver, vehicle, token };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("confirm-plan debts (C-1..C-9)", () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ---- Concurrent double-confirm of the same job (CAS + advisory lock) ----
  test("concurrent double-confirm: exactly one 200 and one 409, no duplicated stops", async () => {
    const { company, driver, vehicle, token } = await setupBase();
    const order1 = await createOrder({ companyId: company.id });
    const order2 = await createOrder({ companyId: company.id });
    const config = await createOptimizationConfig({ companyId: company.id });
    const result = buildOptimizationResult([
      routeFixture("route-1", vehicle, driver.id, [order1, order2]),
    ]);
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as never,
    });

    const [r1, r2] = await Promise.all([
      callConfirm(job.id, token, company.id),
      callConfirm(job.id, token, company.id),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const stops = await testDb
      .select()
      .from(routeStops)
      .where(eq(routeStops.jobId, job.id));
    expect(stops.length).toBe(2);

    const dbOrders = await testDb
      .select({ status: orders.status })
      .from(orders)
      .where(inArray(orders.id, [order1.id, order2.id]));
    expect(dbOrders.map((o) => o.status)).toEqual(["ASSIGNED", "ASSIGNED"]);
  });

  // ---- C-4: concurrent confirms of two configs sharing one order ----------
  test("C-4: two plans sharing an order confirmed concurrently produce exactly one stop and one ASSIGNED", async () => {
    const { company, driver, vehicle, token } = await setupBase();
    const driverB = await createDriver(company.id);
    const vehicleB = await createVehicle({ companyId: company.id });
    const sharedOrder = await createOrder({ companyId: company.id });

    const configA = await createOptimizationConfig({ companyId: company.id });
    const jobA = await createOptimizationJob({
      companyId: company.id,
      configurationId: configA.id,
      result: buildOptimizationResult([
        routeFixture("route-a", vehicle, driver.id, [sharedOrder]),
      ]) as never,
    });

    const configB = await createOptimizationConfig({ companyId: company.id });
    const jobB = await createOptimizationJob({
      companyId: company.id,
      configurationId: configB.id,
      result: buildOptimizationResult([
        routeFixture("route-b", vehicleB, driverB.id, [sharedOrder]),
      ]) as never,
    });

    const [rA, rB] = await Promise.all([
      callConfirm(jobA.id, token, company.id),
      callConfirm(jobB.id, token, company.id),
    ]);

    const statuses = [rA.status, rB.status];
    expect(statuses.filter((s) => s === 200).length).toBe(1);
    // The loser fails either at the pre-check (400: all orders gone) or at
    // the in-tx guard (409 CONFLICT) depending on interleaving.
    expect(statuses.filter((s) => s === 400 || s === 409).length).toBe(1);

    const [dbOrder] = await testDb
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, sharedOrder.id));
    expect(dbOrder.status).toBe("ASSIGNED");

    // No orphan stop: the shared order got exactly one stop across both jobs
    const stops = await testDb
      .select()
      .from(routeStops)
      .where(eq(routeStops.orderId, sharedOrder.id));
    expect(stops.length).toBe(1);

    // Only the winning config is CONFIRMED; the loser rolled back
    const configs = await testDb
      .select({ status: optimizationConfigurations.status })
      .from(optimizationConfigurations)
      .where(inArray(optimizationConfigurations.id, [configA.id, configB.id]));
    expect(configs.filter((c) => c.status === "CONFIRMED").length).toBe(1);
  });

  // ---- Partial confirm: CANCELLED order intercalated (C-4/C-8) ------------
  test("CANCELLED order in the middle of a route: no ASSIGNED, no stop, reported; service time comes from config", async () => {
    const { company, driver, vehicle, token } = await setupBase();
    const order1 = await createOrder({ companyId: company.id });
    const cancelled = await createOrder({
      companyId: company.id,
      status: "CANCELLED",
    });
    const order3 = await createOrder({ companyId: company.id });
    const config = await createOptimizationConfig({
      companyId: company.id,
      serviceTimeMinutes: 15,
    });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: buildOptimizationResult([
        routeFixture("route-1", vehicle, driver.id, [
          order1,
          cancelled,
          order3,
        ]),
      ]) as never,
    });

    const response = await callConfirm(job.id, token, company.id);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ordersAssigned).toBe(2);
    expect(body.routeStopsCreated).toBe(2);
    expect(body.skippedOrders.count).toBe(1);
    expect(body.skippedOrders.nonPendingOrderIds).toContain(cancelled.id);

    const [dbCancelled] = await testDb
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, cancelled.id));
    expect(dbCancelled.status).toBe("CANCELLED");

    const stops = await testDb
      .select()
      .from(routeStops)
      .where(eq(routeStops.jobId, job.id));
    expect(stops.length).toBe(2);
    expect(stops.map((s) => s.orderId)).not.toContain(cancelled.id);
    // C-8: estimatedServiceTime derives from configuration.serviceTimeMinutes
    for (const stop of stops) {
      expect(stop.estimatedServiceTime).toBe(15 * 60);
    }

    // plan_metrics reflects what was actually dispatched, not the full plan:
    // the skipped order is excluded from totalStops and counted as unassigned.
    expect(body.planMetrics.totalStops).toBe(2);
    expect(body.planMetrics.unassignedOrders).toBe(1);
    const [metricsRow] = await testDb
      .select()
      .from(planMetrics)
      .where(eq(planMetrics.jobId, job.id));
    expect(metricsRow.totalStops).toBe(2);
    expect(metricsRow.unassignedOrders).toBe(1);
  });

  // ---- C-5: vehicle with active stops from another plan -------------------
  test("C-5: confirming a second plan with a busy vehicle returns 409 with detail, nothing mutated", async () => {
    const { company, driver, vehicle, token } = await setupBase();
    const orderA = await createOrder({ companyId: company.id });
    const configA = await createOptimizationConfig({ companyId: company.id });
    const jobA = await createOptimizationJob({
      companyId: company.id,
      configurationId: configA.id,
      result: buildOptimizationResult([
        routeFixture("route-a", vehicle, driver.id, [orderA]),
      ]) as never,
    });
    const first = await callConfirm(jobA.id, token, company.id);
    expect(first.status).toBe(200);

    const orderB = await createOrder({ companyId: company.id });
    const configB = await createOptimizationConfig({ companyId: company.id });
    const jobB = await createOptimizationJob({
      companyId: company.id,
      configurationId: configB.id,
      result: buildOptimizationResult([
        routeFixture("route-b", vehicle, driver.id, [orderB]),
      ]) as never,
    });

    const second = await callConfirm(jobB.id, token, company.id);
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.vehiclesWithActiveStops).toEqual([
      { vehicleId: vehicle.id, activeStopsCount: 1 },
    ]);

    const [dbOrderB] = await testDb
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderB.id));
    expect(dbOrderB.status).toBe("PENDING");
    const [dbConfigB] = await testDb
      .select({ status: optimizationConfigurations.status })
      .from(optimizationConfigurations)
      .where(eq(optimizationConfigurations.id, configB.id));
    expect(dbConfigB.status).toBe("DRAFT");
  });

  // ---- C-3: nonexistent driver rejected with 400, not FK-500 --------------
  test("C-3: a driver id that does not exist fails validation with 400 and zero mutation", async () => {
    const { company, vehicle, token } = await setupBase();
    const order = await createOrder({ companyId: company.id });
    const config = await createOptimizationConfig({ companyId: company.id });
    const ghostDriverId = "00000000-0000-4000-a000-000000000001";
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: buildOptimizationResult([
        routeFixture("route-1", vehicle, ghostDriverId, [order]),
      ]) as never,
    });

    const response = await callConfirm(job.id, token, company.id);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(JSON.stringify(body)).toContain("driver_not_found");

    const [dbOrder] = await testDb
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(dbOrder.status).toBe("PENDING");
    const stops = await testDb
      .select()
      .from(routeStops)
      .where(eq(routeStops.jobId, job.id));
    expect(stops.length).toBe(0);
  });

  // ---- C-3 variant: driver from another company ---------------------------
  test("C-3: a driver from another company fails validation with 400", async () => {
    const { company, vehicle, token } = await setupBase();
    const otherCompany = await createCompany();
    const foreignDriver = await createDriver(otherCompany.id);
    const order = await createOrder({ companyId: company.id });
    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: buildOptimizationResult([
        routeFixture("route-1", vehicle, foreignDriver.id, [order]),
      ]) as never,
    });

    const response = await callConfirm(job.id, token, company.id);
    expect(response.status).toBe(400);
  });

  // ---- C-2: malformed JSON body -------------------------------------------
  test("C-2: malformed JSON body returns 400 instead of confirming with defaults", async () => {
    const { company, driver, vehicle, token } = await setupBase();
    const order = await createOrder({ companyId: company.id });
    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: buildOptimizationResult([
        routeFixture("route-1", vehicle, driver.id, [order]),
      ]) as never,
    });

    const request = new NextRequest(
      new URL(
        `/api/optimization/jobs/${job.id}/confirm`,
        "http://localhost:3000",
      ),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "x-company-id": company.id,
          "content-type": "application/json",
        },
        body: '{"overrideWarnings": tru',
      },
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Malformed JSON");

    const [dbConfig] = await testDb
      .select({ status: optimizationConfigurations.status })
      .from(optimizationConfigurations)
      .where(eq(optimizationConfigurations.id, config.id));
    expect(dbConfig.status).toBe("DRAFT");
  });

  // ---- C-9: unparseable startDate ------------------------------------------
  test("C-9: unparseable startDate returns 400 instead of silently scheduling today", async () => {
    const { company, driver, vehicle, token } = await setupBase();
    const order = await createOrder({ companyId: company.id });
    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: buildOptimizationResult([
        routeFixture("route-1", vehicle, driver.id, [order]),
      ]) as never,
    });

    const response = await callConfirm(job.id, token, company.id, {
      startDate: "manana",
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Invalid startDate");

    const stops = await testDb
      .select()
      .from(routeStops)
      .where(eq(routeStops.jobId, job.id));
    expect(stops.length).toBe(0);
  });

  // ---- C-1: already-confirmed 409 carries a real timestamp ----------------
  test("C-1: 409 for an already confirmed plan returns confirmedAt as ISO string", async () => {
    const { company, driver, vehicle, token } = await setupBase();
    const order = await createOrder({ companyId: company.id });
    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: buildOptimizationResult([
        routeFixture("route-1", vehicle, driver.id, [order]),
      ]) as never,
    });

    const first = await callConfirm(job.id, token, company.id);
    expect(first.status).toBe(200);

    const second = await callConfirm(job.id, token, company.id);
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(typeof body.confirmedAt).toBe("string");
    expect(Number.isNaN(new Date(body.confirmedAt).getTime())).toBe(false);
  });

  // ---- Boundary 3: drifted persisted shape rejected with a clear 500 ------
  test("job result with a drifted shape returns 500 with a clear error and zero mutation", async () => {
    const { company, token } = await setupBase();
    const order = await createOrder({ companyId: company.id });
    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      // Pre-A15 shape: assignmentQuality.errors as string[] — exactly the
      // drift parseVerifiedPlan exists to catch.
      result: {
        routes: [
          {
            routeId: "route-1",
            vehicleId: "not-even-checked",
            assignmentQuality: { score: 100, warnings: [], errors: ["OLD"] },
          },
        ],
      } as never,
    });

    const response = await callConfirm(job.id, token, company.id);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("invalid shape");

    const [dbConfig] = await testDb
      .select({ status: optimizationConfigurations.status })
      .from(optimizationConfigurations)
      .where(eq(optimizationConfigurations.id, config.id));
    expect(dbConfig.status).toBe("DRAFT");
    const [dbOrder] = await testDb
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(dbOrder.status).toBe("PENDING");
  });

  // ---- Boundary 3 tolerance: driver removed post-solve is a 400, not 500 ---
  test("persisted route with driverId null (driver removed) fails validation with 400, not a shape error", async () => {
    const { company, driver, vehicle, token } = await setupBase();
    const order = await createOrder({ companyId: company.id });
    const config = await createOptimizationConfig({ companyId: company.id });
    const result = buildOptimizationResult([
      routeFixture("route-1", vehicle, driver.id, [order]),
    ]);
    // What driver-assignment remove persists into the JSONB.
    result.routes[0].driverId = null as never;
    result.routes[0].driverName = null as never;
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as never,
    });

    const response = await callConfirm(job.id, token, company.id);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(JSON.stringify(body)).toContain("no driver assigned");
  });
});
