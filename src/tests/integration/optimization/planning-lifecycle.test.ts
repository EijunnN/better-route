import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createPlanner,
  createDriver,
  createVehicle,
  createOrder,
  createOptimizationConfig,
  createOptimizationJob,
  buildOptimizationResult,
} from "../setup/test-data";
import {
  orders,
  optimizationConfigurations,
  routeStops,
} from "@/db/schema";
import { POST as confirmPlan } from "@/app/api/optimization/jobs/[id]/confirm/route";
import {
  GET as getConfig,
  PATCH as patchConfig,
} from "@/app/api/optimization/configure/[id]/route";
import { PATCH as patchRouteStop } from "@/app/api/route-stops/[id]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callConfirm(jobId: string, token: string, companyId: string) {
  const request = await createTestRequest(
    `/api/optimization/jobs/${jobId}/confirm`,
    { method: "POST", body: {}, token, companyId },
  );
  return confirmPlan(request, { params: Promise.resolve({ id: jobId }) });
}

async function callGetConfig(configId: string, token: string, companyId: string) {
  const request = await createTestRequest(
    `/api/optimization/configure/${configId}`,
    { method: "GET", token, companyId },
  );
  return getConfig(request, { params: Promise.resolve({ id: configId }) });
}

async function callPatchConfig(
  configId: string,
  body: Record<string, unknown>,
  token: string,
  companyId: string,
) {
  const request = await createTestRequest(
    `/api/optimization/configure/${configId}`,
    { method: "PATCH", body, token, companyId },
  );
  return patchConfig(request, { params: Promise.resolve({ id: configId }) });
}

async function callPatchRouteStop(
  stopId: string,
  body: Record<string, unknown>,
  token: string,
  companyId: string,
  userId?: string,
) {
  const request = await createTestRequest(
    `/api/route-stops/${stopId}`,
    { method: "PATCH", body, token, companyId, userId },
  );
  return patchRouteStop(request, { params: Promise.resolve({ id: stopId }) });
}

/** Standard fixtures: company, admin, driver, vehicle, token */
async function createFixtures() {
  const company = await createCompany();
  const admin = await createAdmin(null);
  const driver = await createDriver(company.id);
  const vehicle = await createVehicle({ companyId: company.id });

  const token = await createTestToken({
    userId: admin.id,
    companyId: company.id,
    email: admin.email,
    role: admin.role,
  });

  return { company, admin, driver, vehicle, token };
}

