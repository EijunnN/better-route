import { describe, test, expect, beforeAll, afterAll } from "bun:test";
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
  createDriverLocation,
  createFieldDefinition,
  createWorkflowState,
  createWorkflowTransition,
  buildOptimizationResult,
} from "../setup/test-data";

import { GET as GET_MY_ROUTE } from "@/app/api/mobile/driver/my-route/route";
import { GET as GET_MY_ORDERS } from "@/app/api/mobile/driver/my-orders/route";
import {
  POST as POST_LOCATION,
  GET as GET_LOCATION,
} from "@/app/api/mobile/driver/location/route";
import { GET as GET_FIELD_DEFINITIONS } from "@/app/api/mobile/driver/field-definitions/route";
import { GET as GET_WORKFLOW_STATES } from "@/app/api/mobile/driver/workflow-states/route";

describe("Mobile Driver Endpoints", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let adminToken: string;
  let driver: Awaited<ReturnType<typeof createDriver>>;
  let driverToken: string;
  let vehicle: Awaited<ReturnType<typeof createVehicle>>;
  let config: Awaited<ReturnType<typeof createOptimizationConfig>>;
  let job: Awaited<ReturnType<typeof createOptimizationJob>>;
  let order1: Awaited<ReturnType<typeof createOrder>>;
  let order2: Awaited<ReturnType<typeof createOrder>>;

  const ROUTE_ID = "route-mobile-test";

  beforeAll(async () => {
    await cleanDatabase();

    // 1. Company, admin, driver, vehicle
    company = await createCompany();
    admin = await createAdmin(null);
    adminToken = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: "ADMIN_SISTEMA",
    });

    driver = await createDriver(company.id);
    driverToken = await createTestToken({
      userId: driver.id,
      companyId: company.id,
      email: driver.email,
      role: "CONDUCTOR",
    });

    vehicle = await createVehicle({
      companyId: company.id,
      assignedDriverId: driver.id,
      originAddress: "Depot Lima",
    });

    // 2. Orders
    order1 = await createOrder({
      companyId: company.id,
      status: "ASSIGNED",
      customerName: "Alice",
      customerPhone: "999111222",
      weightRequired: 10,
      volumeRequired: 5,
    });
    order2 = await createOrder({
      companyId: company.id,
      status: "ASSIGNED",
      customerName: "Bob",
      customerPhone: "999333444",
      weightRequired: 20,
      volumeRequired: 8,
    });

    // 3. Optimization config & job with result
    config = await createOptimizationConfig({ companyId: company.id });

    const result = buildOptimizationResult([
      {
        routeId: ROUTE_ID,
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        driverId: driver.id,
        stops: [
          {
            orderId: order1.id,
            trackingId: order1.trackingId,
            sequence: 1,
            address: order1.address,
            latitude: "-12.0464",
            longitude: "-77.0428",
          },
          {
            orderId: order2.id,
            trackingId: order2.trackingId,
            sequence: 2,
            address: order2.address,
            latitude: "-12.0500",
            longitude: "-77.0500",
          },
        ],
        totalDistance: 5000,
        totalDuration: 1800,
        totalWeight: 30,
        totalVolume: 13,
        utilizationPercentage: 60,
        timeWindowViolations: 0,
      },
    ]);

    job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      status: "COMPLETED",
      result: JSON.stringify(result),
    });

    // 4. Route stops for today
    await createRouteStop({
      companyId: company.id,
      jobId: job.id,
      routeId: ROUTE_ID,
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId: order1.id,
      sequence: 1,
      status: "PENDING",
      address: "Calle A 100, Lima",
      latitude: "-12.0464",
      longitude: "-77.0428",
    });
    await createRouteStop({
      companyId: company.id,
      jobId: job.id,
      routeId: ROUTE_ID,
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId: order2.id,
      sequence: 2,
      status: "COMPLETED",
      address: "Calle B 200, Lima",
      latitude: "-12.0500",
      longitude: "-77.0500",
    });

    // 5. Driver location record
    await createDriverLocation({
      companyId: company.id,
      driverId: driver.id,
      vehicleId: vehicle.id,
      latitude: "-12.0470",
      longitude: "-77.0440",
      accuracy: 8,
      speed: 25,
      source: "GPS",
    });

    // 6. Field definitions (one visible in mobile, one not)
    await createFieldDefinition({
      companyId: company.id,
      code: "phone_alt",
      label: "Phone Alt",
      showInMobile: true,
      active: true,
      position: 1,
    });
    await createFieldDefinition({
      companyId: company.id,
      code: "internal_note",
      label: "Internal Note",
      showInMobile: false,
      active: true,
      position: 2,
    });
    await createFieldDefinition({
      companyId: company.id,
      code: "inactive_field",
      label: "Inactive",
      showInMobile: true,
      active: false,
      position: 3,
    });

    // 7. Workflow states and transitions
    const statePending = await createWorkflowState({
      companyId: company.id,
      code: "WF_PENDING",
      label: "Pendiente",
      systemState: "PENDING",
      position: 0,
      isTerminal: false,
      requiresPhoto: false,
    });
    const stateCompleted = await createWorkflowState({
      companyId: company.id,
      code: "WF_COMPLETED",
      label: "Completado",
      systemState: "COMPLETED",
      position: 1,
      isTerminal: true,
      requiresPhoto: true,
      requiresSignature: true,
    });
    await createWorkflowTransition({
      companyId: company.id,
      fromStateId: statePending.id,
      toStateId: stateCompleted.id,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // -----------------------------------------------------------------------
  // GET /api/mobile/driver/my-route
  // -----------------------------------------------------------------------
  describe("GET /my-route", () => {
    test("returns driver's today stops with metrics", async () => {
      const req = await createTestRequest("/api/mobile/driver/my-route", {
        token: driverToken,
        companyId: company.id,
        userId: driver.id,
      });
      const res = await GET_MY_ROUTE(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      const data = body.data;

      // Driver info
      expect(data.driver.id).toBe(driver.id);
      expect(data.driver.name).toBe(driver.name);

      // Vehicle info
      expect(data.vehicle).not.toBeNull();
      expect(data.vehicle.id).toBe(vehicle.id);
      expect(data.vehicle.plate).toBe(vehicle.plate);

      // Route with stops
      expect(data.route).not.toBeNull();
      expect(data.route.jobId).toBe(job.id);
      expect(data.route.stops).toHaveLength(2);
      expect(data.route.stops[0].sequence).toBe(1);
      expect(data.route.stops[1].sequence).toBe(2);

      // Each stop has order data
      expect(data.route.stops[0].order).not.toBeNull();
      expect(data.route.stops[0].order.customerName).toBe("Alice");

      // Metrics
      expect(data.metrics).not.toBeNull();
      expect(data.metrics.totalStops).toBe(2);
      expect(data.metrics.completedStops).toBe(1);
      expect(data.metrics.pendingStops).toBe(1);
      expect(data.metrics.progressPercentage).toBe(50);
      expect(data.metrics.totalWeight).toBeGreaterThan(0);
      expect(data.metrics.totalVolume).toBeGreaterThan(0);
    });

    test("returns null route when driver has no stops today", async () => {
      // Create a second driver with no route stops
      const driver2 = await createDriver(company.id);
      const driver2Token = await createTestToken({
        userId: driver2.id,
        companyId: company.id,
        email: driver2.email,
        role: "CONDUCTOR",
      });

      const req = await createTestRequest("/api/mobile/driver/my-route", {
        token: driver2Token,
        companyId: company.id,
        userId: driver2.id,
      });
      const res = await GET_MY_ROUTE(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.route).toBeNull();
      expect(body.data.metrics).toBeNull();
      expect(body.data.message).toBe("No tienes rutas asignadas para hoy");
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/mobile/driver/my-orders
  // -----------------------------------------------------------------------
  describe("GET /my-orders", () => {
    test("returns assigned orders with pagination fields", async () => {
      const req = await createTestRequest("/api/mobile/driver/my-orders", {
        token: driverToken,
        companyId: company.id,
        userId: driver.id,
      });
      const res = await GET_MY_ORDERS(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      const data = body.data;

      expect(data.orders.length).toBeGreaterThanOrEqual(2);
      expect(data.total).toBeGreaterThanOrEqual(2);
      expect(data.limit).toBe(50);
      expect(data.offset).toBe(0);

      // Each order has customer/capacity/stop info
      const o = data.orders.find(
        (o: { trackingId: string }) => o.trackingId === order1.trackingId,
      );
      expect(o).toBeDefined();
      expect(o.customer.name).toBe("Alice");
      expect(o.stop).not.toBeNull();
    });

    test("filters orders by status", async () => {
      const req = await createTestRequest("/api/mobile/driver/my-orders", {
        token: driverToken,
        companyId: company.id,
        userId: driver.id,
        searchParams: { status: "ASSIGNED" },
      });
      const res = await GET_MY_ORDERS(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      for (const o of body.data.orders) {
        expect(o.status).toBe("ASSIGNED");
      }
    });

    test("returns summary counts", async () => {
      const req = await createTestRequest("/api/mobile/driver/my-orders", {
        token: driverToken,
        companyId: company.id,
        userId: driver.id,
      });
      const res = await GET_MY_ORDERS(req);
      const body = await res.json();

      const summary = body.data.summary;
      expect(summary).toBeDefined();
      expect(typeof summary.pending).toBe("number");
      expect(typeof summary.assigned).toBe("number");
      expect(typeof summary.inProgress).toBe("number");
      expect(typeof summary.completed).toBe("number");
      expect(typeof summary.failed).toBe("number");
      expect(typeof summary.cancelled).toBe("number");
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/mobile/driver/location
  // -----------------------------------------------------------------------
  describe("POST /location", () => {
    test("saves valid GPS coordinates", async () => {
      const req = await createTestRequest("/api/mobile/driver/location", {
        method: "POST",
        token: driverToken,
        companyId: company.id,
        userId: driver.id,
        body: {
          latitude: -12.05,
          longitude: -77.04,
          accuracy: 5,
          speed: 30,
          heading: 180,
          batteryLevel: 85,
          recordedAt: new Date().toISOString(),
          source: "GPS",
        },
      });
      const res = await POST_LOCATION(req);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.locationId).toBeDefined();
      expect(body.savedAt).toBeDefined();
    });

    test("rejects invalid latitude", async () => {
      const req = await createTestRequest("/api/mobile/driver/location", {
        method: "POST",
        token: driverToken,
        companyId: company.id,
        userId: driver.id,
        body: {
          latitude: 999,
          longitude: -77.04,
          recordedAt: new Date().toISOString(),
        },
      });
      const res = await POST_LOCATION(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("latitude");
    });

    test("rejects invalid longitude", async () => {
      const req = await createTestRequest("/api/mobile/driver/location", {
        method: "POST",
        token: driverToken,
        companyId: company.id,
        userId: driver.id,
        body: {
          latitude: -12.05,
          longitude: 999,
          recordedAt: new Date().toISOString(),
        },
      });
      const res = await POST_LOCATION(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("longitude");
    });

    test("rejects future timestamps (>1 min ahead)", async () => {
      const futureDate = new Date(Date.now() + 5 * 60 * 1000); // 5 min ahead
      const req = await createTestRequest("/api/mobile/driver/location", {
        method: "POST",
        token: driverToken,
        companyId: company.id,
        userId: driver.id,
        body: {
          latitude: -12.05,
          longitude: -77.04,
          recordedAt: futureDate.toISOString(),
        },
      });
      const res = await POST_LOCATION(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("futuro");
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/mobile/driver/location
  // -----------------------------------------------------------------------
  describe("GET /location", () => {
    test("returns latest saved location", async () => {
      const req = await createTestRequest("/api/mobile/driver/location", {
        token: driverToken,
        companyId: company.id,
        userId: driver.id,
      });
      const res = await GET_LOCATION(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.location).not.toBeNull();
      expect(typeof body.location.latitude).toBe("number");
      expect(typeof body.location.longitude).toBe("number");
      expect(body.location.source).toBe("GPS");
      expect(body.location.recordedAt).toBeDefined();
      expect(body.location.savedAt).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/mobile/driver/field-definitions
  // -----------------------------------------------------------------------
  describe("GET /field-definitions", () => {
    test("returns only active + showInMobile fields", async () => {
      const req = await createTestRequest(
        "/api/mobile/driver/field-definitions",
        {
          token: driverToken,
          companyId: company.id,
          userId: driver.id,
        },
      );
      const res = await GET_FIELD_DEFINITIONS(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      // Should only include the one active + showInMobile field ("phone_alt")
      expect(body.data).toHaveLength(1);
      expect(body.data[0].code).toBe("phone_alt");
      expect(body.data[0].showInMobile).toBe(true);
      expect(body.data[0].active).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/mobile/driver/workflow-states
  // -----------------------------------------------------------------------
  describe("GET /workflow-states", () => {
    test("returns states with transition map", async () => {
      const req = await createTestRequest(
        "/api/mobile/driver/workflow-states",
        {
          token: driverToken,
          companyId: company.id,
          userId: driver.id,
        },
      );
      const res = await GET_WORKFLOW_STATES(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.length).toBeGreaterThanOrEqual(2);

      // Find the completed state — should have transitionsFrom containing the pending state
      const completedState = body.data.find(
        (s: { code: string }) => s.code === "WF_COMPLETED",
      );
      expect(completedState).toBeDefined();
      expect(completedState.isTerminal).toBe(true);
      expect(completedState.requiresPhoto).toBe(true);
      expect(completedState.requiresSignature).toBe(true);
      expect(completedState.transitionsFrom.length).toBeGreaterThanOrEqual(1);

      // Pending state should have empty transitionsFrom (nothing transitions TO it in our setup)
      const pendingState = body.data.find(
        (s: { code: string }) => s.code === "WF_PENDING",
      );
      expect(pendingState).toBeDefined();
      expect(pendingState.transitionsFrom).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Non-CONDUCTOR role check
  // -----------------------------------------------------------------------
  describe("Non-CONDUCTOR role rejection", () => {
    test("my-route returns 403 for non-CONDUCTOR", async () => {
      const req = await createTestRequest("/api/mobile/driver/my-route", {
        token: adminToken,
        companyId: company.id,
        userId: admin.id,
      });
      const res = await GET_MY_ROUTE(req);
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.error).toContain("conductores");
    });

    test("my-orders returns 403 for non-CONDUCTOR", async () => {
      const req = await createTestRequest("/api/mobile/driver/my-orders", {
        token: adminToken,
        companyId: company.id,
        userId: admin.id,
      });
      const res = await GET_MY_ORDERS(req);
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.error).toContain("conductores");
    });

    test("POST location returns 403 for non-CONDUCTOR", async () => {
      const req = await createTestRequest("/api/mobile/driver/location", {
        method: "POST",
        token: adminToken,
        companyId: company.id,
        userId: admin.id,
        body: {
          latitude: -12.05,
          longitude: -77.04,
          recordedAt: new Date().toISOString(),
        },
      });
      const res = await POST_LOCATION(req);
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.error).toContain("conductores");
    });
  });
});
