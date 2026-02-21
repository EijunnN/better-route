import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq, and } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createPlanner,
  createOrder,
} from "../setup/test-data";
import { orders } from "@/db/schema";
import { POST } from "@/app/api/orders/batch/route";
import { DELETE } from "@/app/api/orders/batch/delete/route";

describe("Order Batch Operations", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let planner: Awaited<ReturnType<typeof createPlanner>>;
  let adminToken: string;
  let plannerToken: string;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    admin = await createAdmin(null);
    planner = await createPlanner(company.id);
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
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ---------------------------------------------------------------------------
  // 1. Batch create multiple orders (201)
  // ---------------------------------------------------------------------------
  test("POST /api/orders/batch creates multiple orders", async () => {
    const request = await createTestRequest("/api/orders/batch", {
      method: "POST",
      token: plannerToken,
      companyId: company.id,
      userId: planner.id,
      body: {
        orders: [
          {
            trackingId: "BATCH-001",
            address: "Av. Arequipa 100, Lima",
            latitude: "-12.0464",
            longitude: "-77.0428",
            customerName: "Juan Perez",
          },
          {
            trackingId: "BATCH-002",
            address: "Jr. Lima 200, Lima",
            latitude: "-12.0500",
            longitude: "-77.0400",
            customerName: "Maria Lopez",
          },
          {
            trackingId: "BATCH-003",
            address: "Av. Brasil 300, Lima",
            latitude: "-12.0550",
            longitude: "-77.0350",
          },
        ],
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.created).toBe(3);
    expect(data.skipped).toBe(0);

    // Verify records in DB
    const dbOrders = await testDb
      .select()
      .from(orders)
      .where(
        and(eq(orders.companyId, company.id), eq(orders.active, true)),
      );
    const batchIds = dbOrders
      .filter((o) => o.trackingId.startsWith("BATCH-"))
      .map((o) => o.trackingId);
    expect(batchIds).toContain("BATCH-001");
    expect(batchIds).toContain("BATCH-002");
    expect(batchIds).toContain("BATCH-003");
  });

  // ---------------------------------------------------------------------------
  // 2. Duplicate tracking IDs handled (skip duplicates)
  // ---------------------------------------------------------------------------
  test("POST /api/orders/batch skips duplicate trackingIds", async () => {
    // Create an existing order first
    await createOrder({ companyId: company.id, trackingId: "DUP-BATCH-001" });

    const request = await createTestRequest("/api/orders/batch", {
      method: "POST",
      token: plannerToken,
      companyId: company.id,
      userId: planner.id,
      body: {
        orders: [
          {
            trackingId: "DUP-BATCH-001",
            address: "Av. Test 1",
            latitude: "-12.0464",
            longitude: "-77.0428",
          },
          {
            trackingId: "DUP-BATCH-NEW",
            address: "Av. Test 2",
            latitude: "-12.0500",
            longitude: "-77.0400",
          },
        ],
        skipDuplicates: true,
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.created).toBe(1);
    expect(data.skipped).toBe(1);
    expect(data.duplicates).toContain("DUP-BATCH-001");
  });

  // ---------------------------------------------------------------------------
  // 3. Batch with invalid data: valid created, invalid filtered
  // ---------------------------------------------------------------------------
  test("POST /api/orders/batch creates valid orders and reports invalid ones", async () => {
    const request = await createTestRequest("/api/orders/batch", {
      method: "POST",
      token: plannerToken,
      companyId: company.id,
      userId: planner.id,
      body: {
        orders: [
          {
            trackingId: "MIX-VALID",
            address: "Av. Valid 100",
            latitude: "-12.0464",
            longitude: "-77.0428",
          },
          {
            // Invalid: coordinates at 0,0
            trackingId: "MIX-INVALID-ZERO",
            address: "Av. Invalid Zero",
            latitude: "0",
            longitude: "0",
          },
          {
            // Invalid: latitude out of range
            trackingId: "MIX-INVALID-RANGE",
            address: "Av. Invalid Range",
            latitude: "999",
            longitude: "-77.0400",
          },
        ],
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.created).toBe(1);
    expect(data.invalid).toBe(2);
    expect(data.invalidOrders).toContain("MIX-INVALID-ZERO");
    expect(data.invalidOrders).toContain("MIX-INVALID-RANGE");

    // Verify only valid order in DB
    const [validOrder] = await testDb
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.companyId, company.id),
          eq(orders.trackingId, "MIX-VALID"),
        ),
      );
    expect(validOrder).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 4. Empty batch returns 400
  // ---------------------------------------------------------------------------
  test("POST /api/orders/batch with empty array returns 400", async () => {
    const request = await createTestRequest("/api/orders/batch", {
      method: "POST",
      token: plannerToken,
      companyId: company.id,
      userId: planner.id,
      body: {
        orders: [],
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Validation failed");
  });

  // ---------------------------------------------------------------------------
  // 5. Batch delete soft-deletes (active=false)
  // ---------------------------------------------------------------------------
  test("DELETE /api/orders/batch/delete soft-deletes orders", async () => {
    // Create orders to delete
    const o1 = await createOrder({
      companyId: company.id,
      trackingId: "SOFT-DEL-001",
    });
    const o2 = await createOrder({
      companyId: company.id,
      trackingId: "SOFT-DEL-002",
    });

    const request = await createTestRequest("/api/orders/batch/delete", {
      method: "DELETE",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.deleted).toBeGreaterThanOrEqual(2);
    expect(data.message).toContain("marked as inactive");

    // Verify in DB: orders should be active=false
    const [dbO1] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, o1.id));
    expect(dbO1.active).toBe(false);

    const [dbO2] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, o2.id));
    expect(dbO2.active).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 6. Hard delete requires ADMIN_SISTEMA (BULK_DELETE permission)
  // ---------------------------------------------------------------------------
  test("DELETE /api/orders/batch/delete?hard=true with ADMIN_SISTEMA permanently deletes", async () => {
    // Create orders to hard-delete
    await createOrder({
      companyId: company.id,
      trackingId: "HARD-DEL-001",
    });
    await createOrder({
      companyId: company.id,
      trackingId: "HARD-DEL-002",
    });

    const request = await createTestRequest("/api/orders/batch/delete", {
      method: "DELETE",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
      searchParams: { hard: "true" },
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.deleted).toBeGreaterThanOrEqual(2);
    expect(data.message).toContain("permanently deleted");

    // Verify records are gone from DB
    const remaining = await testDb
      .select()
      .from(orders)
      .where(eq(orders.companyId, company.id));
    const hardDelIds = remaining.filter(
      (o) =>
        o.trackingId === "HARD-DEL-001" || o.trackingId === "HARD-DEL-002",
    );
    expect(hardDelIds).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 7. PLANIFICADOR cannot hard delete (403)
  // ---------------------------------------------------------------------------
  test("DELETE /api/orders/batch/delete?hard=true with PLANIFICADOR returns 403", async () => {
    // Create an order so there is something to attempt to delete
    await createOrder({
      companyId: company.id,
      trackingId: "NO-HARD-DEL",
    });

    const request = await createTestRequest("/api/orders/batch/delete", {
      method: "DELETE",
      token: plannerToken,
      companyId: company.id,
      userId: planner.id,
      searchParams: { hard: "true" },
    });

    const response = await DELETE(request);
    expect(response.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // 8. Tenant isolation - Company B operations don't affect Company A
  // ---------------------------------------------------------------------------
  test("batch operations enforce tenant isolation", async () => {
    // Create Company A order
    const orderA = await createOrder({
      companyId: company.id,
      trackingId: "ISO-A-001",
    });

    // Create Company B with its own admin
    const companyB = await createCompany();
    const adminB = await createAdmin(null);
    const adminBToken = await createTestToken({
      userId: adminB.id,
      companyId: companyB.id,
      email: adminB.email,
      role: adminB.role,
    });

    // Batch create orders in Company B
    const createRequest = await createTestRequest("/api/orders/batch", {
      method: "POST",
      token: adminBToken,
      companyId: companyB.id,
      userId: adminB.id,
      body: {
        orders: [
          {
            trackingId: "ISO-B-001",
            address: "Av. CompanyB 100",
            latitude: "-12.0464",
            longitude: "-77.0428",
          },
        ],
      },
    });

    const createResponse = await POST(createRequest);
    const createData = await createResponse.json();
    expect(createData.success).toBe(true);
    expect(createData.created).toBe(1);

    // Batch delete all orders in Company B
    const deleteRequest = await createTestRequest("/api/orders/batch/delete", {
      method: "DELETE",
      token: adminBToken,
      companyId: companyB.id,
      userId: adminB.id,
      searchParams: { hard: "true" },
    });

    const deleteResponse = await DELETE(deleteRequest);
    const deleteData = await deleteResponse.json();
    expect(deleteData.success).toBe(true);

    // Verify Company A's order is untouched
    const [dbOrderA] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, orderA.id));
    expect(dbOrderA).toBeDefined();
    expect(dbOrderA.active).toBe(true);
    expect(dbOrderA.trackingId).toBe("ISO-A-001");

    // Verify Company B's orders are gone
    const companyBOrders = await testDb
      .select()
      .from(orders)
      .where(eq(orders.companyId, companyB.id));
    expect(companyBOrders).toHaveLength(0);
  });
});
