import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { POST as REOPEN } from "@/app/api/route-stops/[id]/reopen/route";
import { PATCH } from "@/app/api/route-stops/[id]/route";
import { deliveryVisits, orders, routeStops } from "@/db/schema";
import { createTestToken } from "../setup/test-auth";
import {
  createAdmin,
  createCompany,
  createDriver,
  createOptimizationConfig,
  createOptimizationJob,
  createOrder,
  createRouteStop,
  createVehicle,
} from "../setup/test-data";
import { cleanDatabase, testDb } from "../setup/test-db";
import { createTestRequest } from "../setup/test-request";

/**
 * Issue 003 — same-day Stop reopen.
 *
 * Validates that POST /api/route-stops/:id/reopen transitions a FAILED
 * Stop back to PENDING with overrides applied, evidence/failure data
 * cleared, and the prior `delivery_visits` row left untouched.
 */
describe("POST /api/route-stops/:id/reopen (issue 003)", () => {
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

  async function createFailedStop(opts?: {
    address?: string;
    notes?: string;
    evidence?: string[];
  }) {
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
      routeId: "route-x",
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId: order.id,
      sequence: 1,
      address: opts?.address ?? "Av. Original 1",
      latitude: "-12.0464",
      longitude: "-77.0428",
      status: "IN_PROGRESS",
      startedAt: new Date(),
    });

    const failReq = await createTestRequest(`/api/route-stops/${stop.id}`, {
      method: "PATCH",
      body: {
        status: "FAILED",
        failureReason: "CUSTOMER_ABSENT",
        notes: opts?.notes ?? "no contestaron",
        evidenceUrls: opts?.evidence ?? ["https://r2.example/before.jpg"],
      },
      token,
      companyId: company.id,
    });
    await PATCH(failReq, { params: Promise.resolve({ id: stop.id }) });

    return { order, stop };
  }

  async function reopen(stopId: string, body: Record<string, unknown>) {
    const req = await createTestRequest(`/api/route-stops/${stopId}/reopen`, {
      method: "POST",
      body,
      token,
      companyId: company.id,
    });
    return await REOPEN(req, { params: Promise.resolve({ id: stopId }) });
  }

  async function loadStop(stopId: string) {
    return await testDb.query.routeStops.findFirst({
      where: eq(routeStops.id, stopId),
    });
  }

  test("reopens a FAILED stop with overrides applied", async () => {
    const { order, stop } = await createFailedStop();

    const res = await reopen(stop.id, {
      reason: "cliente reagendó por teléfono",
      addressOverride: "Calle Nueva 42",
      latitudeOverride: "-12.10",
      longitudeOverride: "-77.05",
      notesOverride: "tocar timbre fuerte",
    });
    expect(res.status).toBe(200);

    const fresh = await loadStop(stop.id);
    expect(fresh?.status).toBe("PENDING");
    expect(fresh?.address).toBe("Calle Nueva 42");
    expect(fresh?.latitude).toBe("-12.10");
    expect(fresh?.longitude).toBe("-77.05");
    expect(fresh?.notes).toBe("tocar timbre fuerte");
    expect(fresh?.failureReason).toBeNull();
    expect(fresh?.evidenceUrls).toBeNull();
    expect(fresh?.completedAt).toBeNull();
    expect(fresh?.startedAt).toBeNull();

    const [refreshedOrder] = await testDb
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(refreshedOrder.status).toBe("PENDING");
  });

  test("the prior delivery_visits row is NOT modified by the reopen", async () => {
    const { stop } = await createFailedStop({
      notes: "primer intento fallido",
      evidence: ["https://r2.example/v1.jpg"],
    });

    const [visitBefore] = await testDb
      .select()
      .from(deliveryVisits)
      .where(eq(deliveryVisits.routeStopId, stop.id));
    expect(visitBefore).toBeDefined();
    const before = JSON.stringify(visitBefore);

    const res = await reopen(stop.id, {
      reason: "reabrir",
      addressOverride: "Otro lugar",
    });
    expect(res.status).toBe(200);

    const [visitAfter] = await testDb
      .select()
      .from(deliveryVisits)
      .where(eq(deliveryVisits.routeStopId, stop.id));
    expect(JSON.stringify(visitAfter)).toBe(before);
  });

  test("reopen with no overrides only flips status and clears failure data", async () => {
    const { stop } = await createFailedStop({
      address: "Av. Permanente 100",
      notes: "intento previo",
      evidence: ["https://r2.example/v2.jpg"],
    });

    const res = await reopen(stop.id, { reason: "reintentar" });
    expect(res.status).toBe(200);

    const fresh = await loadStop(stop.id);
    expect(fresh?.status).toBe("PENDING");
    // Address and coords untouched.
    expect(fresh?.address).toBe("Av. Permanente 100");
    // Failure data cleared.
    expect(fresh?.failureReason).toBeNull();
    expect(fresh?.evidenceUrls).toBeNull();
    expect(fresh?.notes).toBeNull();
  });

  test("rejects reopen on a non-FAILED stop with 409", async () => {
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
      routeId: "route-y",
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId: order.id,
      sequence: 1,
      address: "Av. Test 123",
      latitude: "-12.0464",
      longitude: "-77.0428",
      status: "PENDING",
    });

    const res = await reopen(stop.id, { reason: "test" });
    expect(res.status).toBe(409);
  });

  test("rejects reopen with empty reason as 400", async () => {
    const { stop } = await createFailedStop();
    const res = await reopen(stop.id, { reason: "  " });
    expect(res.status).toBe(400);
  });

  test("rejects reopen for a stop in another tenant with 404", async () => {
    const { stop } = await createFailedStop();

    const otherCompany = await createCompany();
    const otherAdmin = await createAdmin(null);
    const otherToken = await createTestToken({
      userId: otherAdmin.id,
      companyId: otherCompany.id,
      email: otherAdmin.email,
      role: otherAdmin.role,
    });

    const req = await createTestRequest(`/api/route-stops/${stop.id}/reopen`, {
      method: "POST",
      body: { reason: "cross-tenant attempt" },
      token: otherToken,
      companyId: otherCompany.id,
    });
    const res = await REOPEN(req, {
      params: Promise.resolve({ id: stop.id }),
    });
    expect(res.status).toBe(404);
  });
});
