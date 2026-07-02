import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { PATCH } from "@/app/api/route-stops/[id]/route";
import { orders, routeStopHistory } from "@/db/schema";
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
 * La empresa de este suite NO tiene fila de delivery policy, así que el
 * handler corre con el fallback: `completedRequiresPhoto: true` y
 * `DEFAULT_FAILURE_REASONS` (lista no vacía → FAILED exige un reason
 * no-blank). Por ADR-0011 el reason es free text opaco: se almacena
 * verbatim y la membresía en la lista NO se valida. La validación fina
 * del cierre (trim, merge-patch de notes, policy explícita) vive en
 * route-stop-close-validation.test.ts.
 */
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
  async function freshStop(
    overrides: {
      status?: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
      userId?: string;
      failureReason?: string;
      evidenceUrls?: string[];
      orderStatus?:
        | "PENDING"
        | "ASSIGNED"
        | "COMPLETED"
        | "FAILED"
        | "IN_PROGRESS"
        | "CANCELLED";
    } = {},
  ) {
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
      failureReason: overrides.failureReason,
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

    // El fallback de policy exige foto para COMPLETED; el sujeto de este
    // test es completedAt + sync de la orden, no el guard de evidencia.
    const res = await patchStop(stop.id, {
      status: "COMPLETED",
      evidenceUrls: ["https://example.com/pod.jpg"],
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.status).toBe("COMPLETED");
    expect(body.data.completedAt).toBeTruthy();

    // Verify order status in DB
    const dbOrder = await testDb.query.orders.findFirst({
      where: eq(orders.id, order.id),
    });
    expect(dbOrder?.status).toBe("COMPLETED");
  });

  // -----------------------------------------------------------------------
  // 3. IN_PROGRESS → FAILED with a free-text reason saves it verbatim
  // -----------------------------------------------------------------------
  test("IN_PROGRESS → FAILED with a free-text reason saves failureReason verbatim", async () => {
    const { stop } = await freshStop({ status: "IN_PROGRESS" });

    const res = await patchStop(stop.id, {
      status: "FAILED",
      failureReason: "Cliente ausente",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.status).toBe("FAILED");
    expect(body.data.failureReason).toBe("Cliente ausente");
  });

  // -----------------------------------------------------------------------
  // 5. FAILED → PENDING (retry) clears failureReason and evidenceUrls
  // -----------------------------------------------------------------------
  test("FAILED → PENDING (retry) clears failureReason and evidenceUrls", async () => {
    const { stop } = await freshStop({
      status: "FAILED",
      failureReason: "Paquete dañado",
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
  // Sin fila de policy, el fallback DEFAULT_FAILURE_REASONS (no vacío)
  // hace obligatorio el reason. El 400 no enumera valores válidos:
  // por ADR-0011 no existe una lista cerrada que devolver.
  test("PENDING → FAILED without failureReason returns 400", async () => {
    const { stop } = await freshStop({ status: "PENDING" });

    const res = await patchStop(stop.id, { status: "FAILED" });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toMatch(/failureReason/i);
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
  // 9. COMPLETED without evidence → 400 (fallback completedRequiresPhoto)
  // -----------------------------------------------------------------------
  test("IN_PROGRESS → COMPLETED without evidenceUrls returns 400 (photo required by default policy)", async () => {
    const { stop } = await freshStop({ status: "IN_PROGRESS" });

    const res = await patchStop(stop.id, { status: "COMPLETED" });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toMatch(/foto/i);
  });

  // -----------------------------------------------------------------------
  // 10. FAILED with a reason outside the default list → accepted (ADR-0011)
  // -----------------------------------------------------------------------
  // Membresía deliberadamente NO validada: una policy cacheada stale en el
  // device no puede convertir una falla real en un 400 permanente. Acá se
  // ejercita el path de fallback (sin fila de policy); el path con policy
  // explícita vive en route-stop-close-validation.test.ts.
  test("FAILED with a reason not in the default list is accepted verbatim", async () => {
    const { stop } = await freshStop({ status: "IN_PROGRESS" });

    const res = await patchStop(stop.id, {
      status: "FAILED",
      failureReason: "Motivo fuera de la lista default",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.status).toBe("FAILED");
    expect(body.data.failureReason).toBe("Motivo fuera de la lista default");
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
      failureReason: "Dirección incorrecta",
      evidenceUrls: urls,
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.failureReason).toBe("Dirección incorrecta");
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

    const res = await patchStop(stop.id, {
      status: "COMPLETED",
      evidenceUrls: ["https://example.com/pod.jpg"],
    });
    expect(res.status).toBe(200);

    const dbOrder = await testDb.query.orders.findFirst({
      where: eq(orders.id, order.id),
    });
    expect(dbOrder?.status).toBe("COMPLETED");
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
    expect(dbOrder?.status).toBe("IN_PROGRESS");
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
    expect(dbOrder?.status).toBe("CANCELLED");
  });

  // -----------------------------------------------------------------------
  // 15. CONDUCTOR can update own stop
  // -----------------------------------------------------------------------
  test("CONDUCTOR can update their own stop", async () => {
    const { stop } = await freshStop({
      status: "PENDING",
      userId: driver.id,
    });

    const res = await patchStop(
      stop.id,
      { status: "IN_PROGRESS" },
      {
        token: driverToken,
        userId: driver.id,
      },
    );
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
    const res = await patchStop(
      stop.id,
      { status: "IN_PROGRESS" },
      {
        token: driverBToken,
        userId: driverB.id,
      },
    );
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
      failureReason: "Zona insegura",
      notes: "Zone was restricted",
      evidenceUrls: ["https://example.com/evidence.jpg"],
    });
    expect(res.status).toBe(200);

    const history = await testDb.query.routeStopHistory.findFirst({
      where: eq(routeStopHistory.routeStopId, stop.id),
    });

    expect(history).toBeDefined();
    expect(history?.previousStatus).toBe("IN_PROGRESS");
    expect(history?.newStatus).toBe("FAILED");
    expect(history?.notes).toBe("Zone was restricted");
    expect(history?.metadata).toBeDefined();
    const meta = history?.metadata as Record<string, unknown>;
    expect(meta.failureReason).toBe("Zona insegura");
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
    expect(history?.previousStatus).toBe("IN_PROGRESS");
    expect(history?.newStatus).toBe("COMPLETED");
    const meta = history?.metadata as Record<string, unknown>;
    expect(meta.evidenceUrls).toEqual(proofUrls);
  });
});
