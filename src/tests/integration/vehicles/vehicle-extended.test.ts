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
  createDriver,
  createVehicle,
  createFleet,
} from "../setup/test-data";
import { vehicles, vehicleStatusHistory, vehicleFleets } from "@/db/schema";
import { GET as GET_STATUS_HISTORY } from "@/app/api/vehicles/[id]/status-history/route";
import { GET as GET_AVAILABLE } from "@/app/api/vehicles/available/route";

describe("Vehicle Extended — status-history & available", () => {
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

  // =========================================================================
  // GET /api/vehicles/[id]/status-history
  // =========================================================================

  describe("GET /api/vehicles/[id]/status-history", () => {
    // ---------------------------------------------------------------------
    // 1. Returns paginated history
    // ---------------------------------------------------------------------
    test("returns paginated status history for a vehicle", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "SH-001",
      });

      // Insert 3 history records directly
      await testDb.insert(vehicleStatusHistory).values([
        {
          companyId: company.id,
          vehicleId: vehicle.id,
          previousStatus: "AVAILABLE",
          newStatus: "IN_MAINTENANCE",
          userId: admin.id,
          reason: "Scheduled maintenance",
        },
        {
          companyId: company.id,
          vehicleId: vehicle.id,
          previousStatus: "IN_MAINTENANCE",
          newStatus: "AVAILABLE",
          userId: admin.id,
          reason: "Maintenance completed",
        },
        {
          companyId: company.id,
          vehicleId: vehicle.id,
          previousStatus: "AVAILABLE",
          newStatus: "INACTIVE",
          userId: admin.id,
          reason: "Retired",
        },
      ]);

      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/status-history`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
          searchParams: { limit: "2", offset: "0" },
        },
      );

      const response = await GET_STATUS_HISTORY(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.history).toBeDefined();
      expect(body.history.length).toBe(2);
      expect(body.limit).toBe(2);
      expect(body.offset).toBe(0);
    });

    // ---------------------------------------------------------------------
    // 2. Includes user who made the change
    // ---------------------------------------------------------------------
    test("includes user name who made the status change", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "SH-002",
      });

      await testDb.insert(vehicleStatusHistory).values({
        companyId: company.id,
        vehicleId: vehicle.id,
        previousStatus: "AVAILABLE",
        newStatus: "IN_MAINTENANCE",
        userId: admin.id,
        reason: "Oil change",
      });

      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/status-history`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await GET_STATUS_HISTORY(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.history.length).toBe(1);
      expect(body.history[0].userId).toBe(admin.id);
      expect(body.history[0].userName).toBe(admin.name);
      expect(body.history[0].previousStatus).toBe("AVAILABLE");
      expect(body.history[0].newStatus).toBe("IN_MAINTENANCE");
      expect(body.history[0].reason).toBe("Oil change");
    });

    // ---------------------------------------------------------------------
    // 3. Non-existent vehicle returns 404
    // ---------------------------------------------------------------------
    test("returns 404 for non-existent vehicle", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      const request = await createTestRequest(
        `/api/vehicles/${fakeId}/status-history`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await GET_STATUS_HISTORY(request, {
        params: Promise.resolve({ id: fakeId }),
      });
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe("Vehicle not found");
    });
  });

  // =========================================================================
  // GET /api/vehicles/available
  // =========================================================================

  describe("GET /api/vehicles/available", () => {
    // ---------------------------------------------------------------------
    // 4. Lists AVAILABLE status vehicles only
    // ---------------------------------------------------------------------
    test("lists only vehicles with AVAILABLE status", async () => {
      await createVehicle({
        companyId: company.id,
        plate: "AV-001",
        status: "AVAILABLE",
      });
      await createVehicle({
        companyId: company.id,
        plate: "AV-002",
        status: "AVAILABLE",
      });
      await createVehicle({
        companyId: company.id,
        plate: "MT-001",
        status: "IN_MAINTENANCE",
      });
      await createVehicle({
        companyId: company.id,
        plate: "IN-001",
        status: "INACTIVE",
        active: true,
      });

      const request = await createTestRequest("/api/vehicles/available", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await GET_AVAILABLE(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBe(2);
      expect(body.vehicles.length).toBe(2);
      expect(body.data.every((v: any) => v.status === "AVAILABLE")).toBe(true);
      expect(body.total).toBe(2);
    });

    // ---------------------------------------------------------------------
    // 5. Filters by fleetId
    // ---------------------------------------------------------------------
    test("filters available vehicles by fleetId", async () => {
      const fleet = await createFleet({ companyId: company.id });
      const vehicleInFleet = await createVehicle({
        companyId: company.id,
        plate: "FL-001",
        status: "AVAILABLE",
      });
      await createVehicle({
        companyId: company.id,
        plate: "FL-002",
        status: "AVAILABLE",
      });

      // Associate vehicle with fleet
      await testDb.insert(vehicleFleets).values({
        companyId: company.id,
        vehicleId: vehicleInFleet.id,
        fleetId: fleet.id,
        active: true,
      });

      const request = await createTestRequest("/api/vehicles/available", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { fleetId: fleet.id },
      });

      const response = await GET_AVAILABLE(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].id).toBe(vehicleInFleet.id);
    });

    // ---------------------------------------------------------------------
    // 6. Includes fleet and driver info
    // ---------------------------------------------------------------------
    test("includes fleet and assigned driver info", async () => {
      const fleet = await createFleet({
        companyId: company.id,
        name: "Fleet Alpha",
      });
      const driver = await createDriver(company.id);
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "INFO-001",
        status: "AVAILABLE",
        assignedDriverId: driver.id,
      });

      // Associate vehicle with fleet
      await testDb.insert(vehicleFleets).values({
        companyId: company.id,
        vehicleId: vehicle.id,
        fleetId: fleet.id,
        active: true,
      });

      const request = await createTestRequest("/api/vehicles/available", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await GET_AVAILABLE(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      const v = body.data.find((item: any) => item.id === vehicle.id);
      expect(v).toBeDefined();
      expect(v.fleets.length).toBe(1);
      expect(v.fleets[0].name).toBe("Fleet Alpha");
      expect(v.fleetIds).toContain(fleet.id);
      expect(v.assignedDriver).toBeDefined();
      expect(v.assignedDriver.id).toBe(driver.id);
      expect(v.assignedDriver.name).toBe(driver.name);
    });

    // ---------------------------------------------------------------------
    // 7. Pagination works
    // ---------------------------------------------------------------------
    test("pagination works correctly", async () => {
      // Create 3 available vehicles
      await createVehicle({
        companyId: company.id,
        plate: "PG-001",
        status: "AVAILABLE",
      });
      await createVehicle({
        companyId: company.id,
        plate: "PG-002",
        status: "AVAILABLE",
      });
      await createVehicle({
        companyId: company.id,
        plate: "PG-003",
        status: "AVAILABLE",
      });

      // Page 1
      const req1 = await createTestRequest("/api/vehicles/available", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { limit: "2", offset: "0" },
      });

      const res1 = await GET_AVAILABLE(req1);
      expect(res1.status).toBe(200);

      const body1 = await res1.json();
      expect(body1.data.length).toBe(2);
      expect(body1.total).toBe(3);
      expect(body1.limit).toBe(2);
      expect(body1.offset).toBe(0);

      // Page 2
      const req2 = await createTestRequest("/api/vehicles/available", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { limit: "2", offset: "2" },
      });

      const res2 = await GET_AVAILABLE(req2);
      expect(res2.status).toBe(200);

      const body2 = await res2.json();
      expect(body2.data.length).toBe(1);
      expect(body2.offset).toBe(2);
    });

    // ---------------------------------------------------------------------
    // 8. Empty fleet returns empty array
    // ---------------------------------------------------------------------
    test("returns empty array when fleetId has no vehicles", async () => {
      const emptyFleet = await createFleet({ companyId: company.id });

      const request = await createTestRequest("/api/vehicles/available", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { fleetId: emptyFleet.id },
      });

      const response = await GET_AVAILABLE(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data).toEqual([]);
      expect(body.vehicles).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  // =========================================================================
  // Tenant isolation
  // =========================================================================

  describe("Tenant isolation", () => {
    test("company B cannot see company A vehicle status history", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "ISO-001",
      });

      // Insert history for company A's vehicle
      await testDb.insert(vehicleStatusHistory).values({
        companyId: company.id,
        vehicleId: vehicle.id,
        previousStatus: "AVAILABLE",
        newStatus: "IN_MAINTENANCE",
        userId: admin.id,
        reason: "Test",
      });

      // Create company B
      const companyB = await createCompany();
      const adminB = await createAdmin(companyB.id);
      const tokenB = await createTestToken({
        userId: adminB.id,
        companyId: companyB.id,
        email: adminB.email,
        role: adminB.role,
      });

      // Company B tries to get status history for company A's vehicle
      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/status-history`,
        {
          method: "GET",
          token: tokenB,
          companyId: companyB.id,
          userId: adminB.id,
        },
      );

      const response = await GET_STATUS_HISTORY(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe("Vehicle not found");
    });

    test("company B cannot see company A available vehicles", async () => {
      await createVehicle({
        companyId: company.id,
        plate: "ISO-002",
        status: "AVAILABLE",
      });

      // Create company B
      const companyB = await createCompany();
      const adminB = await createAdmin(companyB.id);
      const tokenB = await createTestToken({
        userId: adminB.id,
        companyId: companyB.id,
        email: adminB.email,
        role: adminB.role,
      });

      const request = await createTestRequest("/api/vehicles/available", {
        method: "GET",
        token: tokenB,
        companyId: companyB.id,
        userId: adminB.id,
      });

      const response = await GET_AVAILABLE(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      // Company B should see 0 available vehicles
      expect(body.data.length).toBe(0);
      expect(body.total).toBe(0);
    });
  });
});
