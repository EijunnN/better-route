import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createOrder,
} from "../setup/test-data";
import { orders } from "@/db/schema";
import { POST as PREVIEW } from "@/app/api/orders/csv-import/preview/route";
import { POST as CONFIRM } from "@/app/api/orders/csv-import/confirm/route";

/**
 * Issue 006 — CSV import preview-and-confirm.
 *
 * Validates the two-phase classification flow: phase 1 categorises rows
 * into new / reactivable / skippedActive / skippedCancelled, phase 2
 * applies operator-selected actions and surfaces race conditions.
 */
describe("CSV import preview + confirm (issue 006)", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
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
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  function csvOf(rows: Array<Record<string, string>>, headers: string[]): string {
    const head = headers.join(",");
    const body = rows
      .map((r) => headers.map((h) => r[h] ?? "").join(","))
      .join("\n");
    return Buffer.from(`${head}\n${body}`).toString("base64");
  }

  async function preview(csvBase64: string) {
    const req = await createTestRequest("/api/orders/csv-import/preview", {
      method: "POST",
      body: { csvContent: csvBase64 },
      token,
      companyId: company.id,
    });
    const res = await PREVIEW(req);
    return { status: res.status, body: await res.json() };
  }

  async function confirm(payload: Record<string, unknown>) {
    const req = await createTestRequest("/api/orders/csv-import/confirm", {
      method: "POST",
      body: payload,
      token,
      companyId: company.id,
    });
    const res = await CONFIRM(req);
    return { status: res.status, body: await res.json() };
  }

  test("classifies rows into new / reactivable / skippedActive / skippedCancelled", async () => {
    // Existing FAILED → reactivable
    const failed = await createOrder({
      companyId: company.id,
      trackingId: "TRK-FAIL-1",
      status: "FAILED",
    });
    // Existing PENDING → skipped (active)
    const active = await createOrder({
      companyId: company.id,
      trackingId: "TRK-ACT-1",
      status: "PENDING",
    });
    // Existing CANCELLED → skipped (cancelled)
    const cancelled = await createOrder({
      companyId: company.id,
      trackingId: "TRK-CAN-1",
      status: "CANCELLED",
    });

    const headers = [
      "trackcode",
      "direccion",
      "latitud",
      "longitud",
      "nombre_cliente",
      "peso",
    ];
    const csv = csvOf(
      [
        { trackcode: "TRK-NEW-1", direccion: "Av. Nueva 1", latitud: "-12.10", longitud: "-77.00", nombre_cliente: "Cli A", peso: "10" },
        { trackcode: "TRK-NEW-2", direccion: "Av. Nueva 2", latitud: "-12.11", longitud: "-77.01", nombre_cliente: "Cli B", peso: "20" },
        { trackcode: "TRK-FAIL-1", direccion: "Av. Re 1", latitud: "-12.12", longitud: "-77.02", nombre_cliente: "Cli C", peso: "30" },
        { trackcode: "TRK-ACT-1", direccion: "Av. Sk 1", latitud: "-12.13", longitud: "-77.03", nombre_cliente: "Cli D", peso: "40" },
        { trackcode: "TRK-CAN-1", direccion: "Av. Sk 2", latitud: "-12.14", longitud: "-77.04", nombre_cliente: "Cli E", peso: "50" },
      ],
      headers,
    );

    const { status, body } = await preview(csv);
    expect(status).toBe(200);
    const p = body.data;
    expect(p.totalRows).toBe(5);
    expect(p.new.map((r: { trackingId: string }) => r.trackingId)).toEqual([
      "TRK-NEW-1",
      "TRK-NEW-2",
    ]);
    expect(p.reactivable).toHaveLength(1);
    expect(p.reactivable[0].existingOrderId).toBe(failed.id);
    expect(p.skippedActive).toHaveLength(1);
    expect(p.skippedActive[0].existingOrderId).toBe(active.id);
    expect(p.skippedActive[0].currentStatus).toBe("PENDING");
    expect(p.skippedCancelled).toHaveLength(1);
    expect(p.skippedCancelled[0].existingOrderId).toBe(cancelled.id);
  });

  test("confirm inserts new + reactivates selected; CANCELLED never reactivates", async () => {
    const failed = await createOrder({
      companyId: company.id,
      trackingId: "TRK-FAIL-2",
      status: "FAILED",
    });
    await createOrder({
      companyId: company.id,
      trackingId: "TRK-CAN-2",
      status: "CANCELLED",
    });

    const headers = ["trackcode", "direccion", "latitud", "longitud"];
    const csv = csvOf(
      [
        { trackcode: "TRK-INS-1", direccion: "Av. Ins 1", latitud: "-12", longitud: "-77" },
        { trackcode: "TRK-FAIL-2", direccion: "Av. Reactivada", latitud: "-12.5", longitud: "-77.5" },
        { trackcode: "TRK-CAN-2", direccion: "X", latitud: "-12", longitud: "-77" },
      ],
      headers,
    );

    const { body: previewBody } = await preview(csv);
    const previewId = previewBody.data.previewId;

    const { status, body } = await confirm({
      previewId,
      reactivableSelections: [failed.id],
    });
    expect(status).toBe(200);
    expect(body.data.inserted).toBe(1);
    expect(body.data.reactivated).toBe(1);
    expect(body.data.raceConditions).toEqual([]);

    const refreshedFailed = await testDb.query.orders.findFirst({
      where: eq(orders.id, failed.id),
    });
    expect(refreshedFailed?.status).toBe("PENDING");
    expect(refreshedFailed?.address).toBe("Av. Reactivada");

    const newOrder = await testDb.query.orders.findFirst({
      where: eq(orders.trackingId, "TRK-INS-1"),
    });
    expect(newOrder).toBeDefined();
    expect(newOrder?.status).toBe("PENDING");
  });

  test("race condition — order cancelled between preview and confirm is skipped, not corrupting", async () => {
    const failed = await createOrder({
      companyId: company.id,
      trackingId: "TRK-RACE-1",
      status: "FAILED",
    });

    const headers = ["trackcode", "direccion", "latitud", "longitud"];
    const csv = csvOf(
      [{ trackcode: "TRK-RACE-1", direccion: "Av. X", latitud: "-12", longitud: "-77" }],
      headers,
    );

    const { body: previewBody } = await preview(csv);
    const previewId = previewBody.data.previewId;

    // Simulate another operator cancelling the order between preview and confirm.
    await testDb
      .update(orders)
      .set({ status: "CANCELLED" })
      .where(eq(orders.id, failed.id));

    const { status, body } = await confirm({
      previewId,
      reactivableSelections: [failed.id],
    });
    expect(status).toBe(200);
    expect(body.data.reactivated).toBe(0);
    expect(body.data.raceConditions).toHaveLength(1);
    expect(body.data.raceConditions[0].existingOrderId).toBe(failed.id);
    expect(body.data.raceConditions[0].actualStatus).toBe("CANCELLED");

    // Confirm the order is still CANCELLED (not corrupted into PENDING).
    const after = await testDb.query.orders.findFirst({
      where: eq(orders.id, failed.id),
    });
    expect(after?.status).toBe("CANCELLED");
  });

  test("confirm with unknown previewId returns 404", async () => {
    const { status } = await confirm({
      previewId: "00000000-0000-0000-0000-000000000000",
    });
    expect(status).toBe(404);
  });

  test("confirm without previewId returns 400", async () => {
    const { status } = await confirm({});
    expect(status).toBe(400);
  });

  test("preview confined to the caller's company (cross-tenant TRKs not surfaced)", async () => {
    const otherCompany = await createCompany();
    await createOrder({
      companyId: otherCompany.id,
      trackingId: "TRK-XT-1",
      status: "FAILED",
    });

    const headers = ["trackcode", "direccion", "latitud", "longitud"];
    const csv = csvOf(
      [{ trackcode: "TRK-XT-1", direccion: "Av. X", latitud: "-12", longitud: "-77" }],
      headers,
    );

    const { body } = await preview(csv);
    // Caller company has never seen TRK-XT-1, so it falls into the "new" bucket.
    expect(body.data.new).toHaveLength(1);
    expect(body.data.reactivable).toHaveLength(0);
  });
});
