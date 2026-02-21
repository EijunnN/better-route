import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { eq, and } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createPlanner,
  createOrder,
  createDriver,
} from "../setup/test-data";
import { orders } from "@/db/schema";
import { GET, POST } from "@/app/api/orders/route";
import {
  PATCH,
  DELETE,
  GET as GET_ONE,
} from "@/app/api/orders/[id]/route";

describe("Order CRUD", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let planner: Awaited<ReturnType<typeof createPlanner>>;
  let token: string;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    planner = await createPlanner(company.id);
    token = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });
  });

  beforeEach(async () => {
    await testDb
      .delete(orders)
      .where(eq(orders.companyId, company.id));
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // 1. Create order with valid data
  test("POST /api/orders creates order with valid data", async () => {
    const body = {
      trackingId: "TRK-001",
      address: "Av. Javier Prado 123, Lima",
      latitude: "-12.0464",
      longitude: "-77.0428",
      customerName: "Juan Perez",
    };

    const request = await createTestRequest("/api/orders", {
      method: "POST",
      token,
      companyId: company.id,
      userId: planner.id,
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.trackingId).toBe("TRK-001");
    expect(data.address).toBe("Av. Javier Prado 123, Lima");
    expect(data.customerName).toBe("Juan Perez");
    expect(data.status).toBe("PENDING");

    // Verify record in DB
    const [dbRecord] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, data.id));
    expect(dbRecord).toBeDefined();
    expect(dbRecord.trackingId).toBe("TRK-001");
    expect(dbRecord.companyId).toBe(company.id);
  });

  // 2. Duplicate trackingId returns 409
  test("POST /api/orders returns 409 for duplicate trackingId", async () => {
    await createOrder({ companyId: company.id, trackingId: "TRK-DUP" });

    const request = await createTestRequest("/api/orders", {
      method: "POST",
      token,
      companyId: company.id,
      userId: planner.id,
      body: {
        trackingId: "TRK-DUP",
        address: "Av. Test 456",
        latitude: "-12.0500",
        longitude: "-77.0500",
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(409);

    const data = await response.json();
    expect(data.error).toContain("tracking ID already exists");
  });

  // 3. List orders with status filter
  test("GET /api/orders filters by status", async () => {
    await createOrder({
      companyId: company.id,
      trackingId: "TRK-P1",
      status: "PENDING",
    });
    await createOrder({
      companyId: company.id,
      trackingId: "TRK-P2",
      status: "PENDING",
    });
    await createOrder({
      companyId: company.id,
      trackingId: "TRK-A1",
      status: "ASSIGNED",
    });

    const request = await createTestRequest("/api/orders", {
      method: "GET",
      token,
      companyId: company.id,
      userId: planner.id,
      searchParams: { status: "PENDING" },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const { data, meta } = await response.json();
    expect(data).toHaveLength(2);
    expect(data.every((o: { status: string }) => o.status === "PENDING")).toBe(
      true,
    );
  });

  // 4. Update order with PATCH
  test("PATCH /api/orders/:id updates order", async () => {
    const order = await createOrder({
      companyId: company.id,
      trackingId: "TRK-UPD",
    });

    const request = await createTestRequest(`/api/orders/${order.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: planner.id,
      body: { customerName: "Updated Name" },
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: order.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.customerName).toBe("Updated Name");

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(dbRecord.customerName).toBe("Updated Name");
  });

  // 5. Custom field merge (null deletes)
  test("PATCH /api/orders/:id merges custom fields and deletes nulls", async () => {
    const order = await createOrder({
      companyId: company.id,
      trackingId: "TRK-CF",
      customFields: { a: 1, c: 3 },
    });

    const request = await createTestRequest(`/api/orders/${order.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: planner.id,
      body: { customFields: { b: 2, a: null } },
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: order.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.customFields).toEqual({ b: 2, c: 3 });
    expect(data.customFields.a).toBeUndefined();
  });

  // 6. Soft delete (requires ADMIN_SISTEMA — PLANIFICADOR lacks ORDER:DELETE)
  test("DELETE /api/orders/:id soft deletes order", async () => {
    const admin = await createAdmin(null);
    const adminToken = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: admin.role,
    });

    const order = await createOrder({
      companyId: company.id,
      trackingId: "TRK-DEL",
    });

    const request = await createTestRequest(`/api/orders/${order.id}`, {
      method: "DELETE",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: order.id }),
    });
    expect(response.status).toBe(200);

    // Verify in DB: active should be false
    const [dbRecord] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(dbRecord.active).toBe(false);
  });

  // 7. Tenant isolation
  test("GET /api/orders enforces tenant isolation", async () => {
    // Create order in company A
    await createOrder({
      companyId: company.id,
      trackingId: "TRK-ISO",
    });

    // Create company B with its own planner
    const companyB = await createCompany();
    const plannerB = await createPlanner(companyB.id);
    const tokenB = await createTestToken({
      userId: plannerB.id,
      companyId: companyB.id,
      email: plannerB.email,
      role: plannerB.role,
    });

    const request = await createTestRequest("/api/orders", {
      method: "GET",
      token: tokenB,
      companyId: companyB.id,
      userId: plannerB.id,
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const { data } = await response.json();
    expect(data).toHaveLength(0);
  });

  // 8. Missing auth returns 401
  test("request without auth returns 401", async () => {
    const request = await createTestRequest("/api/orders", {
      method: "GET",
    });

    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