/** Build a single-route result from a list of orders */
function buildSingleRouteResult(
  orders: Array<{
    id: string;
    trackingId: string;
    address: string;
    latitude: string;
    longitude: string;
  }>,
  vehicleId: string,
  vehiclePlate: string,
  driverId: string,
) {
  return buildOptimizationResult([
    {
      routeId: "route-1",
      vehicleId,
      vehiclePlate,
      driverId,
      stops: orders.map((o, i) => ({
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
    },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Planning Lifecycle - Full E2E and edge cases", () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ---- 1. Full E2E: config -> job -> confirm -> execute all stops ----------
  test("full lifecycle: create config, confirm job, execute all stops to COMPLETED, orders become COMPLETED", async () => {
    const { company, admin, driver, vehicle, token } = await createFixtures();
    const order1 = await createOrder({ companyId: company.id });
    const order2 = await createOrder({ companyId: company.id });
    const order3 = await createOrder({ companyId: company.id });

    // Create config (DRAFT by default)
    const config = await createOptimizationConfig({ companyId: company.id });

    // Create completed job with optimization result
    const result = buildSingleRouteResult(
      [order1, order2, order3],
      vehicle.id,
      vehicle.plate,
      driver.id,
    );
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as any,
    });

    // Confirm the plan
    const confirmRes = await callConfirm(job.id, token, company.id);
    expect(confirmRes.status).toBe(200);
    const confirmBody = await confirmRes.json();
    expect(confirmBody.success).toBe(true);
    expect(confirmBody.ordersAssigned).toBe(3);
    expect(confirmBody.routeStopsCreated).toBe(3);

    // Verify config is CONFIRMED
    const [updatedConfig] = await testDb
      .select()
      .from(optimizationConfigurations)
      .where(eq(optimizationConfigurations.id, config.id))
      .limit(1);
    expect(updatedConfig.status).toBe("CONFIRMED");

    // Verify orders are ASSIGNED
    for (const o of [order1, order2, order3]) {
      const [dbOrder] = await testDb
        .select()
        .from(orders)
        .where(eq(orders.id, o.id))
        .limit(1);
      expect(dbOrder.status).toBe("ASSIGNED");
    }

    // Get the created route stops
    const stops = await testDb
      .select()
      .from(routeStops)
      .where(eq(routeStops.jobId, job.id));
    expect(stops.length).toBe(3);

    // Execute each stop: PENDING -> IN_PROGRESS -> COMPLETED
    for (const stop of stops) {
      // PENDING -> IN_PROGRESS
      const inProgressRes = await callPatchRouteStop(
        stop.id,
        { status: "IN_PROGRESS" },
        token,
        company.id,
        admin.id,
      );
      expect(inProgressRes.status).toBe(200);

      // IN_PROGRESS -> COMPLETED
      const completedRes = await callPatchRouteStop(
        stop.id,
        { status: "COMPLETED" },
        token,
        company.id,
        admin.id,
      );
      expect(completedRes.status).toBe(200);
    }

    // Verify all orders are now COMPLETED
    for (const o of [order1, order2, order3]) {
      const [dbOrder] = await testDb
        .select()
        .from(orders)
        .where(eq(orders.id, o.id))
        .limit(1);
      expect(dbOrder.status).toBe("COMPLETED");
    }
  }, 30000);

  // ---- 2. PATCH on CONFIRMED config is allowed (only OPTIMIZING blocks) ----
  test("PATCH on a CONFIRMED config succeeds (OPTIMIZING status blocks, not CONFIRMED)", async () => {
    const { company, token } = await createFixtures();

    // Create a CONFIRMED config directly
    const config = await createOptimizationConfig({
      companyId: company.id,
      status: "CONFIRMED",
    });

    // PATCH should succeed because the handler only blocks OPTIMIZING status
    const res = await callPatchConfig(
      config.id,
      { name: "Updated Name" },
      token,
      company.id,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.name).toBe("Updated Name");
  });

  // ---- 3. PATCH on OPTIMIZING config returns 400 --------------------------
  test("PATCH on an OPTIMIZING config returns 400", async () => {
    const { company, token } = await createFixtures();

    const config = await createOptimizationConfig({
      companyId: company.id,
      status: "OPTIMIZING",
    });

    const res = await callPatchConfig(
      config.id,
      { name: "Should Fail" },
      token,
      company.id,
    );
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("optimization is in progress");
  });

  // ---- 4. Confirm with some orders no longer PENDING ----------------------
  test("confirm skips orders that are no longer PENDING, confirms the rest", async () => {
    const { company, driver, vehicle, token } = await createFixtures();
    const pendingOrder = await createOrder({ companyId: company.id });
    const assignedOrder = await createOrder({
      companyId: company.id,
      status: "ASSIGNED",
    });
    const cancelledOrder = await createOrder({
      companyId: company.id,
      status: "CANCELLED",
    });

    const config = await createOptimizationConfig({ companyId: company.id });
    const result = buildSingleRouteResult(
      [pendingOrder, assignedOrder, cancelledOrder],
      vehicle.id,
      vehicle.plate,
      driver.id,
    );
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as any,
    });

    const res = await callConfirm(job.id, token, company.id);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    // Only the PENDING order should have been assigned
    expect(body.ordersAssigned).toBe(1);
    // Skipped orders reported
    expect(body.skippedOrders).toBeTruthy();
    expect(body.skippedOrders.nonPendingCount).toBe(2);

    // Verify the PENDING order became ASSIGNED
    const [dbPending] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, pendingOrder.id))
      .limit(1);
    expect(dbPending.status).toBe("ASSIGNED");

    // Verify the ASSIGNED order remains ASSIGNED (unchanged)
    const [dbAssigned] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, assignedOrder.id))
      .limit(1);
    expect(dbAssigned.status).toBe("ASSIGNED");

    // Verify the CANCELLED order remains CANCELLED
    const [dbCancelled] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, cancelledOrder.id))
      .limit(1);
    expect(dbCancelled.status).toBe("CANCELLED");
  });

  // ---- 5. Confirm with missing/deleted orders -----------------------------
  test("confirm skips missing/deleted orders and confirms existing ones", async () => {
    const { company, driver, vehicle, token } = await createFixtures();
    const existingOrder = await createOrder({ companyId: company.id });
    const fakeOrderId = "00000000-0000-4000-a000-999999999999";

    const config = await createOptimizationConfig({ companyId: company.id });
    const result = buildOptimizationResult([
      {
        routeId: "route-1",
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        driverId: driver.id,
        stops: [
          {
            orderId: existingOrder.id,
            trackingId: existingOrder.trackingId,
            sequence: 1,
            address: existingOrder.address,
            latitude: existingOrder.latitude,
            longitude: existingOrder.longitude,
          },
          {
            orderId: fakeOrderId,
            trackingId: "TRK-MISSING",
            sequence: 2,
            address: "Missing Address",
            latitude: "-12.0464",
            longitude: "-77.0428",
          },
        ],
        totalDistance: 5000,
        totalDuration: 1800,
        totalWeight: 100,
        totalVolume: 10,
        utilizationPercentage: 50,
        timeWindowViolations: 0,
      },
    ]);

    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as any,
    });

    const res = await callConfirm(job.id, token, company.id);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.ordersAssigned).toBe(1);
    expect(body.skippedOrders).toBeTruthy();
    expect(body.skippedOrders.missingCount).toBe(1);
    expect(body.skippedOrders.missingOrderIds).toContain(fakeOrderId);

    // Existing order should be ASSIGNED
    const [dbOrder] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, existingOrder.id))
      .limit(1);
    expect(dbOrder.status).toBe("ASSIGNED");
  });

  // ---- 6. Config defaults to DRAFT status ---------------------------------
  test("createOptimizationConfig defaults to DRAFT status", async () => {
    const { company } = await createFixtures();
    const config = await createOptimizationConfig({ companyId: company.id });

    expect(config.status).toBe("DRAFT");

    // Also verify via GET handler
    const planner = await createPlanner(company.id);
    const token = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });

    const res = await callGetConfig(config.id, token, company.id);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.status).toBe("DRAFT");
  });

  // ---- 7. Job 404 for non-existent ID ------------------------------------
  test("confirm returns 404 for a non-existent job ID", async () => {
    const { company, token } = await createFixtures();
    const fakeJobId = "00000000-0000-4000-a000-000000000000";

    const res = await callConfirm(fakeJobId, token, company.id);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  // ---- 8. Non-COMPLETED job returns 400 -----------------------------------
  test("confirm returns 400 when job is RUNNING (not COMPLETED)", async () => {
    const { company, token } = await createFixtures();
    const config = await createOptimizationConfig({ companyId: company.id });

    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      status: "RUNNING",
      progress: 50,
    });

    const res = await callConfirm(job.id, token, company.id);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("completed");
  });

  // ---- 9. Re-confirm already CONFIRMED plan returns 409 -------------------
  test("re-confirming an already CONFIRMED plan returns 409", async () => {
    const { company, driver, vehicle, token } = await createFixtures();
    const order = await createOrder({ companyId: company.id });

    const config = await createOptimizationConfig({ companyId: company.id });
    const result = buildSingleRouteResult(
      [order],
      vehicle.id,
      vehicle.plate,
      driver.id,
    );
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as any,
    });

    // First confirm should succeed
    const firstRes = await callConfirm(job.id, token, company.id);
    expect(firstRes.status).toBe(200);

    // Second confirm should return 409
    const secondRes = await callConfirm(job.id, token, company.id);
    expect(secondRes.status).toBe(409);

    const body = await secondRes.json();
    expect(body.error).toContain("already been confirmed");
  });

  // ---- 10. Confirm fails when ALL orders are non-PENDING ------------------
  test("confirm returns 400 when all orders are no longer PENDING", async () => {
    const { company, driver, vehicle, token } = await createFixtures();
    const assignedOrder1 = await createOrder({
      companyId: company.id,
      status: "ASSIGNED",
    });
    const assignedOrder2 = await createOrder({
      companyId: company.id,
      status: "COMPLETED",
    });

    const config = await createOptimizationConfig({ companyId: company.id });
    const result = buildSingleRouteResult(
      [assignedOrder1, assignedOrder2],
      vehicle.id,
      vehicle.plate,
      driver.id,
    );
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as any,
    });

    const res = await callConfirm(job.id, token, company.id);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("no longer PENDING");
  });
});
