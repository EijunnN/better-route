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
  createVehicle,
  createFleet,
} from "../setup/test-data";
import { vehicles, vehicleStatusHistory, vehicleFleets } from "@/db/schema";
import { GET, POST } from "@/app/api/vehicles/route";
import {
  GET as GET_ONE,
  PATCH,
  DELETE,
} from "@/app/api/vehicles/[id]/route";
import { POST as STATUS_TRANSITION } from "@/app/api/vehicles/[id]/status-transition/route";

describe("Vehicle CRUD", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let token: string;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    admin = await createAdmin(company.id);
    token = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: admin.role,
    });
  });

  beforeEach(async () => {
    // Clean vehicle-related tables between tests
    await testDb
      .delete(vehicleStatusHistory)
      .where(eq(vehicleStatusHistory.companyId, company.id));
    await testDb
      .delete(vehicleFleets)
      .where(eq(vehicleFleets.companyId, company.id));
    await testDb
      .delete(vehicles)
      .where(eq(vehicles.companyId, company.id));
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // -----------------------------------------------------------------------
  // 1. Create vehicle with valid data
  // -----------------------------------------------------------------------
  test("POST /api/vehicles creates vehicle with valid data (201)", async () => {
    const body = {
      name: "Camion 01",
      plate: "ABC-123",
      maxOrders: 30,
    };

    const request = await createTestRequest("/api/vehicles", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.name).toBe("Camion 01");
    expect(data.plate).toBe("ABC-123");
    expect(data.maxOrders).toBe(30);
    expect(data.status).toBe("AVAILABLE");
    expect(data.active).toBe(true);
    expect(data.companyId).toBe(company.id);

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, data.id));
    expect(dbRecord).toBeDefined();
    expect(dbRecord.name).toBe("Camion 01");
    expect(dbRecord.companyId).toBe(company.id);
  });

  // -----------------------------------------------------------------------
  // 2. Duplicate plate rejected
  // -----------------------------------------------------------------------
  test("POST /api/vehicles returns 400 for duplicate plate in same company", async () => {
    await createVehicle({ companyId: company.id, plate: "DUP-001" });

    const request = await createTestRequest("/api/vehicles", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Otro Camion",
        plate: "DUP-001",
        maxOrders: 10,
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe(
      "Ya existe un vehículo con esta matrícula en la empresa",
    );
  });

  // -----------------------------------------------------------------------
  // 3. Create with fleet association
  // -----------------------------------------------------------------------
  test("POST /api/vehicles creates vehicle with fleet association", async () => {
    const fleet = await createFleet({ companyId: company.id });

    const request = await createTestRequest("/api/vehicles", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Camion Flota",
        plate: "FLT-001",
        maxOrders: 15,
        fleetIds: [fleet.id],
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.fleetIds).toContain(fleet.id);

    // Verify junction table
    const junctions = await testDb
      .select()
      .from(vehicleFleets)
      .where(
        and(
          eq(vehicleFleets.vehicleId, data.id),
          eq(vehicleFleets.fleetId, fleet.id),
        ),
      );
    expect(junctions.length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 4. List with status filter + pagination
  // -----------------------------------------------------------------------
  test("GET /api/vehicles filters by status and paginates", async () => {
    await createVehicle({ companyId: company.id, status: "AVAILABLE", plate: "AV-001" });
    await createVehicle({ companyId: company.id, status: "AVAILABLE", plate: "AV-002" });
    await createVehicle({ companyId: company.id, status: "IN_MAINTENANCE", plate: "MT-001" });

    const request = await createTestRequest("/api/vehicles", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      searchParams: { status: "AVAILABLE" },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const { data, meta } = await response.json();
    expect(data.length).toBe(2);
    expect(data.every((v: any) => v.status === "AVAILABLE")).toBe(true);
    expect(meta.total).toBe(2);
  });

  // -----------------------------------------------------------------------
  // 5. Get single vehicle
  // -----------------------------------------------------------------------
  test("GET /api/vehicles/[id] returns vehicle by id", async () => {
    const vehicle = await createVehicle({ companyId: company.id, plate: "GET-001" });

    const request = await createTestRequest(`/api/vehicles/${vehicle.id}`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_ONE(request, {
      params: Promise.resolve({ id: vehicle.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.id).toBe(vehicle.id);
    expect(data.plate).toBe("GET-001");
  });

  // -----------------------------------------------------------------------
  // 6. 404 for non-existent vehicle
  // -----------------------------------------------------------------------
  test("GET /api/vehicles/[id] returns 404 for non-existent id", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const request = await createTestRequest(`/api/vehicles/${fakeId}`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_ONE(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("Vehicle not found");
  });

  // -----------------------------------------------------------------------
  // 7. Update name, maxOrders
  // -----------------------------------------------------------------------
  test("PATCH /api/vehicles/[id] updates name and maxOrders", async () => {
    const vehicle = await createVehicle({ companyId: company.id, plate: "UPD-001" });

    const request = await createTestRequest(`/api/vehicles/${vehicle.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { name: "Camion Actualizado", maxOrders: 50 },
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: vehicle.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.name).toBe("Camion Actualizado");
    expect(data.maxOrders).toBe(50);

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, vehicle.id));
    expect(dbRecord.name).toBe("Camion Actualizado");
    expect(dbRecord.maxOrders).toBe(50);
  });

  // -----------------------------------------------------------------------
  // 8. Soft delete (active=false)
  // -----------------------------------------------------------------------
  test("DELETE /api/vehicles/[id] soft-deletes vehicle", async () => {
    const vehicle = await createVehicle({ companyId: company.id, plate: "DEL-001" });

    const request = await createTestRequest(`/api/vehicles/${vehicle.id}`, {
      method: "DELETE",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: vehicle.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.active).toBe(false);

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, vehicle.id));
    expect(dbRecord.active).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 9. AVAILABLE -> IN_MAINTENANCE status transition
  // -----------------------------------------------------------------------
  test("POST /api/vehicles/[id]/status-transition AVAILABLE -> IN_MAINTENANCE", async () => {
    const vehicle = await createVehicle({
      companyId: company.id,
      status: "AVAILABLE",
      plate: "ST-001",
    });

    const request = await createTestRequest(
      `/api/vehicles/${vehicle.id}/status-transition`,
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { newStatus: "IN_MAINTENANCE", reason: "Scheduled maintenance" },
      },
    );

    const response = await STATUS_TRANSITION(request, {
      params: Promise.resolve({ id: vehicle.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.previousStatus).toBe("AVAILABLE");
    expect(data.newStatus).toBe("IN_MAINTENANCE");

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, vehicle.id));
    expect(dbRecord.status).toBe("IN_MAINTENANCE");
  });

  // -----------------------------------------------------------------------
  // 10. AVAILABLE -> INACTIVE status transition succeeds
  // -----------------------------------------------------------------------
  test("POST /api/vehicles/[id]/status-transition AVAILABLE -> INACTIVE", async () => {
    const vehicle = await createVehicle({
      companyId: company.id,
      status: "AVAILABLE",
      plate: "ST-002",
    });

    const request = await createTestRequest(
      `/api/vehicles/${vehicle.id}/status-transition`,
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { newStatus: "INACTIVE", reason: "Retiring vehicle" },
      },
    );

    const response = await STATUS_TRANSITION(request, {
      params: Promise.resolve({ id: vehicle.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.previousStatus).toBe("AVAILABLE");
    expect(data.newStatus).toBe("INACTIVE");
  });

  // -----------------------------------------------------------------------
  // 11. Invalid transition rejected (400)
  // -----------------------------------------------------------------------
  test("POST /api/vehicles/[id]/status-transition rejects invalid transition", async () => {
    const vehicle = await createVehicle({
      companyId: company.id,
      status: "IN_MAINTENANCE",
      plate: "ST-003",
    });

    // IN_MAINTENANCE -> ASSIGNED is not allowed per STATUS_TRANSITION_RULES
    const request = await createTestRequest(
      `/api/vehicles/${vehicle.id}/status-transition`,
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { newStatus: "ASSIGNED" },
      },
    );

    const response = await STATUS_TRANSITION(request, {
      params: Promise.resolve({ id: vehicle.id }),
    });
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.valid).toBe(false);
    expect(data.reason).toContain("Transición no permitida");
    expect(data.suggestedAlternativeStatuses).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 12. Status history record created after transition
  // -----------------------------------------------------------------------
  test("Status transition creates a vehicleStatusHistory record", async () => {
    const vehicle = await createVehicle({
      companyId: company.id,
      status: "AVAILABLE",
      plate: "SH-001",
    });

    const request = await createTestRequest(
      `/api/vehicles/${vehicle.id}/status-transition`,
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { newStatus: "IN_MAINTENANCE", reason: "Oil change" },
      },
    );

    const response = await STATUS_TRANSITION(request, {
      params: Promise.resolve({ id: vehicle.id }),
    });
    expect(response.status).toBe(200);

    // Verify history record in DB
    const historyRecords = await testDb
      .select()
      .from(vehicleStatusHistory)
      .where(
        and(
          eq(vehicleStatusHistory.vehicleId, vehicle.id),
          eq(vehicleStatusHistory.companyId, company.id),
        ),
      );
    expect(historyRecords.length).toBe(1);
    expect(historyRecords[0].previousStatus).toBe("AVAILABLE");
    expect(historyRecords[0].newStatus).toBe("IN_MAINTENANCE");
    expect(historyRecords[0].reason).toBe("Oil change");
    expect(historyRecords[0].userId).toBe(admin.id);
  });

  // -----------------------------------------------------------------------
  // 13. Tenant isolation - Company B cannot access Company A's vehicles
  // -----------------------------------------------------------------------
  test("Tenant isolation: company B cannot see company A vehicles", async () => {
    const vehicleA = await createVehicle({
      companyId: company.id,
      plate: "ISO-001",
    });

    // Create company B with its own user
    const companyB = await createCompany();
    const adminB = await createAdmin(companyB.id);
    const tokenB = await createTestToken({
      userId: adminB.id,
      companyId: companyB.id,
      email: adminB.email,
      role: adminB.role,
    });

    // Company B tries to GET company A's vehicle
    const request = await createTestRequest(`/api/vehicles/${vehicleA.id}`, {
      method: "GET",
      token: tokenB,
      companyId: companyB.id,
      userId: adminB.id,
    });

    const response = await GET_ONE(request, {
      params: Promise.resolve({ id: vehicleA.id }),
    });
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("Vehicle not found");
  });

  // -----------------------------------------------------------------------
  // 14. Missing auth returns 401
  // -----------------------------------------------------------------------
  test("GET /api/vehicles returns 401 without auth token", async () => {
    const request = await createTestRequest("/api/vehicles", {
      method: "GET",
      // No token, companyId, or userId
    });

    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
