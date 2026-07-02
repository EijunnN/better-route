import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { PATCH } from "@/app/api/route-stops/[id]/route";
import { deliveryVisits, routeStops } from "@/db/schema";
import { createTestToken } from "../setup/test-auth";
import {
  createAdmin,
  createCompany,
  createDeliveryPolicy,
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
 * FIX-2 (web) + FIX-3 del contrato móvil (docs/API-CONTRACT-MOBILE.md §11)
 * y aea/docs/specs/offline-outbox.spec.md §6 (tests server-side):
 * - failureReason blank tras trim → 400 (sin validar membresía, ADR-0011).
 * - PATCH parcial: `notes` ausente no clobberea, null explícito borra.
 */
describe("PATCH /api/route-stops/[id] — close validation (FIX-2 / FIX-3)", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let adminToken: string;
  let driver: Awaited<ReturnType<typeof createDriver>>;
  let vehicle: Awaited<ReturnType<typeof createVehicle>>;
  let job: Awaited<ReturnType<typeof createOptimizationJob>>;

  async function freshStop(
    overrides: { status?: "PENDING" | "IN_PROGRESS"; notes?: string } = {},
  ) {
    const order = await createOrder({
      companyId: company.id,
      status: "ASSIGNED",
    });
    return createRouteStop({
      companyId: company.id,
      jobId: job.id,
      routeId: "route-close-validation",
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId: order.id,
      status: overrides.status ?? "IN_PROGRESS",
      notes: overrides.notes,
    });
  }

  async function patchStop(stopId: string, body: Record<string, unknown>) {
    const request = await createTestRequest(`/api/route-stops/${stopId}`, {
      method: "PATCH",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
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
    vehicle = await createVehicle({ companyId: company.id });
    const config = await createOptimizationConfig({ companyId: company.id });
    job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
    });
    await createDeliveryPolicy({
      companyId: company.id,
      completedRequiresPhoto: false,
      failureReasons: ["Cliente ausente", "Dirección no encontrada"],
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // -------------------------------------------------------------------------
  // FIX-2: no-blank tras trim
  // -------------------------------------------------------------------------
  test("FAILED with whitespace-only failureReason returns 400", async () => {
    const stop = await freshStop();

    const res = await patchStop(stop.id, {
      status: "FAILED",
      failureReason: "  ",
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toMatch(/failureReason/i);
  });

  test("FAILED without failureReason returns 400", async () => {
    const stop = await freshStop();

    const res = await patchStop(stop.id, { status: "FAILED" });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toMatch(/failureReason/i);
  });

  test("FAILED with non-string failureReason returns 400", async () => {
    const stop = await freshStop();

    const res = await patchStop(stop.id, {
      status: "FAILED",
      failureReason: 42,
    });
    expect(res.status).toBe(400);
  });

  test("FAILED with a reason NOT in the policy list is accepted (ADR-0011)", async () => {
    const stop = await freshStop();

    const res = await patchStop(stop.id, {
      status: "FAILED",
      failureReason: "Motivo de una policy cacheada stale",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.failureReason).toBe("Motivo de una policy cacheada stale");
  });

  test("FAILED with a padded non-blank reason is accepted verbatim", async () => {
    const stop = await freshStop();

    const res = await patchStop(stop.id, {
      status: "FAILED",
      failureReason: " Cliente ausente ",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.failureReason).toBe(" Cliente ausente ");
  });

  // -------------------------------------------------------------------------
  // FIX-3: merge-patch de notes
  // -------------------------------------------------------------------------
  test("status-only PATCH does NOT clobber existing notes", async () => {
    const stop = await freshStop({ status: "PENDING", notes: "nota previa" });

    const res = await patchStop(stop.id, { status: "IN_PROGRESS" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.notes).toBe("nota previa");

    const dbStop = await testDb.query.routeStops.findFirst({
      where: eq(routeStops.id, stop.id),
    });
    expect(dbStop?.notes).toBe("nota previa");
  });

  test("explicit notes: null clears existing notes", async () => {
    const stop = await freshStop({ status: "PENDING", notes: "nota previa" });

    const res = await patchStop(stop.id, {
      status: "IN_PROGRESS",
      notes: null,
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.notes).toBeNull();
  });

  test("notes present in body replaces the stored value", async () => {
    const stop = await freshStop({ status: "PENDING", notes: "nota previa" });

    const res = await patchStop(stop.id, {
      status: "IN_PROGRESS",
      notes: "nota nueva",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.notes).toBe("nota nueva");
  });

  test("close without notes snapshots the stop's current note in delivery_visits", async () => {
    const stop = await freshStop({ notes: "nota vigente" });

    const res = await patchStop(stop.id, { status: "COMPLETED" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.notes).toBe("nota vigente");

    const visit = await testDb.query.deliveryVisits.findFirst({
      where: eq(deliveryVisits.routeStopId, stop.id),
    });
    expect(visit?.notes).toBe("nota vigente");
  });

  test("customFields-only PATCH (short path) applies a provided notes", async () => {
    const stop = await freshStop({ status: "PENDING", notes: "nota previa" });

    const res = await patchStop(stop.id, {
      customFields: {},
      notes: "nota corta",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.status).toBe("PENDING");
    expect(body.data.notes).toBe("nota corta");

    const dbStop = await testDb.query.routeStops.findFirst({
      where: eq(routeStops.id, stop.id),
    });
    expect(dbStop?.notes).toBe("nota corta");
  });
});
