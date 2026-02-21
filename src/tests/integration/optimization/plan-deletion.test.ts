import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq, and } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createDriver,
  createVehicle,
  createOrder,
  createOptimizationConfig,
  createOptimizationJob,
  buildOptimizationResult,
  createRouteStop,
} from "../setup/test-data";
import {
  orders,
  optimizationConfigurations,
  optimizationJobs,
  routeStops,
} from "@/db/schema";
import { DELETE } from "@/app/api/optimization/configure/[id]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callDelete(configId: string, token: string, companyId: string) {
  const request = await createTestRequest(
    `/api/optimization/configure/${configId}`,
    {
      method: "DELETE",
      token,
      companyId,
    },
  );
  return DELETE(request, { params: Promise.resolve({ id: configId }) });
}

/** Build a standard confirmed-plan fixture with N orders. */
async function setupConfirmedPlan(orderCount = 2) {
  const company = await createCompany();
  const admin = await createAdmin(null);
  const driver = await createDriver(company.id);
  const vehicle = await createVehicle({ companyId: company.id });

  const createdOrders = [];
  for (let i = 0; i < orderCount; i++) {
    createdOrders.push(await createOrder({ companyId: company.id }));
  }

  const config = await createOptimizationConfig({
    companyId: company.id,
    status: "CONFIRMED",
  });

  const stops = createdOrders.map((o, i) => ({
    orderId: o.id,
    trackingId: o.trackingId,
    sequence: i + 1,
    address: o.address,
    latitude: o.latitude,
    longitude: o.longitude,
  }));

  const result = buildOptimizationResult([
    {
      routeId: "route-1",
      vehicleId: vehicle.id,
      vehiclePlate: vehicle.plate,
      driverId: driver.id,
      stops,
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

  // Set orders to ASSIGNED (simulating confirm flow)
  for (const o of createdOrders) {
    await testDb
      .update(orders)
      .set({ status: "ASSIGNED" })
      .where(eq(orders.id, o.id));
  }

  // Create route stops for cascade verification
  for (const o of createdOrders) {
    await createRouteStop({
      companyId: company.id,
      jobId: job.id,
      routeId: "route-1",
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId: o.id,
    });
  }

  const token = await createTestToken({
    userId: admin.id,
    companyId: company.id,
    email: admin.email,
    role: admin.role,
  });

  return { company, admin, driver, vehicle, orders: createdOrders, config, job, token };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DELETE /api/optimization/configure/[id]", () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ---- 1. Delete DRAFT config: no orders affected ---------------------------
  test("deletes a DRAFT config with no orders affected", async () => {
    const company = await createCompany();
    const admin = await createAdmin(null);

    const config = await createOptimizationConfig({
      companyId: company.id,
      status: "DRAFT",
    });

    const token = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: admin.role,
    });

    const response = await callDelete(config.id, token, company.id);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.ordersReverted).toBe(0);

    // Config should no longer exist
    const [deleted] = await testDb
      .select()
      .from(optimizationConfigurations)
      .where(eq(optimizationConfigurations.id, config.id))
      .limit(1);
    expect(deleted).toBeUndefined();
  });

  // ---- 2. Delete CONFIRMED plan: ASSIGNED orders revert to PENDING ----------
  test("reverts ASSIGNED orders to PENDING when deleting a CONFIRMED plan", async () => {
    const fixture = await setupConfirmedPlan(2);

    const response = await callDelete(fixture.config.id, fixture.token, fixture.company.id);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.ordersReverted).toBe(2);

    // Both orders should now be PENDING
    for (const o of fixture.orders) {
      const [updated] = await testDb
        .select()
        .from(orders)
        .where(eq(orders.id, o.id))
        .limit(1);
      expect(updated.status).toBe("PENDING");
    }
  });

  // ---- 3. Delete CONFIRMED plan: route stops cascade deleted ----------------
  test("cascade-deletes route stops when deleting a CONFIRMED plan", async () => {
    const fixture = await setupConfirmedPlan(2);

    // Verify route stops exist before deletion
    const stopsBefore = await testDb
      .select()
      .from(routeStops)
      .where(eq(routeStops.jobId, fixture.job.id));
    expect(stopsBefore.length).toBe(2);

    const response = await callDelete(fixture.config.id, fixture.token, fixture.company.id);
    expect(response.status).toBe(200);

    // Route stops should be gone (cascade: config → jobs → route_stops)
    const stopsAfter = await testDb
      .select()
      .from(routeStops)
      .where(eq(routeStops.jobId, fixture.job.id));
    expect(stopsAfter.length).toBe(0);
  });

  // ---- 4. IN_PROGRESS orders NOT reverted on delete -------------------------
  test("does not revert IN_PROGRESS orders when deleting a CONFIRMED plan", async () => {
    const fixture = await setupConfirmedPlan(2);

    // Move order[0] to IN_PROGRESS (simulating driver picked it up)
    await testDb
      .update(orders)
      .set({ status: "IN_PROGRESS" })
      .where(eq(orders.id, fixture.orders[0].id));

    const response = await callDelete(fixture.config.id, fixture.token, fixture.company.id);
    expect(response.status).toBe(200);

    // IN_PROGRESS order should remain IN_PROGRESS
    const [inProgressOrder] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, fixture.orders[0].id))
      .limit(1);
    expect(inProgressOrder.status).toBe("IN_PROGRESS");

    // ASSIGNED order should be reverted to PENDING
    const [assignedOrder] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, fixture.orders[1].id))
      .limit(1);
    expect(assignedOrder.status).toBe("PENDING");
  });

  // ---- 5. COMPLETED orders NOT reverted on delete ---------------------------
  test("does not revert COMPLETED orders when deleting a CONFIRMED plan", async () => {
    const fixture = await setupConfirmedPlan(2);

    // Move order[0] to COMPLETED (simulating delivery done)
    await testDb
      .update(orders)
      .set({ status: "COMPLETED" })
      .where(eq(orders.id, fixture.orders[0].id));

    const response = await callDelete(fixture.config.id, fixture.token, fixture.company.id);
    expect(response.status).toBe(200);

    // COMPLETED order should remain COMPLETED
    const [completedOrder] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, fixture.orders[0].id))
      .limit(1);
    expect(completedOrder.status).toBe("COMPLETED");

    // ASSIGNED order should be reverted to PENDING
    const [assignedOrder] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, fixture.orders[1].id))
      .limit(1);
    expect(assignedOrder.status).toBe("PENDING");
  });

  // ---- 6. OPTIMIZING status blocks deletion ---------------------------------
  test("returns 400 when config status is OPTIMIZING", async () => {
    const company = await createCompany();
    const admin = await createAdmin(null);

    const config = await createOptimizationConfig({
      companyId: company.id,
      status: "OPTIMIZING",
    });

    const token = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: admin.role,
    });

    const response = await callDelete(config.id, token, company.id);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("optimization is in progress");

    // Config should still exist
    const [stillExists] = await testDb
      .select()
      .from(optimizationConfigurations)
      .where(eq(optimizationConfigurations.id, config.id))
      .limit(1);
    expect(stillExists).toBeTruthy();
  });

  // ---- 7. Reverted PENDING orders can be included in new optimization -------
  test("reverted orders can be included in a new optimization config", async () => {
    const fixture = await setupConfirmedPlan(2);

    // Delete the confirmed plan
    const deleteResponse = await callDelete(fixture.config.id, fixture.token, fixture.company.id);
    expect(deleteResponse.status).toBe(200);

    // Orders should be PENDING now
    for (const o of fixture.orders) {
      const [updated] = await testDb
        .select()
        .from(orders)
        .where(eq(orders.id, o.id))
        .limit(1);
      expect(updated.status).toBe("PENDING");
    }

    // Create a new optimization config and job referencing the same orders
    const newConfig = await createOptimizationConfig({
      companyId: fixture.company.id,
      status: "CONFIRMED",
    });

    const newResult = buildOptimizationResult([
      {
        routeId: "route-new",
        vehicleId: fixture.vehicle.id,
        vehiclePlate: fixture.vehicle.plate,
        driverId: fixture.driver.id,
        stops: fixture.orders.map((o, i) => ({
          orderId: o.id,
          trackingId: o.trackingId,
          sequence: i + 1,
          address: o.address,
          latitude: o.latitude,
          longitude: o.longitude,
        })),
        totalDistance: 6000,
        totalDuration: 2400,
        totalWeight: 120,
        totalVolume: 12,
        utilizationPercentage: 60,
        timeWindowViolations: 0,
      },
    ]);

    const newJob = await createOptimizationJob({
      companyId: fixture.company.id,
      configurationId: newConfig.id,
      result: newResult as any,
    });

    // Mark orders as ASSIGNED again (simulating new confirm)
    for (const o of fixture.orders) {
      await testDb
        .update(orders)
        .set({ status: "ASSIGNED" })
        .where(eq(orders.id, o.id));
    }

    // Verify orders are re-assigned
    for (const o of fixture.orders) {
      const [reassigned] = await testDb
        .select()
        .from(orders)
        .where(eq(orders.id, o.id))
        .limit(1);
      expect(reassigned.status).toBe("ASSIGNED");
    }

    // New config and job should exist
    const [newConfigDb] = await testDb
      .select()
      .from(optimizationConfigurations)
      .where(eq(optimizationConfigurations.id, newConfig.id))
      .limit(1);
    expect(newConfigDb).toBeTruthy();

    const [newJobDb] = await testDb
      .select()
      .from(optimizationJobs)
      .where(eq(optimizationJobs.id, newJob.id))
      .limit(1);
    expect(newJobDb).toBeTruthy();
  }, 30000);

  // ---- 8. Re-import: after plan deletion, reverted orders retain tracking IDs and are reusable
  test("reverted orders retain tracking IDs and are available for re-planning after deletion", async () => {
    const fixture = await setupConfirmedPlan(2);
    const trackingId1 = fixture.orders[0].trackingId;
    const trackingId2 = fixture.orders[1].trackingId;

    // Delete the plan
    const response = await callDelete(fixture.config.id, fixture.token, fixture.company.id);
    expect(response.status).toBe(200);

    // Orders should be PENDING with original tracking IDs intact
    const [o1After] = await testDb.select().from(orders).where(eq(orders.id, fixture.orders[0].id)).limit(1);
    const [o2After] = await testDb.select().from(orders).where(eq(orders.id, fixture.orders[1].id)).limit(1);
    expect(o1After.status).toBe("PENDING");
    expect(o2After.status).toBe("PENDING");
    expect(o1After.trackingId).toBe(trackingId1);
    expect(o2After.trackingId).toBe(trackingId2);
    expect(o1After.active).toBe(true);
    expect(o2After.active).toBe(true);
  }, 30000);

  // ---- 9. Delete non-existent config returns 404 ----------------------------
  test("returns 404 for a non-existent config ID", async () => {
    const company = await createCompany();
    const admin = await createAdmin(null);

    const token = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: admin.role,
    });

    const fakeId = "00000000-0000-4000-a000-000000000000";
    const response = await callDelete(fakeId, token, company.id);
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toContain("not found");
  });

  // ---- 10. Tenant isolation: cannot delete another company's config ---------
  test("cannot delete a config belonging to another company", async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const adminB = await createAdmin(null);

    // Config belongs to company A
    const config = await createOptimizationConfig({
      companyId: companyA.id,
      status: "DRAFT",
    });

    // Admin from company B tries to delete it
    const token = await createTestToken({
      userId: adminB.id,
      companyId: companyB.id,
      email: adminB.email,
      role: adminB.role,
    });

    const response = await callDelete(config.id, token, companyB.id);
    expect(response.status).toBe(404);

    // Config should still exist
    const [stillExists] = await testDb
      .select()
      .from(optimizationConfigurations)
      .where(eq(optimizationConfigurations.id, config.id))
      .limit(1);
    expect(stillExists).toBeTruthy();
  });
});
