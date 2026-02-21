import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createPlanner,
  createDriver,
  createVehicle,
  createOrder,
  createOptimizationConfig,
  createOptimizationJob,
  buildOptimizationResult,
} from "../setup/test-data";
import { optimizationJobs } from "@/db/schema";
import { POST } from "@/app/api/optimization/jobs/[id]/reassign/route";

describe("POST /api/optimization/jobs/[id]/reassign", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let token: string;
  let driverA: Awaited<ReturnType<typeof createDriver>>;
  let driverB: Awaited<ReturnType<typeof createDriver>>;
  let vehicleA: Awaited<ReturnType<typeof createVehicle>>;
  let vehicleB: Awaited<ReturnType<typeof createVehicle>>;
  let order1: Awaited<ReturnType<typeof createOrder>>;
  let order2: Awaited<ReturnType<typeof createOrder>>;
  let order3: Awaited<ReturnType<typeof createOrder>>;
  let config: Awaited<ReturnType<typeof createOptimizationConfig>>;

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

    driverA = await createDriver(company.id);
    driverB = await createDriver(company.id);
    vehicleA = await createVehicle({ companyId: company.id });
    vehicleB = await createVehicle({ companyId: company.id });
    order1 = await createOrder({ companyId: company.id });
    order2 = await createOrder({ companyId: company.id });
    order3 = await createOrder({ companyId: company.id });
    config = await createOptimizationConfig({ companyId: company.id });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  function buildTwoRouteResult() {
    return buildOptimizationResult([
      {
        routeId: "route-a",
        vehicleId: vehicleA.id,
        vehiclePlate: vehicleA.plate!,
        driverId: driverA.id,
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
      {
        routeId: "route-b",
        vehicleId: vehicleB.id,
        vehiclePlate: vehicleB.plate!,
        driverId: driverB.id,
        stops: [
          {
            orderId: order3.id,
            trackingId: order3.trackingId,
            sequence: 1,
            address: "Addr 3",
            latitude: "-12.07",
            longitude: "-77.06",
          },
        ],
        totalDistance: 3000,
        totalDuration: 1200,
        totalWeight: 50,
        totalVolume: 5,
        utilizationPercentage: 30,
        timeWindowViolations: 0,
      },
    ]);
  }

  test("reassigns an order from one route to another", async () => {
    const result = buildTwoRouteResult();
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as unknown as Record<string, unknown>,
    });

    const request = await createTestRequest(
      `/api/optimization/jobs/${job.id}/reassign`,
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          orders: [{ orderId: order1.id, sourceRouteId: "route-a" }],
          targetVehicleId: vehicleB.id,
        },
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: job.id }),
    });

    expect(response.status).toBe(200);

    const body = await response.json();

    // order1 should now be in route-b (target)
    const targetRoute = body.routes.find(
      (r: any) => r.vehicleId === vehicleB.id,
    );
    expect(targetRoute).toBeDefined();
    const targetOrderIds = targetRoute.stops.map((s: any) => s.orderId);
    expect(targetOrderIds).toContain(order1.id);

    // source route-a should have one fewer stop
    const sourceRoute = body.routes.find(
      (r: any) => r.vehicleId === vehicleA.id,
    );
    // route-a had 2 stops, now should have 1 (or be removed if empty after reoptimize)
    // Since vroom mock returns empty routes, the reoptimization clears stops
    // but the route still exists if it had remaining stops before reoptim
    // The handler removes empty routes, so route-a may be gone
    // Let's verify the order is NOT in route-a anymore
    if (sourceRoute) {
      const sourceOrderIds = sourceRoute.stops.map((s: any) => s.orderId);
      expect(sourceOrderIds).not.toContain(order1.id);
    }

    // Verify result was saved to database
    const dbJob = await testDb.query.optimizationJobs.findFirst({
      where: eq(optimizationJobs.id, job.id),
    });
    expect(dbJob).toBeDefined();
    expect(dbJob!.result).toBeDefined();
    const dbResult = dbJob!.result as any;
    const dbTargetRoute = dbResult.routes.find(
      (r: any) => r.vehicleId === vehicleB.id,
    );
    expect(dbTargetRoute).toBeDefined();
    const dbTargetOrderIds = dbTargetRoute.stops.map((s: any) => s.orderId);
    expect(dbTargetOrderIds).toContain(order1.id);
  });

  test("reassigns an unassigned order to a vehicle route", async () => {
    const result = buildTwoRouteResult();
    const unassignedOrder = await createOrder({ companyId: company.id });

    result.unassignedOrders = [
      {
        orderId: unassignedOrder.id,
        trackingId: unassignedOrder.trackingId,
        reason: "No capacity",
      },
    ];

    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as unknown as Record<string, unknown>,
    });

    const request = await createTestRequest(
      `/api/optimization/jobs/${job.id}/reassign`,
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          orders: [{ orderId: unassignedOrder.id, sourceRouteId: null }],
          targetVehicleId: vehicleA.id,
        },
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: job.id }),
    });

    expect(response.status).toBe(200);

    const body = await response.json();

    // Order should be removed from unassigned list
    const unassignedIds = body.unassignedOrders.map((o: any) => o.orderId);
    expect(unassignedIds).not.toContain(unassignedOrder.id);

    // Order should appear in the target vehicle's route
    const targetRoute = body.routes.find(
      (r: any) => r.vehicleId === vehicleA.id,
    );
    expect(targetRoute).toBeDefined();
    const targetOrderIds = targetRoute.stops.map((s: any) => s.orderId);
    expect(targetOrderIds).toContain(unassignedOrder.id);
  });

  test("returns 404 when target vehicle does not exist", async () => {
    const result = buildTwoRouteResult();
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as unknown as Record<string, unknown>,
    });

    const fakeVehicleId = "00000000-0000-4000-a000-000000000099";
    const request = await createTestRequest(
      `/api/optimization/jobs/${job.id}/reassign`,
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          orders: [{ orderId: order1.id, sourceRouteId: "route-a" }],
          targetVehicleId: fakeVehicleId,
        },
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: job.id }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toMatch(/vehicle/i);
  });

  test("returns 404 when job does not exist", async () => {
    const fakeJobId = "00000000-0000-4000-a000-000000000088";
    const request = await createTestRequest(
      `/api/optimization/jobs/${fakeJobId}/reassign`,
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          orders: [{ orderId: order1.id, sourceRouteId: "route-a" }],
          targetVehicleId: vehicleA.id,
        },
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: fakeJobId }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toMatch(/not found/i);
  });

  test("returns 400 when required fields are missing", async () => {
    const result = buildTwoRouteResult();
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as unknown as Record<string, unknown>,
    });

    const request = await createTestRequest(
      `/api/optimization/jobs/${job.id}/reassign`,
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {},
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: job.id }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test("enforces company isolation (tenant filtering)", async () => {
    // Create a job for company A
    const result = buildTwoRouteResult();
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as unknown as Record<string, unknown>,
    });

    // Create company B with its own admin
    const companyB = await createCompany();
    const adminB = await createAdmin(null);
    const tokenB = await createTestToken({
      userId: adminB.id,
      companyId: companyB.id,
      email: adminB.email,
      role: adminB.role,
    });

    // Also need a vehicle in company B so targetVehicle lookup could work
    const vehicleInB = await createVehicle({ companyId: companyB.id });

    const request = await createTestRequest(
      `/api/optimization/jobs/${job.id}/reassign`,
      {
        method: "POST",
        token: tokenB,
        companyId: companyB.id,
        userId: adminB.id,
        body: {
          orders: [{ orderId: order1.id, sourceRouteId: "route-a" }],
          targetVehicleId: vehicleInB.id,
        },
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: job.id }),
    });

    // Job belongs to company A, request is for company B → 404
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toMatch(/not found/i);
  });
});
