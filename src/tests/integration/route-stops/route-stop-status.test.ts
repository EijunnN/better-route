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
import { orders, routeStopHistory, routeStops } from "@/db/schema";
import { PATCH } from "@/app/api/route-stops/[id]/route";

describe("PATCH /api/route-stops/[id] — status transitions", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let adminToken: string;
  let driver: Awaited<ReturnType<typeof createDriver>>;
  let driverToken: string;
  let driverB: Awaited<ReturnType<typeof createDriver>>;
  let driverBToken: string;
  let vehicle: Awaited<ReturnType<typeof createVehicle>>;
  let config: Awaited<ReturnType<typeof createOptimizationConfig>>;
  let job: Awaited<ReturnType<typeof createOptimizationJob>>;

  // Helper: create a fresh route stop with a new order for each test
  async function freshStop(overrides: {
    status?: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "SKIPPED";
    userId?: string;
    failureReason?: string;
    evidenceUrls?: string[];
    orderStatus?: "PENDING" | "ASSIGNED" | "COMPLETED" | "FAILED" | "IN_PROGRESS" | "CANCELLED";
  } = {}) {
    const order = await createOrder({
      companyId: company.id,
      status: overrides.orderStatus ?? "ASSIGNED",
    });
    const stop = await createRouteStop({
      companyId: company.id,
      jobId: job.id,
      routeId: "route-test",
      userId: overrides.userId ?? driver.id,
      vehicleId: vehicle.id,
      orderId: order.id,
      status: overrides.status ?? "PENDING",
      failureReason: overrides.failureReason as any,
      evidenceUrls: overrides.evidenceUrls,
    });
    return { stop, order };
  }

  // Helper: send a PATCH request to update a stop
  async function patchStop(
    stopId: string,
    body: Record<string, unknown>,
    opts: { token?: string; companyId?: string; userId?: string } = {},
  ) {
    const request = await createTestRequest(`/api/route-stops/${stopId}`, {
      method: "PATCH",
      token: opts.token ?? adminToken,
      companyId: opts.companyId ?? company.id,
      userId: opts.userId ?? admin.id,
      body,
    });
    return PATCH(request, { params: Promise.resolve({ id: stopId }) });
  }

  beforeAll(async () => {
    await cleanDatabase();

    company = await createCompany();
    admin = await createAdmin(null);
    adminToken = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: admin.role,
    });

    driver = await createDriver(company.id);
    driverToken = await createTestToken({
      userId: driver.id,
      companyId: company.id,
      email: driver.email,
      role: driver.role,
    });

    driverB = await createDriver(company.id);
    driverBToken = await createTestToken({
      userId: driverB.id,
      companyId: company.id,
      email: driverB.email,
      role: driverB.role,
    });

    vehicle = await createVehicle({ companyId: company.id });
    config = await createOptimizationConfig({ companyId: company.id });
    job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // -----------------------------------------------------------------------
  // 1. PENDING → IN_PROGRESS sets startedAt
  // -----------------------------------------------------------------------
  test("PENDING → IN_PROGRESS sets startedAt", async () => {
    const { stop } = await freshStop({ status: "PENDING" });

    const res = await patchStop(stop.id, { status: "IN_PROGRESS" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.status).toBe("IN_PROGRESS");
    expect(body.data.startedAt).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // 2. IN_PROGRESS → COMPLETED sets completedAt & order → COMPLETED
  // -----------------------------------------------------------------------
  test("IN_PROGRESS → COMPLETED sets completedAt and order becomes COMPLETED", async () => {
    const { stop, order } = await freshStop({ status: "IN_PROGRESS" });

    const res = await patchStop(stop.id, { status: "COMPLETED" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.status).toBe("COMPLETED");
    expect(body.data.completedAt).toBeTruthy();

    // Verify order status in DB
    const dbOrder = await testDb.query.orders.findFirst({
      where: eq(orders.id, order.id),
    });
    expect(dbOrder!.status).toBe("COMPLETED");
  });

  // -----------------------------------------------------------------------
  // 3. IN_PROGRESS → FAILED with CUSTOMER_ABSENT saves failureReason
  // -----------------------------------------------------------------------
  test("IN_PROGRESS → FAILED with CUSTOMER_ABSENT saves failureReason", async () => {
    const { stop } = await freshStop({ status: "IN_PROGRESS" });

    const res = await patchStop(stop.id, {
      status: "FAILED",
      failureReason: "CUSTOMER_ABSENT",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.status).toBe("FAILED");
    expect(body.data.failureReason).toBe("CUSTOMER_ABSENT");
  });

  // -----------------------------------------------------------------------
  // 4. IN_PROGRESS → SKIPPED marks order as FAILED
  // -----------------------------------------------------------------------
  test("IN_PROGRESS → SKIPPED marks order as FAILED", async () => {
    const { stop, order } = await freshStop({ status: "IN_PROGRESS" });

    const res = await patchStop(stop.id, { status: "SKIPPED" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.status).toBe("SKIPPED");

    const dbOrder = await testDb.query.orders.findFirst({
      where: eq(orders.id, order.id),
    });
    expect(dbOrder!.status).toBe("FAILED");
  });

  // -----------------------------------------------------------------------
  // 5. FAILED → PENDING (retry) clears failureReason and evidenceUrls
  // -----------------------------------------------------------------------
  test("FAILED → PENDING (retry) clears failureReason and evidenceUrls", async () => {
    const { stop } = await freshStop({
      status: "FAILED",
      failureReason: "PACKAGE_DAMAGED",
      evidenceUrls: ["https://example.com/photo.jpg"],
    });

    const res = await patchStop(stop.id, { status: "PENDING" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.status).toBe("PENDING");
    expect(body.data.failureReason).toBeNull();
    expect(body.data.evidenceUrls).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 6. PENDING → FAILED requires failureReason (400)
  // -----------------------------------------------------------------------
  test("PENDING → FAILED without failureReason returns 400", async () => {
    const { stop } = await freshStop({ status: "PENDING" });

    const res = await patchStop(stop.id, { status: "FAILED" });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toMatch(/failureReason/i);
    expect(body.validReasons).toBeDefined();
    expect(Array.isArray(body.validReasons)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 7. COMPLETED → anything returns 400 (terminal state)
  // -----------------------------------------------------------------------
  test("COMPLETED → IN_PROGRESS returns 400 (terminal state)", async () => {
    const { stop } = await freshStop({ status: "COMPLETED" });

    const res = await patchStop(stop.id, { status: "IN_PROGRESS" });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toMatch(/invalid status transition/i);
  });

  // -----------------------------------------------------------------------
  // 8. SKIPPED → anything returns 400 (terminal state)
  // -----------------------------------------------------------------------
  test("SKIPPED → PENDING returns 400 (terminal state)", async () => {
    const { stop } = await freshStop({ status: "SKIPPED" });

    const res = await patchStop(stop.id, { status: "PENDING" });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toMatch(/invalid status transition/i);
  });

  // -----------------------------------------------------------------------
  // 9. FAILED without failureReason → 400 with validReasons list
  // -----------------------------------------------------------------------
  test("IN_PROGRESS → FAILED without failureReason returns 400 with validReasons", async () => {
    const { stop } = await freshStop({ status: "IN_PROGRESS" });

    const res = await patchStop(stop.id, { status: "FAILED" });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.validReasons).toContain("CUSTOMER_ABSENT");
    expect(body.validReasons).toContain("CUSTOMER_REFUSED");
    expect(body.validReasons).toContain("ADDRESS_NOT_FOUND");
    expect(body.validReasons).toContain("PACKAGE_DAMAGED");
    expect(body.validReasons).toContain("RESCHEDULE_REQUESTED");
    expect(body.validReasons).toContain("UNSAFE_AREA");
    expect(body.validReasons).toContain("OTHER");
  });

  // -----------------------------------------------------------------------
  // 10. FAILED with invalid failureReason → 400
  // -----------------------------------------------------------------------
  test("FAILED with invalid failureReason returns 400", async () => {
    const { stop } = await freshStop({ status: "IN_PROGRESS" });

    const res = await patchStop(stop.id, {
      status: "FAILED",
      failureReason: "NOT_A_REAL_REASON",
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toMatch(/invalid failureReason/i);
    expect(body.validReasons).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 11. FAILED with valid reason + evidenceUrls saves both
  // -----------------------------------------------------------------------
  test("FAILED with valid reason and evidenceUrls saves both", async () => {
    const { stop } = await freshStop({ status: "IN_PROGRESS" });
    const urls = [
      "https://example.com/photo1.jpg",
      "https://example.com/photo2.jpg",
    ];

    const res = await patchStop(stop.id, {
      status: "FAILED",
      failureReason: "ADDRESS_NOT_FOUND",
      evidenceUrls: urls,
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.failureReason).toBe("ADDRESS_NOT_FOUND");
    expect(body.data.evidenceUrls).toEqual(urls);
  });

  // -----------------------------------------------------------------------
  // 12. Order COMPLETED in DB when stop COMPLETED
  // -----------------------------------------------------------------------
  test("order status becomes COMPLETED in DB when stop transitions to COMPLETED", async () => {
    const { stop, order } = await freshStop({
      status: "IN_PROGRESS",
      orderStatus: "IN_PROGRESS",
    });

    const res = await patchStop(stop.id, { status: "COMPLETED" });
    expect(res.status).toBe(200);

    const dbOrder = await testDb.query.orders.findFirst({
      where: eq(orders.id, order.id),
    });
    expect(dbOrder!.status).toBe("COMPLETED");
  });

  // -----------------------------------------------------------------------
  // 13. Order IN_PROGRESS in DB when stop IN_PROGRESS
  // -----------------------------------------------------------------------
  test("order status becomes IN_PROGRESS in DB when stop transitions to IN_PROGRESS", async () => {
    const { stop, order } = await freshStop({
      status: "PENDING",
      orderStatus: "ASSIGNED",
    });

    const res = await patchStop(stop.id, { status: "IN_PROGRESS" });
    expect(res.status).toBe(200);

    const dbOrder = await testDb.query.orders.findFirst({
      where: eq(orders.id, order.id),
    });
    expect(dbOrder!.status).toBe("IN_PROGRESS");
  });

  // -----------------------------------------------------------------------
  // 14. CANCELLED order NOT overwritten by stop status
  // -----------------------------------------------------------------------
  test("CANCELLED order is not overwritten when stop status changes", async () => {
    const { stop, order } = await freshStop({
      status: "PENDING",
      orderStatus: "CANCELLED",
    });

    const res = await patchStop(stop.id, { status: "IN_PROGRESS" });
    expect(res.status).toBe(200);

    const dbOrder = await testDb.query.orders.findFirst({
      where: eq(orders.id, order.id),
    });
    expect(dbOrder!.status).toBe("CANCELLED");
  });

  // -----------------------------------------------------------------------
  // 15. CONDUCTOR can update own stop
  // -----------------------------------------------------------------------
  test("CONDUCTOR can update their own stop", async () => {
    const { stop } = await freshStop({
      status: "PENDING",
      userId: driver.id,
    });

    const res = await patchStop(stop.id, { status: "IN_PROGRESS" }, {
      token: driverToken,
      userId: driver.id,
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.status).toBe("IN_PROGRESS");
  });

  // -----------------------------------------------------------------------
  // 16. CONDUCTOR cannot update another driver's stop (403)
  // -----------------------------------------------------------------------
  test("CONDUCTOR cannot update another driver's stop (403)", async () => {
    const { stop } = await freshStop({
      status: "PENDING",
      userId: driver.id,
    });

    // driverB tries to update driver's stop
    const res = await patchStop(stop.id, { status: "IN_PROGRESS" }, {
      token: driverBToken,
      userId: driverB.id,
    });
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toMatch(/permiso/i);
  });

  // -----------------------------------------------------------------------
  // 17. History record created with metadata on each transition
  // -----------------------------------------------------------------------
  test("history record is created with metadata on status transition", async () => {
    const { stop } = await freshStop({ status: "IN_PROGRESS" });

    const res = await patchStop(stop.id, {
      status: "FAILED",
      failureReason: "UNSAFE_AREA",
      notes: "Zone was restricted",
      evidenceUrls: ["https://example.com/evidence.jpg"],
    });
    expect(res.status).toBe(200);

    const history = await testDb.query.routeStopHistory.findFirst({
      where: eq(routeStopHistory.routeStopId, stop.id),
    });

    expect(history).toBeDefined();
    expect(history!.previousStatus).toBe("IN_PROGRESS");
    expect(history!.newStatus).toBe("FAILED");
    expect(history!.notes).toBe("Zone was restricted");
    expect(history!.metadata).toBeDefined();
    const meta = history!.metadata as Record<string, unknown>;
    expect(meta.failureReason).toBe("UNSAFE_AREA");
    expect(meta.evidenceUrls).toEqual(["https://example.com/evidence.jpg"]);
  });

  // -----------------------------------------------------------------------
  // 18. Notes and evidenceUrls saved on COMPLETED
  // -----------------------------------------------------------------------
  test("notes and evidenceUrls are saved when stop is COMPLETED", async () => {
    const { stop } = await freshStop({ status: "IN_PROGRESS" });
    const proofUrls = ["https://example.com/signature.png"];

    const res = await patchStop(stop.id, {
      status: "COMPLETED",
      notes: "Left at reception",
      evidenceUrls: proofUrls,
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.notes).toBe("Left at reception");
    expect(body.data.evidenceUrls).toEqual(proofUrls);

    // Verify history also captured the evidence
    const history = await testDb.query.routeStopHistory.findFirst({
      where: eq(routeStopHistory.routeStopId, stop.id),
    });
    expect(history).toBeDefined();
    expect(history!.previousStatus).toBe("IN_PROGRESS");
    expect(history!.newStatus).toBe("COMPLETED");
    const meta = history!.metadata as Record<string, unknown>;
    expect(meta.evidenceUrls).toEqual(proofUrls);
  });
});
