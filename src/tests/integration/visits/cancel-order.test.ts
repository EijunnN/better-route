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
  createOrder,
} from "../setup/test-data";
import { orders } from "@/db/schema";
import { POST as CANCEL } from "@/app/api/orders/[id]/cancel/route";

/**
 * Issue 005 — definitive Order cancellation.
 *
 * Validates POST /api/orders/:id/cancel persists the categorised
 * reason, transitions to CANCELLED (terminal), and is fenced behind
 * PLANIFICADOR / ADMIN_FLOTA / ADMIN_SISTEMA.
 */
describe("POST /api/orders/:id/cancel (issue 005)", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let planner: Awaited<ReturnType<typeof createPlanner>>;
  let driverUser: Awaited<ReturnType<typeof createDriver>>;
  let adminToken: string;
  let plannerToken: string;
  let driverToken: string;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    admin = await createAdmin(null);
    planner = await createPlanner(company.id);
    driverUser = await createDriver(company.id);

    adminToken = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: admin.role,
    });
    plannerToken = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });
    driverToken = await createTestToken({
      userId: driverUser.id,
      companyId: company.id,
      email: driverUser.email,
      role: driverUser.role,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  async function cancelAs(
    token: string,
    orderId: string,
    body: Record<string, unknown>,
  ) {
    const req = await createTestRequest(`/api/orders/${orderId}/cancel`, {
      method: "POST",
      body,
      token,
      companyId: company.id,
    });
    return await CANCEL(req, { params: Promise.resolve({ id: orderId }) });
  }

  test("PLANIFICADOR can cancel a PENDING order with categorised reason", async () => {
    const order = await createOrder({ companyId: company.id });
    const res = await cancelAs(plannerToken, order.id, {
      reasonCategory: "customer_request",
      reasonNote: "Cliente pidió cancelar la compra por teléfono",
    });
    expect(res.status).toBe(200);

    const fresh = await testDb.query.orders.findFirst({
      where: eq(orders.id, order.id),
    });
    expect(fresh?.status).toBe("CANCELLED");
    expect(fresh?.cancellationReasonCategory).toBe("customer_request");
    expect(fresh?.cancellationReasonNote).toBe(
      "Cliente pidió cancelar la compra por teléfono",
    );
  });

  test("CONDUCTOR cannot cancel — receives 403", async () => {
    const order = await createOrder({ companyId: company.id });
    const res = await cancelAs(driverToken, order.id, {
      reasonCategory: "customer_request",
      reasonNote: "intento ilegal",
    });
    expect(res.status).toBe(403);
  });

  test("rejects unknown category with 400", async () => {
    const order = await createOrder({ companyId: company.id });
    const res = await cancelAs(plannerToken, order.id, {
      reasonCategory: "bogus",
      reasonNote: "blah",
    });
    expect(res.status).toBe(400);
  });

  test("rejects empty reasonNote with 400", async () => {
    const order = await createOrder({ companyId: company.id });
    const res = await cancelAs(plannerToken, order.id, {
      reasonCategory: "other",
      reasonNote: "  ",
    });
    expect(res.status).toBe(400);
  });

  test("cancelling an already-CANCELLED order returns 409", async () => {
    const order = await createOrder({ companyId: company.id });
    await cancelAs(plannerToken, order.id, {
      reasonCategory: "address_invalid",
      reasonNote: "primer cancel",
    });
    const second = await cancelAs(plannerToken, order.id, {
      reasonCategory: "other",
      reasonNote: "intento doble",
    });
    expect(second.status).toBe(409);
  });

  test("cancelling a COMPLETED order returns 409", async () => {
    const order = await createOrder({ companyId: company.id });
    await testDb
      .update(orders)
      .set({ status: "COMPLETED" })
      .where(eq(orders.id, order.id));

    const res = await cancelAs(plannerToken, order.id, {
      reasonCategory: "customer_request",
      reasonNote: "no debería poder",
    });
    expect(res.status).toBe(409);
  });

  test("ADMIN_SISTEMA can cancel as well", async () => {
    const order = await createOrder({ companyId: company.id });
    const res = await cancelAs(adminToken, order.id, {
      reasonCategory: "product_not_available",
      reasonNote: "stock agotado",
    });
    expect(res.status).toBe(200);
    const fresh = await testDb.query.orders.findFirst({
      where: eq(orders.id, order.id),
    });
    expect(fresh?.status).toBe("CANCELLED");
    expect(fresh?.cancellationReasonCategory).toBe("product_not_available");
  });
});
