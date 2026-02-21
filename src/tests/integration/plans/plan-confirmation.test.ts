import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createPlanner,
  createDriver,
  createVehicle,
  createOrder,
  createOptimizationConfig,
  createOptimizationJob,
  buildOptimizationResult,
} from "../setup/test-data";
import {
  orders,
  optimizationConfigurations,
  routeStops,
  planMetrics,
} from "@/db/schema";
import { POST } from "@/app/api/optimization/jobs/[id]/confirm/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callConfirm(jobId: string, token: string, companyId: string) {
  const request = await createTestRequest(
    `/api/optimization/jobs/${jobId}/confirm`,
    {
      method: "POST",
      body: {},
      token,
      companyId,
    },
  );
  return POST(request, { params: Promise.resolve({ id: jobId }) });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/optimization/jobs/[id]/confirm", () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ---- 1. Happy path -------------------------------------------------------
  test("confirms a COMPLETED job with DRAFT config, assigns orders, creates route stops and metrics", async () => {
    const company = await createCompany();
    const planner = await createPlanner(company.id);
    const driver = await createDriver(company.id);
    const vehicle = await createVehicle({ companyId: company.id });
    const order1 = await createOrder({ companyId: company.id });
    const order2 = await createOrder({ companyId: company.id });

    const config = await createOptimizationConfig({ companyId: company.id });
    const result = buildOptimizationResult([
      {
        routeId: "route-1",
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        driverId: driver.id,
        stops: [
          {
            orderId: order1.id,
            trackingId: order1.trackingId,
            sequence: 1,
            address: order1.address,
            latitude: order1.latitude,
            longitude: order1.longitude,
          },
          {
            orderId: order2.id,
            trackingId: order2.trackingId,
            sequence: 2,
            address: order2.address,
            latitude: order2.latitude,
            longitude: order2.longitude,
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

    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as any,
    });

    const token = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });

    const response = await callConfirm(job.id, token, company.id);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);

    // Config should be CONFIRMED
    const [updatedConfig] = await testDb
      .select()
      .from(optimizationConfigurations)
      .where(eq(optimizationConfigurations.id, config.id))
      .limit(1);
    expect(updatedConfig.status).toBe("CONFIRMED");
    expect(updatedConfig.confirmedAt).toBeTruthy();

    // Orders should be ASSIGNED
    const [o1] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, order1.id))
      .limit(1);
    const [o2] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, order2.id))
      .limit(1);
    expect(o1.status).toBe("ASSIGNED");
    expect(o2.status).toBe("ASSIGNED");

    // Route stops should be created
    const stops = await testDb
      .select()
      .from(routeStops)
      .where(eq(routeStops.jobId, job.id));
    expect(stops.length).toBe(2);
    expect(stops.map((s) => s.orderId).sort()).toEqual(
      [order1.id, order2.id].sort(),
    );

    // Plan metrics should be created
    const metrics = await testDb
      .select()
      .from(planMetrics)
      .where(eq(planMetrics.jobId, job.id));
    expect(metrics.length).toBe(1);
    expect(metrics[0].companyId).toBe(company.id);
  });

  // ---- 2. Optimistic lock: already CONFIRMED --------------------------------
  test("returns 409 when config is already CONFIRMED", async () => {
    const company = await createCompany();
    const planner = await createPlanner(company.id);
    const driver = await createDriver(company.id);
    const vehicle = await createVehicle({ companyId: company.id });
    const order = await createOrder({ companyId: company.id });

    const config = await createOptimizationConfig({
      companyId: company.id,
      status: "CONFIRMED",
    });
    const result = buildOptimizationResult([
      {
        routeId: "route-1",
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        driverId: driver.id,
        stops: [
          {
            orderId: order.id,
            trackingId: order.trackingId,
            sequence: 1,
            address: order.address,
            latitude: order.latitude,
            longitude: order.longitude,
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

    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as any,
    });

    const token = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });

    const response = await callConfirm(job.id, token, company.id);
    expect(response.status).toBe(409);
  });

  // ---- 3. Job not COMPLETED -------------------------------------------------
  test("returns 400 when job status is not COMPLETED", async () => {
    const company = await createCompany();
    const planner = await createPlanner(company.id);

    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      status: "RUNNING",
      progress: 50,
    });

    const token = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });

    const response = await callConfirm(job.id, token, company.id);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("completed");
  });

  // ---- 4. CONDUCTOR role gets 403 -------------------------------------------
  test("returns 403 for CONDUCTOR role", async () => {
    const company = await createCompany();
    const driver = await createDriver(company.id);

    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
    });

    const token = await createTestToken({
      userId: driver.id,
      companyId: company.id,
      email: driver.email,
      role: driver.role,
    });

    const response = await callConfirm(job.id, token, company.id);
    expect(response.status).toBe(403);
  });

  // ---- 5. Missing company header --------------------------------------------
  test("returns 400 when x-company-id header is missing", async () => {
    const company = await createCompany();
    const planner = await createPlanner(company.id);

    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
    });

    const token = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });

    // Build request without companyId
    const request = await createTestRequest(
      `/api/optimization/jobs/${job.id}/confirm`,
      {
        method: "POST",
        body: {},
        token,
        // no companyId
      },
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(response.status).toBe(400);
  });

  // ---- 6. Job not found -----------------------------------------------------
  test("returns 404 for a non-existent job ID", async () => {
    const company = await createCompany();
    const planner = await createPlanner(company.id);

    const token = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });

    const fakeJobId = "00000000-0000-4000-a000-000000000000";
    const response = await callConfirm(fakeJobId, token, company.id);
    expect(response.status).toBe(404);
  });

  // ---- 7. Config not DRAFT (e.g. CONFIGURED) --------------------------------
  test("returns 409 when config status is not DRAFT", async () => {
    const company = await createCompany();
    const planner = await createPlanner(company.id);
    const driver = await createDriver(company.id);
    const vehicle = await createVehicle({ companyId: company.id });
    const order = await createOrder({ companyId: company.id });

    const config = await createOptimizationConfig({
      companyId: company.id,
      status: "CONFIGURED",
    });
    const result = buildOptimizationResult([
      {
        routeId: "route-1",
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        driverId: driver.id,
        stops: [
          {
            orderId: order.id,
            trackingId: order.trackingId,
            sequence: 1,
            address: order.address,
            latitude: order.latitude,
            longitude: order.longitude,
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

    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as any,
    });

    const token = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });

    const response = await callConfirm(job.id, token, company.id);
    expect(response.status).toBe(409);

    const body = await response.json();
    expect(body.error).toContain("CONFIGURED");
  });

  // ---- 8. No routes in result -----------------------------------------------
  test("returns 400 when result has empty routes array", async () => {
    const company = await createCompany();
    const planner = await createPlanner(company.id);

    const config = await createOptimizationConfig({ companyId: company.id });
    const result = buildOptimizationResult([]);

    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as any,
    });

    const token = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });

    const response = await callConfirm(job.id, token, company.id);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("no routes");
  });
});
