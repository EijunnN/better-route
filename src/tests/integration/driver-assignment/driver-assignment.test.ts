import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createDriver,
  createVehicle,
  createFleet,
  createOrder,
  createOptimizationConfig,
  createOptimizationJob,
  buildOptimizationResult,
  createVehicleSkill,
  createUserSkillAssignment,
} from "../setup/test-data";
import { optimizationJobs } from "@/db/schema";

import { POST as ManualPOST } from "@/app/api/driver-assignment/manual/route";
import { POST as SuggestionsPOST } from "@/app/api/driver-assignment/suggestions/route";
import { POST as ValidatePOST } from "@/app/api/driver-assignment/validate/route";
import { GET as HistoryGET } from "@/app/api/driver-assignment/history/[routeId]/route";
import {
  GET as RemoveGET,
  DELETE as RemoveDELETE,
} from "@/app/api/driver-assignment/remove/[routeId]/[vehicleId]/route";

describe("Driver Assignment API", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let companyB: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let adminB: Awaited<ReturnType<typeof createAdmin>>;
  let token: string;
  let tokenB: string;
  let driver: Awaited<ReturnType<typeof createDriver>>;
  let vehicle: Awaited<ReturnType<typeof createVehicle>>;
  let order1: Awaited<ReturnType<typeof createOrder>>;
  let order2: Awaited<ReturnType<typeof createOrder>>;
  let config: Awaited<ReturnType<typeof createOptimizationConfig>>;
  let fleet: Awaited<ReturnType<typeof createFleet>>;

  beforeAll(async () => {
    await cleanDatabase();

    company = await createCompany();
    companyB = await createCompany();
    admin = await createAdmin(null);
    adminB = await createAdmin(null);

    token = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: admin.role,
    });

    tokenB = await createTestToken({
      userId: adminB.id,
      companyId: companyB.id,
      email: adminB.email,
      role: adminB.role,
    });

    fleet = await createFleet({ companyId: company.id });

    driver = await createDriver(company.id, {
      primaryFleetId: fleet.id,
      driverStatus: "AVAILABLE",
      licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      licenseNumber: "LIC-001",
    });

    vehicle = await createVehicle({ companyId: company.id });
    order1 = await createOrder({ companyId: company.id });
    order2 = await createOrder({ companyId: company.id });
    config = await createOptimizationConfig({ companyId: company.id });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  function buildJobResult(vehicleId: string, driverId?: string) {
    return buildOptimizationResult([
      {
        routeId: "route-1",
        vehicleId,
        vehiclePlate: "TEST-001",
        ...(driverId ? { driverId } : {}),
        stops: [
          {
            orderId: order1.id,
            trackingId: order1.trackingId,
            sequence: 1,
            address: "Addr 1",
            latitude: "-12.05",
            longitude: "-77.04",
          },
          {
            orderId: order2.id,
            trackingId: order2.trackingId,
            sequence: 2,
            address: "Addr 2",
            latitude: "-12.06",
            longitude: "-77.05",
          },
        ],
        totalDistance: 5000,
        totalDuration: 1800,
        totalWeight: 100,
        totalVolume: 10,
        utilizationPercentage: 50,
        timeWindowViolations: 0,
      },
    ]);
  }

  // ---------------------------------------------------------------------------
  // POST /api/driver-assignment/manual
  // ---------------------------------------------------------------------------

  describe("POST /api/driver-assignment/manual", () => {
    test("assigns driver to route and updates job result", async () => {
      const result = buildJobResult(vehicle.id);
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        result: result as unknown as Record<string, unknown>,
      });

      const request = await createTestRequest(
        "/api/driver-assignment/manual",
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: {
            companyId: company.id,
            vehicleId: vehicle.id,
            driverId: driver.id,
            routeId: job.id,
            overrideWarnings: true,
          },
        },
      );

      const response = await ManualPOST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.routeId).toBe(job.id);
      expect(body.data.driverId).toBe(driver.id);
      expect(body.data.vehicleId).toBe(vehicle.id);
      expect(body.data.isManualOverride).toBe(true);
      expect(body.data.validation).toBeDefined();
      expect(body.meta.assignedBy).toBe(admin.id);

      // Verify DB was updated
      const dbJob = await testDb.query.optimizationJobs.findFirst({
        where: eq(optimizationJobs.id, job.id),
      });
      const dbResult = dbJob!.result as any;
      const route = dbResult.routes.find(
        (r: any) => r.vehicleId === vehicle.id,
      );
      expect(route.driverId).toBe(driver.id);
      expect(route.isManualOverride).toBe(true);
    });

    test("returns 404 when driver is not CONDUCTOR role", async () => {
      const result = buildJobResult(vehicle.id);
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        result: result as unknown as Record<string, unknown>,
      });

      // admin is ADMIN_SISTEMA, not CONDUCTOR
      const request = await createTestRequest(
        "/api/driver-assignment/manual",
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: {
            companyId: company.id,
            vehicleId: vehicle.id,
            driverId: admin.id,
            routeId: job.id,
          },
        },
      );

      const response = await ManualPOST(request);
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toMatch(/driver not found/i);
    });

    test("returns 404 when driver from wrong company", async () => {
      const driverB = await createDriver(companyB.id);
      const result = buildJobResult(vehicle.id);
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        result: result as unknown as Record<string, unknown>,
      });

      const request = await createTestRequest(
        "/api/driver-assignment/manual",
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: {
            companyId: company.id,
            vehicleId: vehicle.id,
            driverId: driverB.id,
            routeId: job.id,
          },
        },
      );

      const response = await ManualPOST(request);
      // Driver query filters by companyId, so wrong-company driver = not found
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toMatch(/driver not found/i);
    });

    test("returns 400 with validation errors when body is invalid", async () => {
      const request = await createTestRequest(
        "/api/driver-assignment/manual",
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { vehicleId: "not-a-uuid" },
        },
      );

      const response = await ManualPOST(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toMatch(/validation failed/i);
      expect(body.details).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/driver-assignment/suggestions
  // ---------------------------------------------------------------------------

  describe("POST /api/driver-assignment/suggestions", () => {
    test("returns scored driver list", async () => {
      const request = await createTestRequest(
        "/api/driver-assignment/suggestions",
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: {
            companyId: company.id,
            vehicleId: vehicle.id,
            routeStops: [{ orderId: order1.id }],
            strategy: "BALANCED",
            limit: 5,
          },
        },
      );

      const response = await SuggestionsPOST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data).toBeInstanceOf(Array);
      expect(body.meta.vehicleId).toBe(vehicle.id);
      expect(body.meta.strategy).toBe("BALANCED");
      expect(body.meta.totalCandidates).toBeGreaterThanOrEqual(0);
      expect(body.meta.returned).toBeGreaterThanOrEqual(0);

      // If there are results, verify the structure
      if (body.data.length > 0) {
        const suggestion = body.data[0];
        expect(suggestion.driverId).toBeDefined();
        expect(suggestion.driverName).toBeDefined();
        expect(typeof suggestion.score).toBe("number");
        expect(suggestion.factors).toBeDefined();
        expect(suggestion.factors.skillsMatch).toBeDefined();
        expect(suggestion.factors.availability).toBeDefined();
        expect(suggestion.factors.licenseValid).toBeDefined();
        expect(suggestion.factors.fleetMatch).toBeDefined();
      }
    });

    test("respects strategy parameter", async () => {
      const strategies = ["BALANCED", "SKILLS_FIRST", "FLEET_MATCH"];

      for (const strategy of strategies) {
        const request = await createTestRequest(
          "/api/driver-assignment/suggestions",
          {
            method: "POST",
            token,
            companyId: company.id,
            userId: admin.id,
            body: {
              companyId: company.id,
              vehicleId: vehicle.id,
              routeStops: [{ orderId: order1.id }],
              strategy,
              limit: 5,
            },
          },
        );

        const response = await SuggestionsPOST(request);
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.meta.strategy).toBe(strategy);
      }
    });

    test("returns 404 when vehicle not found", async () => {
      const fakeVehicleId = "00000000-0000-4000-a000-000000000099";
      const request = await createTestRequest(
        "/api/driver-assignment/suggestions",
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: {
            companyId: company.id,
            vehicleId: fakeVehicleId,
            routeStops: [{ orderId: order1.id }],
          },
        },
      );

      const response = await SuggestionsPOST(request);
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toMatch(/vehicle not found/i);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/driver-assignment/validate
  // ---------------------------------------------------------------------------

  describe("POST /api/driver-assignment/validate", () => {
    test("returns validation result for valid assignment", async () => {
      const request = await createTestRequest(
        "/api/driver-assignment/validate",
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: {
            companyId: company.id,
            driverId: driver.id,
            vehicleId: vehicle.id,
            routeStops: [{ orderId: order1.id }],
          },
        },
      );

      const response = await ValidatePOST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data).toBeDefined();
      expect(typeof body.data.isValid).toBe("boolean");
      expect(body.data.errors).toBeInstanceOf(Array);
      expect(body.data.warnings).toBeInstanceOf(Array);
      expect(body.meta.driverId).toBe(driver.id);
      expect(body.meta.vehicleId).toBe(vehicle.id);
      expect(body.meta.validatedAt).toBeDefined();
    });

    test("returns warning when license is near expiry", async () => {
      // Create a driver with license expiring in 15 days
      const nearExpiryDriver = await createDriver(company.id, {
        licenseExpiry: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        licenseNumber: "LIC-EXPIRING",
        driverStatus: "AVAILABLE",
      });

      const request = await createTestRequest(
        "/api/driver-assignment/validate",
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: {
            companyId: company.id,
            driverId: nearExpiryDriver.id,
            vehicleId: vehicle.id,
            routeStops: [{ orderId: order1.id }],
          },
        },
      );

      const response = await ValidatePOST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.warnings.length).toBeGreaterThan(0);
      const hasLicenseWarning = body.data.warnings.some((w: string) =>
        w.toLowerCase().includes("license expires"),
      );
      expect(hasLicenseWarning).toBe(true);
    });

    test("returns 404 when driver not found", async () => {
      const fakeDriverId = "00000000-0000-4000-a000-000000000088";
      const request = await createTestRequest(
        "/api/driver-assignment/validate",
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: {
            companyId: company.id,
            driverId: fakeDriverId,
            vehicleId: vehicle.id,
            routeStops: [{ orderId: order1.id }],
          },
        },
      );

      const response = await ValidatePOST(request);
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toMatch(/driver not found/i);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/driver-assignment/history/[routeId]
  // ---------------------------------------------------------------------------

  describe("GET /api/driver-assignment/history/[routeId]", () => {
    test("returns assignment history for a route", async () => {
      const result = buildJobResult(vehicle.id);
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        result: result as unknown as Record<string, unknown>,
      });

      const request = await createTestRequest(
        `/api/driver-assignment/history/${job.id}`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await HistoryGET(request, {
        params: Promise.resolve({ routeId: job.id }),
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.routeId).toBe(job.id);
      expect(body.data.history).toBeInstanceOf(Array);
      expect(body.data.summary).toBeDefined();
      expect(body.data.summary.total).toBeGreaterThanOrEqual(0);
      expect(body.meta.retrievedAt).toBeDefined();
    });

    test("returns 404 when route/job does not exist", async () => {
      const fakeRouteId = "00000000-0000-4000-a000-000000000077";

      const request = await createTestRequest(
        `/api/driver-assignment/history/${fakeRouteId}`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await HistoryGET(request, {
        params: Promise.resolve({ routeId: fakeRouteId }),
      });

      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toMatch(/not found/i);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/driver-assignment/remove/[routeId]/[vehicleId]
  // ---------------------------------------------------------------------------

  describe("GET /api/driver-assignment/remove/[routeId]/[vehicleId]", () => {
    test("returns current assignment info for removal preview", async () => {
      const result = buildJobResult(vehicle.id, driver.id);
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        result: result as unknown as Record<string, unknown>,
      });

      const request = await createTestRequest(
        `/api/driver-assignment/remove/${job.id}/${vehicle.id}`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await RemoveGET(request, {
        params: Promise.resolve({ routeId: job.id, vehicleId: vehicle.id }),
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.routeId).toBe(job.id);
      expect(body.data.vehicleId).toBe(vehicle.id);
      expect(body.data.currentAssignment).toBeDefined();
      expect(body.data.currentAssignment.driverId).toBe(driver.id);
      expect(body.data.canRemove).toBe(true);
      expect(body.data.stopsCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/driver-assignment/remove/[routeId]/[vehicleId]
  // ---------------------------------------------------------------------------

  describe("DELETE /api/driver-assignment/remove/[routeId]/[vehicleId]", () => {
    test("removes driver from route", async () => {
      const result = buildJobResult(vehicle.id, driver.id);
      // Pre-set the driver info on the route for removal
      (result.routes[0] as any).driverName = driver.name;
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        result: result as unknown as Record<string, unknown>,
      });

      const request = await createTestRequest(
        `/api/driver-assignment/remove/${job.id}/${vehicle.id}`,
        {
          method: "DELETE",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await RemoveDELETE(request, {
        params: Promise.resolve({ routeId: job.id, vehicleId: vehicle.id }),
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.routeId).toBe(job.id);
      expect(body.data.vehicleId).toBe(vehicle.id);
      expect(body.data.driverRemoved).toBe(true);
      expect(body.data.previousDriverId).toBe(driver.id);
      expect(body.meta.removedBy).toBe(admin.id);
    });

    test("sets driverId to null in job result after removal", async () => {
      const result = buildJobResult(vehicle.id, driver.id);
      (result.routes[0] as any).driverName = driver.name;
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        result: result as unknown as Record<string, unknown>,
      });

      const request = await createTestRequest(
        `/api/driver-assignment/remove/${job.id}/${vehicle.id}`,
        {
          method: "DELETE",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      await RemoveDELETE(request, {
        params: Promise.resolve({ routeId: job.id, vehicleId: vehicle.id }),
      });

      // Verify DB was updated
      const dbJob = await testDb.query.optimizationJobs.findFirst({
        where: eq(optimizationJobs.id, job.id),
      });
      const dbResult = dbJob!.result as any;
      const route = dbResult.routes.find(
        (r: any) => r.vehicleId === vehicle.id,
      );
      expect(route.driverId).toBeNull();
      expect(route.driverName).toBeNull();
      expect(route.isManualOverride).toBe(false);
    });

    test("returns 404 when route/job not found", async () => {
      const fakeRouteId = "00000000-0000-4000-a000-000000000066";

      const request = await createTestRequest(
        `/api/driver-assignment/remove/${fakeRouteId}/${vehicle.id}`,
        {
          method: "DELETE",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await RemoveDELETE(request, {
        params: Promise.resolve({
          routeId: fakeRouteId,
          vehicleId: vehicle.id,
        }),
      });

      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toMatch(/not found/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant isolation
  // ---------------------------------------------------------------------------

  describe("Tenant isolation", () => {
    test("company B cannot access company A's job via manual assignment", async () => {
      const result = buildJobResult(vehicle.id);
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        result: result as unknown as Record<string, unknown>,
      });

      const driverB = await createDriver(companyB.id, {
        driverStatus: "AVAILABLE",
      });
      const vehicleB = await createVehicle({ companyId: companyB.id });

      const request = await createTestRequest(
        "/api/driver-assignment/manual",
        {
          method: "POST",
          token: tokenB,
          companyId: companyB.id,
          userId: adminB.id,
          body: {
            companyId: companyB.id,
            vehicleId: vehicleB.id,
            driverId: driverB.id,
            routeId: job.id,
          },
        },
      );

      const response = await ManualPOST(request);
      // Job belongs to company A, companyB token filters by companyB => 404
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toMatch(/not found/i);
    });

    test("company B cannot access company A's history", async () => {
      const result = buildJobResult(vehicle.id);
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        result: result as unknown as Record<string, unknown>,
      });

      const request = await createTestRequest(
        `/api/driver-assignment/history/${job.id}`,
        {
          method: "GET",
          token: tokenB,
          companyId: companyB.id,
          userId: adminB.id,
        },
      );

      const response = await HistoryGET(request, {
        params: Promise.resolve({ routeId: job.id }),
      });

      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toMatch(/not found/i);
    });
  });
});
