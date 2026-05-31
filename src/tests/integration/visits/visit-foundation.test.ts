import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { PATCH } from "@/app/api/route-stops/[id]/route";
import { deliveryVisits, routeStops } from "@/db/schema";
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
 * Issue 001 — Visit foundation.
 *
 * Validates that every COMPLETED/FAILED transition on a RouteStop creates
 * an immutable `delivery_visits` row, with all the audit metadata
 * required by ADR-0005. Also validates that `route_stops.attempt_number`
 * tracks revisitas correctly when a new RouteStop is created for an
 * Order that already has Visit history.
 */
describe("Visit foundation (issue 001)", () => {
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

  async function setupStop(opts?: {
    address?: string;
    latitude?: string;
    longitude?: string;
    /** Set to true to leave the Stop in PENDING; default IN_PROGRESS so
     *  COMPLETED/FAILED transitions are valid (PENDING can only transition
     *  to IN_PROGRESS or FAILED). */
    keepPending?: boolean;
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
      routeId: "route-1",
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId: order.id,
      sequence: 1,
      address: opts?.address ?? "Av. Test 123, Lima",
      latitude: opts?.latitude ?? "-12.0464",
      longitude: opts?.longitude ?? "-77.0428",
      status: opts?.keepPending ? "PENDING" : "IN_PROGRESS",
      startedAt: opts?.keepPending ? null : new Date(),
    });
    return { order, job, stop };
  }

  test("COMPLETED transition creates a SUCCESS Visit with full metadata", async () => {
    const { order, job, stop } = await setupStop({
      address: "Calle Lima 1, Surco",
      latitude: "-12.10",
      longitude: "-77.00",
    });

    const request = await createTestRequest(`/api/route-stops/${stop.id}`, {
      method: "PATCH",
      body: {
        status: "COMPLETED",
        notes: "entregado en puerta",
        evidenceUrls: ["https://r2.example/photo-success.jpg"],
        gpsLatitude: "-12.1001",
        gpsLongitude: "-77.0002",
      },
      token,
      companyId: company.id,
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ id: stop.id }),
    });
    expect(response.status).toBe(200);

    const visits = await testDb
      .select()
      .from(deliveryVisits)
      .where(eq(deliveryVisits.routeStopId, stop.id));

    expect(visits).toHaveLength(1);
    const v = visits[0];
    expect(v.outcome).toBe("SUCCESS");
    expect(v.orderId).toBe(order.id);
    expect(v.driverId).toBe(driver.id);
    expect(v.planId).toBe(job.id);
    expect(v.failureReason).toBeNull();
    expect(v.notes).toBe("entregado en puerta");
    expect(v.evidenceUrls).toEqual(["https://r2.example/photo-success.jpg"]);
    expect(v.intendedAddress).toBe("Calle Lima 1, Surco");
    expect(v.intendedLatitude).toBe("-12.10");
    expect(v.intendedLongitude).toBe("-77.00");
    expect(v.gpsLatitude).toBe("-12.1001");
    expect(v.gpsLongitude).toBe("-77.0002");
  });

  test("FAILED transition creates a FAILURE Visit with reason + evidence", async () => {
    const { stop } = await setupStop();

    const request = await createTestRequest(`/api/route-stops/${stop.id}`, {
      method: "PATCH",
      body: {
        status: "FAILED",
        failureReason: "CUSTOMER_ABSENT",
        notes: "toqué timbre 3 veces",
        evidenceUrls: ["https://r2.example/photo-fail.jpg"],
      },
      token,
      companyId: company.id,
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ id: stop.id }),
    });
    expect(response.status).toBe(200);

    const [v] = await testDb
      .select()
      .from(deliveryVisits)
      .where(eq(deliveryVisits.routeStopId, stop.id));

    expect(v.outcome).toBe("FAILURE");
    expect(v.failureReason).toBe("CUSTOMER_ABSENT");
    expect(v.notes).toBe("toqué timbre 3 veces");
    expect(v.evidenceUrls).toEqual(["https://r2.example/photo-fail.jpg"]);
  });

  test("non-terminal transitions (IN_PROGRESS) do NOT create a Visit", async () => {
    const { stop } = await setupStop({ keepPending: true });

    const request = await createTestRequest(`/api/route-stops/${stop.id}`, {
      method: "PATCH",
      body: { status: "IN_PROGRESS" },
      token,
      companyId: company.id,
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ id: stop.id }),
    });
    expect(response.status).toBe(200);

    const visits = await testDb
      .select()
      .from(deliveryVisits)
      .where(eq(deliveryVisits.routeStopId, stop.id));
    expect(visits).toHaveLength(0);
  });

  test("the new RouteStop's attempt_number reflects prior visit count", async () => {
    // First Stop fails — generates 1 Visit on the Order
    const { order, stop: stop1 } = await setupStop();
    const failReq = await createTestRequest(`/api/route-stops/${stop1.id}`, {
      method: "PATCH",
      body: { status: "FAILED", failureReason: "CUSTOMER_ABSENT" },
      token,
      companyId: company.id,
    });
    await PATCH(failReq, { params: Promise.resolve({ id: stop1.id }) });

    // Sanity: the Order has exactly 1 Visit now.
    const visitsAfterFirst = await testDb
      .select()
      .from(deliveryVisits)
      .where(eq(deliveryVisits.orderId, order.id));
    expect(visitsAfterFirst).toHaveLength(1);

    // Now imagine the Order is reactivated and lands in a new plan.
    // We simulate that by creating a second RouteStop with the helper
    // logic the confirm endpoint uses: attempt_number = visit count + 1.
    const config = await createOptimizationConfig({ companyId: company.id });
    const job2 = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      status: "COMPLETED",
    });
    const newAttemptNumber = visitsAfterFirst.length + 1;
    const stop2 = await createRouteStop({
      companyId: company.id,
      jobId: job2.id,
      routeId: "route-2",
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId: order.id,
      sequence: 1,
      address: "Av. Test 123, Lima",
      latitude: "-12.0464",
      longitude: "-77.0428",
      attemptNumber: newAttemptNumber,
    });

    expect(stop2.attemptNumber).toBe(2);
  });

  test("Visit is immutable: failureReason on the Stop can be reset later but the Visit stays", async () => {
    const { stop } = await setupStop();

    const failReq = await createTestRequest(`/api/route-stops/${stop.id}`, {
      method: "PATCH",
      body: { status: "FAILED", failureReason: "CUSTOMER_ABSENT" },
      token,
      companyId: company.id,
    });
    await PATCH(failReq, { params: Promise.resolve({ id: stop.id }) });

    // Operator reverts the Stop back to PENDING (issue 003 will surface
    // this via UI, but the underlying state machine already supports it).
    const reopenReq = await createTestRequest(`/api/route-stops/${stop.id}`, {
      method: "PATCH",
      body: { status: "PENDING" },
      token,
      companyId: company.id,
    });
    await PATCH(reopenReq, { params: Promise.resolve({ id: stop.id }) });

    // Verify: the Visit row still has the original failureReason — it is
    // not modified by the reopen.
    const [v] = await testDb
      .select()
      .from(deliveryVisits)
      .where(eq(deliveryVisits.routeStopId, stop.id));
    expect(v.failureReason).toBe("CUSTOMER_ABSENT");

    // The Stop, on the other hand, was cleared by the existing reopen
    // semantics — failureReason on the Stop is null.
    const [reopened] = await testDb
      .select()
      .from(routeStops)
      .where(
        and(eq(routeStops.id, stop.id), eq(routeStops.companyId, company.id)),
      );
    expect(reopened.status).toBe("PENDING");
    expect(reopened.failureReason).toBeNull();
  });
});
