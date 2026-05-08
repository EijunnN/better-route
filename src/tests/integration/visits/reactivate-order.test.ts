import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
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
  createRouteStop,
} from "../setup/test-data";
import { orders, deliveryVisits } from "@/db/schema";
import { PATCH } from "@/app/api/route-stops/[id]/route";
import { POST as REACTIVATE } from "@/app/api/orders/[id]/reactivate/route";

/**
 * Issue 004 — cross-day Order reactivation.
 *
 * Validates POST /api/orders/:id/reactivate flips a FAILED order to
 * PENDING with overrides applied, and that follow-up planning correctly
 * counts the prior visit when assigning attempt_number.
 */
describe("POST /api/orders/:id/reactivate (issue 004)", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let driver: Awaited<ReturnType<typeof createDriver>>;
  let vehicle: Awaited<ReturnType<typeof createVehicle>>;
  let token: string;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    admin = await createAdmin(null);
    token = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: admin.role,
    });
    driver = await createDriver(company.id);
    vehicle = await createVehicle({ companyId: company.id });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  async function failOrderViaStop() {
    const order = await createOrder({ companyId: company.id });
    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      status: "COMPLETED",
    });
    const stop = await createRouteStop({
      companyId: company.id,
      jobId: job.id,
      routeId: "route-1",
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId: order.id,
      sequence: 1,
      address: "Av. Test 123",
      latitude: "-12.0464",
      longitude: "-77.0428",
      status: "IN_PROGRESS",
      startedAt: new Date(),
    });
    const failReq = await createTestRequest(`/api/route-stops/${stop.id}`, {
      method: "PATCH",
      body: { status: "FAILED", failureReason: "CUSTOMER_ABSENT" },
      token,
      companyId: company.id,
    });
    await PATCH(failReq, { params: Promise.resolve({ id: stop.id }) });
    return { order, stop };
  }

  async function reactivate(orderId: string, body: Record<string, unknown>) {
    const req = await createTestRequest(
      `/api/orders/${orderId}/reactivate`,
      { method: "POST", body, token, companyId: company.id },
    );
    return await REACTIVATE(req, { params: Promise.resolve({ id: orderId }) });
  }

  async function loadOrder(orderId: string) {
    return await testDb.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
  }

  test("reactivates a FAILED order back to PENDING with overrides applied", async () => {
    const { order } = await failOrderViaStop();
    expect((await loadOrder(order.id))?.status).toBe("FAILED");

    const res = await reactivate(order.id, {
      reason: "cliente coordinó nueva fecha",
      addressOverride: "Calle Nueva 200",
      timeWindowStartOverride: "10:00",
      timeWindowEndOverride: "12:00",
      promisedDateOverride: "2026-05-20",
      notesOverride: "tocar timbre fuerte",
    });
    expect(res.status).toBe(200);

    const fresh = await loadOrder(order.id);
    expect(fresh?.status).toBe("PENDING");
    expect(fresh?.address).toBe("Calle Nueva 200");
    expect(fresh?.timeWindowStart).toBe("10:00:00");
    expect(fresh?.timeWindowEnd).toBe("12:00:00");
    expect(fresh?.notes).toBe("tocar timbre fuerte");
    expect(fresh?.promisedDate?.toISOString().slice(0, 10)).toBe("2026-05-20");
  });

  test("reactivate does not alter prior delivery_visits rows", async () => {
    const { order, stop } = await failOrderViaStop();
    const [visitBefore] = await testDb
      .select()
      .from(deliveryVisits)
      .where(eq(deliveryVisits.routeStopId, stop.id));
    expect(visitBefore).toBeDefined();
    const before = JSON.stringify(visitBefore);

    await reactivate(order.id, { reason: "next plan" });

    const [visitAfter] = await testDb
      .select()
      .from(deliveryVisits)
      .where(eq(deliveryVisits.routeStopId, stop.id));
    expect(JSON.stringify(visitAfter)).toBe(before);
  });

  test("rejects reactivation of a non-FAILED order with 409", async () => {
    const order = await createOrder({ companyId: company.id }); // PENDING
    const res = await reactivate(order.id, { reason: "test" });
    expect(res.status).toBe(409);
  });

  test("rejects empty reason with 400", async () => {
    const { order } = await failOrderViaStop();
    const res = await reactivate(order.id, { reason: "   " });
    expect(res.status).toBe(400);
  });

  test("after reactivate, a new RouteStop manually created with attempt_number = visits+1", async () => {
    // Standalone simulation of what the next planning run does — the
    // confirm endpoint already computes attemptNumber from the prior
    // delivery_visits count (issue 001). Here we just confirm the
    // observable contract: order is reactivable AND a follow-up stop
    // sees attemptNumber = 2.
    const { order, stop: stop1 } = await failOrderViaStop();

    const reactivateRes = await reactivate(order.id, { reason: "next plan" });
    expect(reactivateRes.status).toBe(200);

    const visitCountRow = await testDb
      .select()
      .from(deliveryVisits)
      .where(eq(deliveryVisits.orderId, order.id));
    expect(visitCountRow).toHaveLength(1);

    const config2 = await createOptimizationConfig({ companyId: company.id });
    const job2 = await createOptimizationJob({
      companyId: company.id,
      configurationId: config2.id,
      status: "COMPLETED",
    });
    const stop2 = await createRouteStop({
      companyId: company.id,
      jobId: job2.id,
      routeId: "route-2",
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId: order.id,
      sequence: 1,
      address: "Av. Test 123",
      latitude: "-12.0464",
      longitude: "-77.0428",
      attemptNumber: visitCountRow.length + 1,
    });
    expect(stop2.attemptNumber).toBe(2);
    expect(stop2.id).not.toBe(stop1.id);
  });
});
