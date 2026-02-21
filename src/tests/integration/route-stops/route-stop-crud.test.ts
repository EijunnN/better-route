import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
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
import { routeStops, routeStopHistory } from "@/db/schema";
import { GET, POST } from "@/app/api/route-stops/route";
import { GET as GET_HISTORY } from "@/app/api/route-stops/[id]/history/route";

describe("Route Stop CRUD — list, create, history", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let token: string;
  let driver: Awaited<ReturnType<typeof createDriver>>;
  let vehicle: Awaited<ReturnType<typeof createVehicle>>;
  let config: Awaited<ReturnType<typeof createOptimizationConfig>>;
  let job: Awaited<ReturnType<typeof createOptimizationJob>>;

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
    config = await createOptimizationConfig({ companyId: company.id });
    job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
    });
  });

  beforeEach(async () => {
    // Clean route stops (cascade deletes history)
    await testDb
      .delete(routeStopHistory)
      .where(eq(routeStopHistory.companyId, company.id));
    await testDb
      .delete(routeStops)
      .where(eq(routeStops.companyId, company.id));
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // =========================================================================
  // GET /api/route-stops
  // =========================================================================

  describe("GET /api/route-stops", () => {
    // ---------------------------------------------------------------------
    // 1. Lists stops with filters
    // ---------------------------------------------------------------------
    test("lists stops with jobId filter", async () => {
      const order1 = await createOrder({ companyId: company.id });
      const order2 = await createOrder({ companyId: company.id });

      await createRouteStop({
        companyId: company.id,
        jobId: job.id,
        routeId: "route-1",
        userId: driver.id,
        vehicleId: vehicle.id,
        orderId: order1.id,
        sequence: 1,
      });
      await createRouteStop({
        companyId: company.id,
        jobId: job.id,
        routeId: "route-1",
        userId: driver.id,
        vehicleId: vehicle.id,
        orderId: order2.id,
        sequence: 2,
      });

      const request = await createTestRequest("/api/route-stops", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { jobId: job.id },
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBe(2);
      expect(body.data[0].sequence).toBeLessThanOrEqual(body.data[1].sequence);
    });

    test("filters by routeId", async () => {
      const order1 = await createOrder({ companyId: company.id });
      const order2 = await createOrder({ companyId: company.id });

      await createRouteStop({
        companyId: company.id,
        jobId: job.id,
        routeId: "route-A",
        userId: driver.id,
        vehicleId: vehicle.id,
        orderId: order1.id,
        sequence: 1,
      });
      await createRouteStop({
        companyId: company.id,
        jobId: job.id,
        routeId: "route-B",
        userId: driver.id,
        vehicleId: vehicle.id,
        orderId: order2.id,
        sequence: 1,
      });

      const request = await createTestRequest("/api/route-stops", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { routeId: "route-A" },
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].routeId).toBe("route-A");
    });

    test("filters by userId/driverId", async () => {
      const driverB = await createDriver(company.id);
      const order1 = await createOrder({ companyId: company.id });
      const order2 = await createOrder({ companyId: company.id });

      await createRouteStop({
        companyId: company.id,
        jobId: job.id,
        routeId: "route-1",
        userId: driver.id,
        vehicleId: vehicle.id,
        orderId: order1.id,
        sequence: 1,
      });
      await createRouteStop({
        companyId: company.id,
        jobId: job.id,
        routeId: "route-2",
        userId: driverB.id,
        vehicleId: vehicle.id,
        orderId: order2.id,
        sequence: 1,
      });

      const request = await createTestRequest("/api/route-stops", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { userId: driver.id },
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].userId).toBe(driver.id);
    });

    // ---------------------------------------------------------------------
    // 2. Pagination works
    // ---------------------------------------------------------------------
    test("pagination works correctly", async () => {
      // Create 3 stops
      for (let i = 1; i <= 3; i++) {
        const order = await createOrder({ companyId: company.id });
        await createRouteStop({
          companyId: company.id,
          jobId: job.id,
          routeId: "route-1",
          userId: driver.id,
          vehicleId: vehicle.id,
          orderId: order.id,
          sequence: i,
        });
      }

      // Page 1: limit 2
      const req1 = await createTestRequest("/api/route-stops", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { jobId: job.id, limit: "2", offset: "0" },
      });

      const res1 = await GET(req1);
      expect(res1.status).toBe(200);

      const body1 = await res1.json();
      expect(body1.data.length).toBe(2);
      expect(Number(body1.total)).toBe(3);
      expect(body1.limit).toBe(2);
      expect(body1.offset).toBe(0);

      // Page 2
      const req2 = await createTestRequest("/api/route-stops", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { jobId: job.id, limit: "2", offset: "2" },
      });

      const res2 = await GET(req2);
      expect(res2.status).toBe(200);

      const body2 = await res2.json();
      expect(body2.data.length).toBe(1);
      expect(body2.offset).toBe(2);
    });
  });

  // =========================================================================
  // POST /api/route-stops
  // =========================================================================

  describe("POST /api/route-stops", () => {
    // ---------------------------------------------------------------------
    // 3. Creates stops from job data
    // ---------------------------------------------------------------------
    test("creates stops from job data", async () => {
      const order1 = await createOrder({ companyId: company.id });
      const order2 = await createOrder({ companyId: company.id });

      const stops = [
        {
          routeId: "route-new",
          driverId: driver.id,
          vehicleId: vehicle.id,
          orderId: order1.id,
          sequence: 1,
          address: "Av. Arequipa 1200",
          latitude: "-12.0800",
          longitude: "-77.0300",
        },
        {
          routeId: "route-new",
          driverId: driver.id,
          vehicleId: vehicle.id,
          orderId: order2.id,
          sequence: 2,
          address: "Jr. Union 500",
          latitude: "-12.0500",
          longitude: "-77.0400",
        },
      ];

      const request = await createTestRequest("/api/route-stops", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { jobId: job.id, stops },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBe(2);
      expect(body.count).toBe(2);
      expect(body.data[0].companyId).toBe(company.id);
      expect(body.data[0].jobId).toBe(job.id);
      expect(body.data[0].routeId).toBe("route-new");
      expect(body.data[0].address).toBe("Av. Arequipa 1200");
      expect(body.data[1].sequence).toBe(2);
    });

    // ---------------------------------------------------------------------
    // 4. Replaces existing stops for same job
    // ---------------------------------------------------------------------
    test("replaces existing stops for same job (delete + insert)", async () => {
      // First, create an initial stop
      const orderOld = await createOrder({ companyId: company.id });
      await createRouteStop({
        companyId: company.id,
        jobId: job.id,
        routeId: "route-old",
        userId: driver.id,
        vehicleId: vehicle.id,
        orderId: orderOld.id,
        sequence: 1,
        address: "Old Address",
      });

      // Verify it exists
      const beforeStops = await testDb
        .select()
        .from(routeStops)
        .where(eq(routeStops.jobId, job.id));
      expect(beforeStops.length).toBe(1);

      // POST new stops for the same job
      const orderNew = await createOrder({ companyId: company.id });
      const request = await createTestRequest("/api/route-stops", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          jobId: job.id,
          stops: [
            {
              routeId: "route-replaced",
              driverId: driver.id,
              vehicleId: vehicle.id,
              orderId: orderNew.id,
              sequence: 1,
              address: "New Address",
              latitude: "-12.0500",
              longitude: "-77.0400",
            },
          ],
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.count).toBe(1);
      expect(body.data[0].address).toBe("New Address");

      // Old stop should be gone
      const afterStops = await testDb
        .select()
        .from(routeStops)
        .where(eq(routeStops.jobId, job.id));
      expect(afterStops.length).toBe(1);
      expect(afterStops[0].address).toBe("New Address");
    });

    // ---------------------------------------------------------------------
    // 5. Missing required fields returns 400
    // ---------------------------------------------------------------------
    test("returns 400 when stops are missing required fields", async () => {
      const request = await createTestRequest("/api/route-stops", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          jobId: job.id,
          stops: [
            {
              routeId: "route-x",
              // Missing driverId/userId, vehicleId, orderId, etc.
            },
          ],
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toMatch(/must have/i);
    });

    // ---------------------------------------------------------------------
    // 6. Missing jobId or empty stops returns 400
    // ---------------------------------------------------------------------
    test("returns 400 when jobId or stops array is missing", async () => {
      const request = await createTestRequest("/api/route-stops", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { stops: [] },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toMatch(/jobId.*stops.*required/i);
    });
  });

  // =========================================================================
  // GET /api/route-stops/[id]/history
  // =========================================================================

  describe("GET /api/route-stops/[id]/history", () => {
    // ---------------------------------------------------------------------
    // 7. Returns status transition log
    // ---------------------------------------------------------------------
    test("returns status transition history for a stop", async () => {
      const order = await createOrder({ companyId: company.id });
      const stop = await createRouteStop({
        companyId: company.id,
        jobId: job.id,
        routeId: "route-hist",
        userId: driver.id,
        vehicleId: vehicle.id,
        orderId: order.id,
        sequence: 1,
      });

      // Insert history records directly
      await testDb.insert(routeStopHistory).values([
        {
          companyId: company.id,
          routeStopId: stop.id,
          previousStatus: "PENDING",
          newStatus: "IN_PROGRESS",
          userId: driver.id,
          notes: "Started delivery",
        },
        {
          companyId: company.id,
          routeStopId: stop.id,
          previousStatus: "IN_PROGRESS",
          newStatus: "COMPLETED",
          userId: driver.id,
          notes: "Delivered successfully",
        },
      ]);

      const request = await createTestRequest(
        `/api/route-stops/${stop.id}/history`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await GET_HISTORY(request, {
        params: Promise.resolve({ id: stop.id }),
      });
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBe(2);
      expect(body.total).toBe(2);
      // Ordered by createdAt desc
      expect(body.data[0].newStatus).toBeDefined();
    });

    // ---------------------------------------------------------------------
    // 8. Includes user info
    // ---------------------------------------------------------------------
    test("includes user info in history records", async () => {
      const order = await createOrder({ companyId: company.id });
      const stop = await createRouteStop({
        companyId: company.id,
        jobId: job.id,
        routeId: "route-user",
        userId: driver.id,
        vehicleId: vehicle.id,
        orderId: order.id,
        sequence: 1,
      });

      await testDb.insert(routeStopHistory).values({
        companyId: company.id,
        routeStopId: stop.id,
        previousStatus: "PENDING",
        newStatus: "IN_PROGRESS",
        userId: driver.id,
        notes: "On my way",
      });

      const request = await createTestRequest(
        `/api/route-stops/${stop.id}/history`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await GET_HISTORY(request, {
        params: Promise.resolve({ id: stop.id }),
      });
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].user).toBeDefined();
      expect(body.data[0].user.id).toBe(driver.id);
      expect(body.data[0].user.name).toBe(driver.name);
      expect(body.data[0].user.email).toBe(driver.email);
    });

    // ---------------------------------------------------------------------
    // 9. Non-existent stop returns 404
    // ---------------------------------------------------------------------
    test("returns 404 for non-existent stop", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      const request = await createTestRequest(
        `/api/route-stops/${fakeId}/history`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await GET_HISTORY(request, {
        params: Promise.resolve({ id: fakeId }),
      });
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe("Stop not found");
    });
  });

  // =========================================================================
  // Tenant isolation
  // =========================================================================

  describe("Tenant isolation", () => {
    test("company B cannot see company A route stops", async () => {
      const order = await createOrder({ companyId: company.id });
      await createRouteStop({
        companyId: company.id,
        jobId: job.id,
        routeId: "route-iso",
        userId: driver.id,
        vehicleId: vehicle.id,
        orderId: order.id,
        sequence: 1,
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

      // Company B lists route stops
      const request = await createTestRequest("/api/route-stops", {
        method: "GET",
        token: tokenB,
        companyId: companyB.id,
        userId: adminB.id,
      });

      const response = await GET(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBe(0);
      expect(Number(body.total)).toBe(0);
    });

    test("company B cannot see company A stop history", async () => {
      const order = await createOrder({ companyId: company.id });
      const stop = await createRouteStop({
        companyId: company.id,
        jobId: job.id,
        routeId: "route-iso-h",
        userId: driver.id,
        vehicleId: vehicle.id,
        orderId: order.id,
        sequence: 1,
      });

      await testDb.insert(routeStopHistory).values({
        companyId: company.id,
        routeStopId: stop.id,
        previousStatus: "PENDING",
        newStatus: "IN_PROGRESS",
        userId: driver.id,
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

      // Company B tries to access stop history
      const request = await createTestRequest(
        `/api/route-stops/${stop.id}/history`,
        {
          method: "GET",
          token: tokenB,
          companyId: companyB.id,
          userId: adminB.id,
        },
      );

      const response = await GET_HISTORY(request, {
        params: Promise.resolve({ id: stop.id }),
      });
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe("Stop not found");
    });
  });
});
