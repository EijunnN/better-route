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
  createFleet,
  buildOptimizationResult,
} from "../setup/test-data";
import { alerts, vehicleFleets } from "@/db/schema";

import { GET as getDrivers } from "@/app/api/monitoring/drivers/route";
import { GET as getDriverDetail } from "@/app/api/monitoring/drivers/[id]/route";
import { GET as getEvents } from "@/app/api/monitoring/events/route";
import { GET as getGeoJson } from "@/app/api/monitoring/geojson/route";
import { GET as getSummary } from "@/app/api/monitoring/summary/route";

describe("Monitoring Dashboard", () => {
  // Company A (main test company)
  let companyA: Awaited<ReturnType<typeof createCompany>>;
  let adminA: Awaited<ReturnType<typeof createAdmin>>;
  let adminAToken: string;
  let fleetA: Awaited<ReturnType<typeof createFleet>>;
  let driverA1: Awaited<ReturnType<typeof createDriver>>;
  let driverA2: Awaited<ReturnType<typeof createDriver>>;
  let vehicleA1: Awaited<ReturnType<typeof createVehicle>>;
  let vehicleA2: Awaited<ReturnType<typeof createVehicle>>;
  let configA: Awaited<ReturnType<typeof createOptimizationConfig>>;
  let jobA: Awaited<ReturnType<typeof createOptimizationJob>>;
  let orderA1: Awaited<ReturnType<typeof createOrder>>;
  let orderA2: Awaited<ReturnType<typeof createOrder>>;
  let orderA3: Awaited<ReturnType<typeof createOrder>>;

  // Company B (tenant isolation)
  let companyB: Awaited<ReturnType<typeof createCompany>>;
  let adminB: Awaited<ReturnType<typeof createAdmin>>;
  let adminBToken: string;

  const routeIdA1 = "route-a1";
  const routeIdA2 = "route-a2";

  beforeAll(async () => {
    await cleanDatabase();

    // --- Company A setup ---
    companyA = await createCompany();
    adminA = await createAdmin(null);
    adminAToken = await createTestToken({
      userId: adminA.id,
      companyId: companyA.id,
      email: adminA.email,
      role: adminA.role,
    });

    fleetA = await createFleet({ companyId: companyA.id, name: "Fleet Alpha" });

    driverA1 = await createDriver(companyA.id, {
      name: "Driver Alpha",
      driverStatus: "IN_ROUTE",
      primaryFleetId: fleetA.id,
    });
    driverA2 = await createDriver(companyA.id, {
      name: "Driver Beta",
      driverStatus: "AVAILABLE",
      primaryFleetId: fleetA.id,
    });

    vehicleA1 = await createVehicle({
      companyId: companyA.id,
      plate: "ABC-001",
      maxOrders: 20,
    });
    vehicleA2 = await createVehicle({
      companyId: companyA.id,
      plate: "ABC-002",
      maxOrders: 20,
    });

    // Link vehicles to fleet
    await testDb.insert(vehicleFleets).values([
      { companyId: companyA.id, vehicleId: vehicleA1.id, fleetId: fleetA.id, active: true },
      { companyId: companyA.id, vehicleId: vehicleA2.id, fleetId: fleetA.id, active: true },
    ]);

    configA = await createOptimizationConfig({ companyId: companyA.id });

    // Create orders
    orderA1 = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-MON-001",
      address: "Av. Arequipa 100",
      latitude: "-12.0500",
      longitude: "-77.0300",
    });
    orderA2 = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-MON-002",
      address: "Av. Javier Prado 200",
      latitude: "-12.0900",
      longitude: "-77.0100",
    });
    orderA3 = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-MON-003",
      address: "Av. La Marina 300",
      latitude: "-12.0700",
      longitude: "-77.0800",
    });

    // Build optimization result JSON
    const optResult = buildOptimizationResult([
      {
        routeId: routeIdA1,
        vehicleId: vehicleA1.id,
        vehiclePlate: "ABC-001",
        driverId: driverA1.id,
        stops: [
          {
            orderId: orderA1.id,
            trackingId: "TRK-MON-001",
            sequence: 1,
            address: "Av. Arequipa 100",
            latitude: "-12.0500",
            longitude: "-77.0300",
          },
          {
            orderId: orderA2.id,
            trackingId: "TRK-MON-002",
            sequence: 2,
            address: "Av. Javier Prado 200",
            latitude: "-12.0900",
            longitude: "-77.0100",
          },
        ],
        totalDistance: 5000,
        totalDuration: 1800,
        totalWeight: 100,
        totalVolume: 50,
        utilizationPercentage: 60,
        timeWindowViolations: 0,
      },
      {
        routeId: routeIdA2,
        vehicleId: vehicleA2.id,
        vehiclePlate: "ABC-002",
        driverId: driverA2.id,
        stops: [
          {
            orderId: orderA3.id,
            trackingId: "TRK-MON-003",
            sequence: 1,
            address: "Av. La Marina 300",
            latitude: "-12.0700",
            longitude: "-77.0800",
          },
        ],
        totalDistance: 3000,
        totalDuration: 900,
        totalWeight: 50,
        totalVolume: 25,
        utilizationPercentage: 30,
        timeWindowViolations: 0,
      },
    ]);

    // Create the confirmed optimization job
    jobA = await createOptimizationJob({
      companyId: companyA.id,
      configurationId: configA.id,
      status: "COMPLETED",
      result: JSON.stringify(optResult),
    });

    // Create route stops in DB
    await createRouteStop({
      companyId: companyA.id,
      jobId: jobA.id,
      routeId: routeIdA1,
      userId: driverA1.id,
      vehicleId: vehicleA1.id,
      orderId: orderA1.id,
      sequence: 1,
      status: "COMPLETED",
      address: "Av. Arequipa 100",
      latitude: "-12.0500",
      longitude: "-77.0300",
      completedAt: new Date(),
    });
    await createRouteStop({
      companyId: companyA.id,
      jobId: jobA.id,
      routeId: routeIdA1,
      userId: driverA1.id,
      vehicleId: vehicleA1.id,
      orderId: orderA2.id,
      sequence: 2,
      status: "PENDING",
      address: "Av. Javier Prado 200",
      latitude: "-12.0900",
      longitude: "-77.0100",
    });
    await createRouteStop({
      companyId: companyA.id,
      jobId: jobA.id,
      routeId: routeIdA2,
      userId: driverA2.id,
      vehicleId: vehicleA2.id,
      orderId: orderA3.id,
      sequence: 1,
      status: "FAILED",
      address: "Av. La Marina 300",
      latitude: "-12.0700",
      longitude: "-77.0800",
      failureReason: "CUSTOMER_ABSENT",
    });

    // Create recent GPS locations for driverA1
    await createDriverLocation({
      companyId: companyA.id,
      driverId: driverA1.id,
      latitude: "-12.0510",
      longitude: "-77.0310",
      accuracy: 5,
      speed: 25,
      heading: 90,
      isMoving: true,
      batteryLevel: 80,
      recordedAt: new Date(), // recent
    });

    // Create old GPS location for driverA2 (>5 min ago)
    await createDriverLocation({
      companyId: companyA.id,
      driverId: driverA2.id,
      latitude: "-12.0710",
      longitude: "-77.0810",
      accuracy: 15,
      speed: 0,
      isMoving: false,
      recordedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
    });

    // --- Company B setup (for tenant isolation) ---
    companyB = await createCompany();
    adminB = await createAdmin(null);
    adminBToken = await createTestToken({
      userId: adminB.id,
      companyId: companyB.id,
      email: adminB.email,
      role: adminB.role,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // -----------------------------------------------------------------------
  // 1. GET /monitoring/drivers — returns driver list with stop aggregates
  // -----------------------------------------------------------------------
  test("GET /monitoring/drivers returns driver list with stop progress", async () => {
    const req = await createTestRequest("/api/monitoring/drivers", {
      token: adminAToken,
      companyId: companyA.id,
      userId: adminA.id,
    });
    const res = await getDrivers(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeArray();
    expect(body.data.length).toBeGreaterThanOrEqual(2);

    // Find driverA1 — has 2 stops, 1 completed
    const d1 = body.data.find((d: any) => d.id === driverA1.id);
    expect(d1).toBeDefined();
    expect(d1.hasRoute).toBe(true);
    expect(d1.progress.totalStops).toBe(2);
    expect(d1.progress.completedStops).toBe(1);
    expect(d1.progress.percentage).toBe(50);
    expect(d1.vehiclePlate).toBe("ABC-001");
  });

  // -----------------------------------------------------------------------
  // 2. GET /monitoring/drivers — includes GPS location freshness
  // -----------------------------------------------------------------------
  test("GET /monitoring/drivers includes GPS location freshness", async () => {
    const req = await createTestRequest("/api/monitoring/drivers", {
      token: adminAToken,
      companyId: companyA.id,
      userId: adminA.id,
    });
    const res = await getDrivers(req);
    expect(res.status).toBe(200);

    const body = await res.json();

    // driverA1 has recent location
    const d1 = body.data.find((d: any) => d.id === driverA1.id);
    expect(d1.currentLocation).not.toBeNull();
    expect(d1.currentLocation.isRecent).toBe(true);
    expect(d1.currentLocation.latitude).toBeCloseTo(-12.051, 2);

    // driverA2 has stale location (10 min ago)
    const d2 = body.data.find((d: any) => d.id === driverA2.id);
    expect(d2.currentLocation).not.toBeNull();
    expect(d2.currentLocation.isRecent).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 3. GET /monitoring/drivers — sorted (active routes first, then name)
  // -----------------------------------------------------------------------
  test("GET /monitoring/drivers sorted with active routes first", async () => {
    const req = await createTestRequest("/api/monitoring/drivers", {
      token: adminAToken,
      companyId: companyA.id,
      userId: adminA.id,
    });
    const res = await getDrivers(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    const driversWithRoute = body.data.filter((d: any) => d.hasRoute);
    const driversWithoutRoute = body.data.filter((d: any) => !d.hasRoute);

    // All drivers with routes come before drivers without
    if (driversWithRoute.length > 0 && driversWithoutRoute.length > 0) {
      const lastWithRouteIdx = body.data.findLastIndex((d: any) => d.hasRoute);
      const firstWithoutRouteIdx = body.data.findIndex((d: any) => !d.hasRoute);
      expect(lastWithRouteIdx).toBeLessThan(firstWithoutRouteIdx);
    }

    // Among drivers with routes, sorted by name
    for (let i = 1; i < driversWithRoute.length; i++) {
      expect(
        driversWithRoute[i - 1].name.localeCompare(driversWithRoute[i].name)
      ).toBeLessThanOrEqual(0);
    }
  });

  // -----------------------------------------------------------------------
  // 4. GET /monitoring/drivers/[id] — returns detailed driver route
  // -----------------------------------------------------------------------
  test("GET /monitoring/drivers/[id] returns detailed driver route", async () => {
    const req = await createTestRequest(
      `/api/monitoring/drivers/${driverA1.id}`,
      {
        token: adminAToken,
        companyId: companyA.id,
        userId: adminA.id,
      },
    );
    const res = await getDriverDetail(req, {
      params: Promise.resolve({ id: driverA1.id }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.driver).toBeDefined();
    expect(body.data.driver.id).toBe(driverA1.id);
    expect(body.data.driver.name).toBe("Driver Alpha");
    expect(body.data.driver.status).toBe("IN_ROUTE");

    expect(body.data.route).not.toBeNull();
    expect(body.data.route.routeId).toBe(routeIdA1);
    expect(body.data.route.vehicle.plate).toBe("ABC-001");
    expect(body.data.route.stops).toBeArray();
    expect(body.data.route.stops.length).toBe(2);

    // Stops ordered by sequence
    expect(body.data.route.stops[0].sequence).toBe(1);
    expect(body.data.route.stops[1].sequence).toBe(2);
    expect(body.data.route.stops[0].status).toBe("COMPLETED");
    expect(body.data.route.stops[1].status).toBe("PENDING");
  });

  // -----------------------------------------------------------------------
  // 5. GET /monitoring/drivers/[id] — includes route metrics
  // -----------------------------------------------------------------------
  test("GET /monitoring/drivers/[id] includes route metrics", async () => {
    const req = await createTestRequest(
      `/api/monitoring/drivers/${driverA1.id}`,
      {
        token: adminAToken,
        companyId: companyA.id,
        userId: adminA.id,
      },
    );
    const res = await getDriverDetail(req, {
      params: Promise.resolve({ id: driverA1.id }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    const metrics = body.data.route.metrics;
    expect(metrics).toBeDefined();
    expect(metrics.totalDistance).toBe(5000);
    expect(metrics.totalDuration).toBe(1800);
    expect(typeof metrics.utilizationPercentage).toBe("number");
    expect(typeof metrics.totalWeight).toBe("number");
    expect(typeof metrics.totalVolume).toBe("number");

    // currentLocation is included
    expect(body.data.currentLocation).not.toBeNull();
    expect(body.data.currentLocation.isRecent).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 6. GET /monitoring/drivers/[id] — 404 for non-existent driver
  // -----------------------------------------------------------------------
  test("GET /monitoring/drivers/[id] returns 404 for non-existent driver", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const req = await createTestRequest(
      `/api/monitoring/drivers/${fakeId}`,
      {
        token: adminAToken,
        companyId: companyA.id,
        userId: adminA.id,
      },
    );
    const res = await getDriverDetail(req, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toMatch(/no encontrado/i);
  });

  // -----------------------------------------------------------------------
  // 7. GET /monitoring/events — returns recent stop transitions
  // -----------------------------------------------------------------------
  test("GET /monitoring/events returns recent stop transitions", async () => {
    const req = await createTestRequest("/api/monitoring/events", {
      token: adminAToken,
      companyId: companyA.id,
      userId: adminA.id,
    });
    const res = await getEvents(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeArray();

    // We have 1 COMPLETED and 1 FAILED stop (both updated recently)
    const completedEvents = body.data.filter((e: any) => e.type === "COMPLETED");
    const failedEvents = body.data.filter((e: any) => e.type === "FAILED");
    expect(completedEvents.length).toBeGreaterThanOrEqual(1);
    expect(failedEvents.length).toBeGreaterThanOrEqual(1);

    // Each event has expected shape
    const event = body.data[0];
    expect(event.id).toBeDefined();
    expect(event.type).toBeDefined();
    expect(event.address).toBeDefined();
    expect(event.driverName).toBeDefined();
    expect(event.timestamp).toBeDefined();
    expect(event.routeId).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 8. GET /monitoring/geojson — returns FeatureCollection
  // -----------------------------------------------------------------------
  test("GET /monitoring/geojson returns FeatureCollection", async () => {
    const req = await createTestRequest("/api/monitoring/geojson", {
      token: adminAToken,
      companyId: companyA.id,
      userId: adminA.id,
    });
    const res = await getGeoJson(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.type).toBe("FeatureCollection");
    expect(body.data.features).toBeArray();
    expect(body.data.features.length).toBeGreaterThan(0);

    // Should contain route lines, stop points, and driver locations
    const types = body.data.features.map((f: any) => f.properties.type);
    expect(types).toContain("route");
    expect(types).toContain("stop");
    expect(types).toContain("driver_location");
  });

  // -----------------------------------------------------------------------
  // 9. GET /monitoring/geojson — overlays real stop statuses from DB
  // -----------------------------------------------------------------------
  test("GET /monitoring/geojson overlays real stop statuses", async () => {
    const req = await createTestRequest("/api/monitoring/geojson", {
      token: adminAToken,
      companyId: companyA.id,
      userId: adminA.id,
    });
    const res = await getGeoJson(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    const stopFeatures = body.data.features.filter(
      (f: any) => f.properties.type === "stop",
    );

    // At least some stops should have real DB statuses
    const statuses = stopFeatures.map((f: any) => f.properties.status);
    expect(statuses).toContain("COMPLETED");
    expect(statuses).toContain("PENDING");
    expect(statuses).toContain("FAILED");

    // Each stop feature has proper GeoJSON Point geometry
    for (const stop of stopFeatures) {
      expect(stop.geometry.type).toBe("Point");
      expect(stop.geometry.coordinates).toBeArray();
      expect(stop.geometry.coordinates.length).toBe(2);
      expect(stop.properties.routeId).toBeDefined();
      expect(stop.properties.sequence).toBeDefined();
    }
  });

  // -----------------------------------------------------------------------
  // 10. GET /monitoring/summary — returns completion %, driver counts
  // -----------------------------------------------------------------------
  test("GET /monitoring/summary returns metrics with completion data", async () => {
    const req = await createTestRequest("/api/monitoring/summary", {
      token: adminAToken,
      companyId: companyA.id,
      userId: adminA.id,
    });
    const res = await getSummary(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.hasActivePlan).toBe(true);
    expect(body.data.jobId).toBe(jobA.id);

    const m = body.data.metrics;
    expect(m.totalStops).toBe(3);
    expect(m.completedStops).toBe(1);
    expect(m.completenessPercentage).toBe(33); // 1/3 = 33%
    expect(m.delayedStops).toBeGreaterThanOrEqual(1); // FAILED stop counts as delayed
    expect(m.totalDrivers).toBeGreaterThanOrEqual(2);
    expect(typeof m.driversInRoute).toBe("number");
    expect(typeof m.driversAvailable).toBe("number");
    expect(typeof m.activeAlerts).toBe("number");
  });

  // -----------------------------------------------------------------------
  // 11. Tenant isolation — Company B sees no data from Company A
  // -----------------------------------------------------------------------
  test("tenant isolation: Company B sees empty monitoring data", async () => {
    // Drivers list
    const driversReq = await createTestRequest("/api/monitoring/drivers", {
      token: adminBToken,
      companyId: companyB.id,
      userId: adminB.id,
    });
    const driversRes = await getDrivers(driversReq);
    expect(driversRes.status).toBe(200);
    const driversBody = await driversRes.json();
    // Company B has no drivers
    expect(driversBody.data).toBeArray();
    const companyBDriverIds = driversBody.data.map((d: any) => d.id);
    expect(companyBDriverIds).not.toContain(driverA1.id);
    expect(companyBDriverIds).not.toContain(driverA2.id);

    // Summary — no active plan
    const summaryReq = await createTestRequest("/api/monitoring/summary", {
      token: adminBToken,
      companyId: companyB.id,
      userId: adminB.id,
    });
    const summaryRes = await getSummary(summaryReq);
    expect(summaryRes.status).toBe(200);
    const summaryBody = await summaryRes.json();
    expect(summaryBody.data.hasActivePlan).toBe(false);
    expect(summaryBody.data.metrics.totalStops).toBe(0);

    // GeoJSON — empty features
    const geoReq = await createTestRequest("/api/monitoring/geojson", {
      token: adminBToken,
      companyId: companyB.id,
      userId: adminB.id,
    });
    const geoRes = await getGeoJson(geoReq);
    expect(geoRes.status).toBe(200);
    const geoBody = await geoRes.json();
    expect(geoBody.data.type).toBe("FeatureCollection");
    expect(geoBody.data.features).toEqual([]);

    // Events — empty
    const eventsReq = await createTestRequest("/api/monitoring/events", {
      token: adminBToken,
      companyId: companyB.id,
      userId: adminB.id,
    });
    const eventsRes = await getEvents(eventsReq);
    expect(eventsRes.status).toBe(200);
    const eventsBody = await eventsRes.json();
    expect(eventsBody.data).toEqual([]);
  });
});
