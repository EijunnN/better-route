import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { cleanDatabase } from "../setup/test-db";
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
import { PATCH } from "@/app/api/route-stops/[id]/route";
import { GET } from "@/app/api/orders/[id]/visits/route";

/**
 * Issue 002 — `GET /api/orders/:id/visits` is the read side of the
 * Visit foundation. The integration covers the 3 ordering shapes: zero
 * visits, one visit, three visits.
 */
describe("GET /api/orders/:id/visits (issue 002)", () => {
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

  async function setupStop(
    orderId: string,
    sequence = 1,
  ) {
    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      status: "COMPLETED",
    });
    return await createRouteStop({
      companyId: company.id,
      jobId: job.id,
      routeId: `route-${sequence}`,
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId,
      sequence: 1,
      address: "Av. Test 123",
      latitude: "-12.0464",
      longitude: "-77.0428",
      status: "IN_PROGRESS",
      startedAt: new Date(),
    });
  }

  async function failStop(stopId: string, reason = "CUSTOMER_ABSENT") {
    const req = await createTestRequest(`/api/route-stops/${stopId}`, {
      method: "PATCH",
      body: { status: "FAILED", failureReason: reason },
      token,
      companyId: company.id,
    });
    await PATCH(req, { params: Promise.resolve({ id: stopId }) });
  }

  async function fetchVisits(orderId: string) {
    const req = await createTestRequest(`/api/orders/${orderId}/visits`, {
      method: "GET",
      token,
      companyId: company.id,
    });
    const res = await GET(req, { params: Promise.resolve({ id: orderId }) });
    return { status: res.status, body: (await res.json()) as { data: unknown[] } };
  }

  test("returns an empty array for an Order with no Visits yet", async () => {
    const order = await createOrder({ companyId: company.id });
    const { status, body } = await fetchVisits(order.id);
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  test("returns 1 entry for an Order with a single failed attempt", async () => {
    const order = await createOrder({ companyId: company.id });
    const stop = await setupStop(order.id);
    await failStop(stop.id, "CUSTOMER_REFUSED");

    const { status, body } = await fetchVisits(order.id);
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    const v = body.data[0] as Record<string, unknown>;
    expect(v.outcome).toBe("FAILURE");
    expect(v.failureReason).toBe("CUSTOMER_REFUSED");
    expect(v.driverName).toBe(driver.name);
    expect(v.intendedAddress).toBe("Av. Test 123");
  });

  test("returns 3 entries in chronological order for an Order with three attempts", async () => {
    const order = await createOrder({ companyId: company.id });

    for (let i = 0; i < 3; i++) {
      const stop = await setupStop(order.id, i + 1);
      await failStop(stop.id, "CUSTOMER_ABSENT");
      // Tiny gap so attempted_at differs measurably across stops.
      await new Promise((r) => setTimeout(r, 5));
    }

    const { status, body } = await fetchVisits(order.id);
    expect(status).toBe(200);
    expect(body.data).toHaveLength(3);

    // Ordered ascending by attemptedAt.
    const times = (body.data as Array<{ attemptedAt: string }>).map(
      (v) => new Date(v.attemptedAt).getTime(),
    );
    expect(times[0]).toBeLessThanOrEqual(times[1]);
    expect(times[1]).toBeLessThanOrEqual(times[2]);
  });

  test("returns 404 when the Order does not exist for this tenant", async () => {
    const otherCompany = await createCompany();
    const otherOrder = await createOrder({ companyId: otherCompany.id });

    const req = await createTestRequest(
      `/api/orders/${otherOrder.id}/visits`,
      { method: "GET", token, companyId: company.id },
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: otherOrder.id }),
    });
    expect(res.status).toBe(404);
  });
});
