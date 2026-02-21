import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createDriver,
  createVehicle,
  createOrder,
  createFleet,
  createOptimizationConfig,
  createOptimizationJob,
  buildOptimizationResult,
  createRouteStop,
  createReassignmentHistory,
} from "../setup/test-data";

import { GET as historyGET } from "@/app/api/reassignment/history/route";
import { POST as optionsPOST } from "@/app/api/reassignment/options/route";
import { POST as impactPOST } from "@/app/api/reassignment/impact/route";
import { GET as outputGET } from "@/app/api/reassignment/output/[historyId]/route";

describe("Reassignment Advanced API", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let token: string;
  let fleet: Awaited<ReturnType<typeof createFleet>>;
  let driverAbsent: Awaited<ReturnType<typeof createDriver>>;
  let driverReplacement: Awaited<ReturnType<typeof createDriver>>;
  let vehicle: Awaited<ReturnType<typeof createVehicle>>;
  let order1: Awaited<ReturnType<typeof createOrder>>;
  let order2: Awaited<ReturnType<typeof createOrder>>;
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

    fleet = await createFleet({ companyId: company.id });

    driverAbsent = await createDriver(company.id, {
      driverStatus: "ABSENT",
      primaryFleetId: fleet.id,
    });
    driverReplacement = await createDriver(company.id, {
      driverStatus: "AVAILABLE",
      primaryFleetId: fleet.id,
    });

    vehicle = await createVehicle({ companyId: company.id });
    order1 = await createOrder({ companyId: company.id });
    order2 = await createOrder({ companyId: company.id });
    config = await createOptimizationConfig({ companyId: company.id });

    const result = buildOptimizationResult([
      {
        routeId: "route-absent",
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate!,
        driverId: driverAbsent.id,
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

    job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as unknown as Record<string, unknown>,
    });

    // Create route stops for the absent driver so queries find them
    await createRouteStop({
      companyId: company.id,
      jobId: job.id,
      routeId: "route-absent",
      userId: driverAbsent.id,
      vehicleId: vehicle.id,
      orderId: order1.id,
      sequence: 1,
      status: "PENDING",
    });
    await createRouteStop({
      companyId: company.id,
      jobId: job.id,
      routeId: "route-absent",
      userId: driverAbsent.id,
      vehicleId: vehicle.id,
      orderId: order2.id,
      sequence: 2,
      status: "PENDING",
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ---------------------------------------------------------------------------
  // POST /api/reassignment/options
  // ---------------------------------------------------------------------------
  describe("POST /api/reassignment/options", () => {
    test("returns ranked replacement drivers for absent driver", async () => {
      const request = await createTestRequest("/api/reassignment/options", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          companyId: company.id,
          absentDriverId: driverAbsent.id,
          jobId: job.id,
          strategy: "SAME_FLEET",
        },
      });

      const response = await optionsPOST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data).toBeDefined();
      expect(body.meta).toBeDefined();
      expect(body.meta.absentDriverId).toBe(driverAbsent.id);
      expect(body.meta.strategy).toBe("SAME_FLEET");
      expect(body.meta.affectedRoutes).toBeGreaterThan(0);
    });

    test("returns empty list when no available replacements exist", async () => {
      // Create an isolated driver with no fleet peers
      const lonelyDriver = await createDriver(company.id, {
        driverStatus: "ABSENT",
      });

      const request = await createTestRequest("/api/reassignment/options", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          companyId: company.id,
          absentDriverId: lonelyDriver.id,
          strategy: "SAME_FLEET",
        },
      });

      const response = await optionsPOST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      // No route stops for lonelyDriver, so "No active routes" message
      expect(body.data).toEqual([]);
      expect(body.meta.message).toMatch(/no active routes/i);
    });

    test("returns 400 for invalid request body", async () => {
      const request = await createTestRequest("/api/reassignment/options", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { companyId: "not-a-uuid" },
      });

      const response = await optionsPOST(request);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toMatch(/validation/i);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/reassignment/impact
  // ---------------------------------------------------------------------------
  describe("POST /api/reassignment/impact", () => {
    test("returns metrics for proposed reassignment", async () => {
      const request = await createTestRequest("/api/reassignment/impact", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          companyId: company.id,
          absentDriverId: driverAbsent.id,
          replacementDriverId: driverReplacement.id,
          jobId: job.id,
        },
      });

      const response = await impactPOST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data).toBeDefined();
      expect(body.data.replacementDriverId).toBe(driverReplacement.id);
      expect(body.data.stopsCount).toBeGreaterThanOrEqual(0);
      expect(body.data.additionalDistance).toBeDefined();
      expect(body.data.additionalTime).toBeDefined();
      expect(body.data.skillsMatch).toBeDefined();
      expect(body.data.availabilityStatus).toBeDefined();
      expect(typeof body.data.isValid).toBe("boolean");
    });

    test("includes affected routes summary in response", async () => {
      const request = await createTestRequest("/api/reassignment/impact", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          companyId: company.id,
          absentDriverId: driverAbsent.id,
          replacementDriverId: driverReplacement.id,
          jobId: job.id,
        },
      });

      const response = await impactPOST(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.affectedRoutesCount).toBeGreaterThan(0);
      expect(body.data.totalAffectedStops).toBeGreaterThanOrEqual(0);
      expect(body.data.pendingAffectedStops).toBeGreaterThanOrEqual(0);
      expect(body.meta.absentDriverId).toBe(driverAbsent.id);
      expect(body.meta.replacementDriverId).toBe(driverReplacement.id);
      expect(body.meta.calculatedAt).toBeDefined();
    });

    test("returns 403 for company ID mismatch", async () => {
      const fakeCompanyId = "00000000-0000-4000-a000-000000000001";
      const request = await createTestRequest("/api/reassignment/impact", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          companyId: fakeCompanyId,
          absentDriverId: driverAbsent.id,
          replacementDriverId: driverReplacement.id,
        },
      });

      const response = await impactPOST(request);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toMatch(/mismatch/i);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/reassignment/history
  // ---------------------------------------------------------------------------
  describe("GET /api/reassignment/history", () => {
    let historyRecord: Awaited<ReturnType<typeof createReassignmentHistory>>;

    beforeAll(async () => {
      historyRecord = await createReassignmentHistory({
        companyId: company.id,
        absentUserId: driverAbsent.id,
        absentUserName: driverAbsent.name,
        jobId: job.id,
        routeIds: ["route-absent"],
        vehicleIds: [vehicle.id],
        reassignments: [
          {
            driverId: driverReplacement.id,
            driverName: driverReplacement.name,
            stopIds: [order1.id],
            stopCount: 1,
          },
        ] as unknown as never[],
        reason: "Driver called in sick",
        executedBy: admin.id,
        executedAt: new Date(),
      });
    });

    test("returns paginated reassignment records", async () => {
      const request = await createTestRequest("/api/reassignment/history", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { limit: "10", offset: "0" },
      });

      const response = await historyGET(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.offset).toBe(0);
      expect(body.meta.total).toBeGreaterThan(0);
    });

    test("filters by jobId and driverId", async () => {
      const request = await createTestRequest("/api/reassignment/history", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: {
          jobId: job.id,
          driverId: driverAbsent.id,
        },
      });

      const response = await historyGET(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.meta.jobId).toBe(job.id);
      expect(body.meta.driverId).toBe(driverAbsent.id);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/reassignment/output/[historyId]
  // ---------------------------------------------------------------------------
  describe("GET /api/reassignment/output/[historyId]", () => {
    let historyForOutput: Awaited<ReturnType<typeof createReassignmentHistory>>;

    beforeAll(async () => {
      historyForOutput = await createReassignmentHistory({
        companyId: company.id,
        absentUserId: driverAbsent.id,
        absentUserName: driverAbsent.name,
        routeIds: ["route-absent"],
        vehicleIds: [vehicle.id],
        reassignments: [
          {
            driverId: driverReplacement.id,
            stopIds: ["stop-1"],
          },
        ] as unknown as never[],
        reason: "Emergency",
        executedBy: admin.id,
        executedAt: new Date(),
      });
    });

    test("generates reassignment output with routes", async () => {
      const request = await createTestRequest(
        `/api/reassignment/output/${historyForOutput.id}`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await outputGET(request, {
        params: Promise.resolve({ historyId: historyForOutput.id }),
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.reassignmentHistoryId).toBe(historyForOutput.id);
      expect(body.absentDriverId).toBe(driverAbsent.id);
      expect(body.absentDriverName).toBe(driverAbsent.name);
      expect(body.driverRoutes).toBeDefined();
      expect(Array.isArray(body.driverRoutes)).toBe(true);
      expect(body.summary).toBeDefined();
      expect(body.summary.totalReplacementDrivers).toBeGreaterThanOrEqual(0);
    });

    test("returns 404 for non-existent history record", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000099";
      const request = await createTestRequest(
        `/api/reassignment/output/${fakeId}`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await outputGET(request, {
        params: Promise.resolve({ historyId: fakeId }),
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
    test("history from another company is not visible", async () => {
      const companyB = await createCompany();
      const adminB = await createAdmin(null);
      const tokenB = await createTestToken({
        userId: adminB.id,
        companyId: companyB.id,
        email: adminB.email,
        role: adminB.role,
      });

      const request = await createTestRequest("/api/reassignment/history", {
        method: "GET",
        token: tokenB,
        companyId: companyB.id,
        userId: adminB.id,
      });

      const response = await historyGET(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      // Company B should have no reassignment history
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });
  });
});
