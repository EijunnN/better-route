import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createPlanner,
  createVehicle,
  createZone,
  createZoneVehicle,
  createFleet,
} from "../setup/test-data";
import { fleets, zones } from "@/db/schema";

import { GET as GET_FLEETS, POST as POST_FLEET } from "@/app/api/fleets/route";
import {
  GET as GET_FLEET,
  PATCH as PATCH_FLEET,
  DELETE as DELETE_FLEET,
} from "@/app/api/fleets/[id]/route";

import { GET as GET_ZONES, POST as POST_ZONE } from "@/app/api/zones/route";
import {
  GET as GET_ZONE,
  PATCH as PATCH_ZONE,
  DELETE as DELETE_ZONE,
} from "@/app/api/zones/[id]/route";

// Valid GeoJSON polygon (Lima area)
const VALID_POLYGON = JSON.stringify({
  type: "Polygon",
  coordinates: [
    [
      [-77.05, -12.04],
      [-77.04, -12.04],
      [-77.04, -12.05],
      [-77.05, -12.05],
      [-77.05, -12.04],
    ],
  ],
});

// A different valid polygon for update tests
const VALID_POLYGON_2 = JSON.stringify({
  type: "Polygon",
  coordinates: [
    [
      [-77.06, -12.06],
      [-77.03, -12.06],
      [-77.03, -12.08],
      [-77.06, -12.08],
      [-77.06, -12.06],
    ],
  ],
});

describe("Fleet CRUD", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let token: string;

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
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // 1. Fleet create (201)
  test("POST /api/fleets creates fleet with valid data", async () => {
    const request = await createTestRequest("/api/fleets", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { name: "Fleet Alpha" },
    });

    const response = await POST_FLEET(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.name).toBe("Fleet Alpha");
    expect(data.active).toBe(true);
    expect(data.companyId).toBe(company.id);

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(fleets)
      .where(eq(fleets.id, data.id));
    expect(dbRecord).toBeDefined();
    expect(dbRecord.name).toBe("Fleet Alpha");
  });

  // 2. Duplicate fleet name rejected
  test("POST /api/fleets rejects duplicate fleet name", async () => {
    await createFleet({ companyId: company.id, name: "Fleet Duplicate" });

    const request = await createTestRequest("/api/fleets", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { name: "Fleet Duplicate" },
    });

    const response = await POST_FLEET(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe(
      "Ya existe una flota activa con este nombre en la empresa",
    );
  });

  // 3. Fleet with vehicle associations
  test("POST /api/fleets creates fleet with vehicleIds", async () => {
    const v1 = await createVehicle({ companyId: company.id });
    const v2 = await createVehicle({ companyId: company.id });

    const request = await createTestRequest("/api/fleets", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { name: "Fleet With Vehicles", vehicleIds: [v1.id, v2.id] },
    });

    const response = await POST_FLEET(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.vehicleCount).toBe(2);
    expect(data.vehicles).toHaveLength(2);
    const vehicleIds = data.vehicles.map((v: { id: string }) => v.id);
    expect(vehicleIds).toContain(v1.id);
    expect(vehicleIds).toContain(v2.id);
  });

  // 4. Fleet list with vehicle counts
  test("GET /api/fleets returns fleets with vehicle counts", async () => {
    const request = await createTestRequest("/api/fleets", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_FLEETS(request);
    expect(response.status).toBe(200);

    const { data, meta } = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(meta.total).toBeGreaterThan(0);

    // Find the fleet we created with vehicles
    const fleetWithVehicles = data.find(
      (f: { name: string }) => f.name === "Fleet With Vehicles",
    );
    expect(fleetWithVehicles).toBeDefined();
    expect(fleetWithVehicles.vehicleCount).toBe(2);
    expect(fleetWithVehicles.vehicles).toHaveLength(2);
  });

  // 5. Fleet update name
  test("PATCH /api/fleets/:id updates fleet name", async () => {
    const fleet = await createFleet({
      companyId: company.id,
      name: "Fleet To Update",
    });

    const request = await createTestRequest(`/api/fleets/${fleet.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { name: "Fleet Updated" },
    });

    const response = await PATCH_FLEET(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.name).toBe("Fleet Updated");

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(fleets)
      .where(eq(fleets.id, fleet.id));
    expect(dbRecord.name).toBe("Fleet Updated");
  });

  // 6. Fleet soft delete
  test("DELETE /api/fleets/:id soft deletes fleet", async () => {
    const fleet = await createFleet({
      companyId: company.id,
      name: "Fleet To Delete",
    });

    const request = await createTestRequest(`/api/fleets/${fleet.id}`, {
      method: "DELETE",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await DELETE_FLEET(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("Flota desactivada exitosamente");

    // Verify in DB: active should be false
    const [dbRecord] = await testDb
      .select()
      .from(fleets)
      .where(eq(fleets.id, fleet.id));
    expect(dbRecord.active).toBe(false);
  });

  // 7. Tenant isolation (fleet)
  test("GET /api/fleets enforces tenant isolation", async () => {
    // Fleet already exists in company A from prior tests
    const companyB = await createCompany();
    const plannerB = await createPlanner(companyB.id);
    const tokenB = await createTestToken({
      userId: plannerB.id,
      companyId: companyB.id,
      email: plannerB.email,
      role: plannerB.role,
    });

    const request = await createTestRequest("/api/fleets", {
      method: "GET",
      token: tokenB,
      companyId: companyB.id,
      userId: plannerB.id,
    });

    const response = await GET_FLEETS(request);
    expect(response.status).toBe(200);

    const { data } = await response.json();
    // Company B should see zero fleets since all were created in company A
    expect(data).toHaveLength(0);
  });
});

describe("Zone CRUD", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let token: string;

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
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // 8. Zone create with valid Polygon GeoJSON (201)
  test("POST /api/zones creates zone with valid Polygon GeoJSON", async () => {
    const request = await createTestRequest("/api/zones", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Zone Lima Centro",
        type: "DELIVERY",
        geometry: VALID_POLYGON,
      },
    });

    const response = await POST_ZONE(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.name).toBe("Zone Lima Centro");
    expect(data.type).toBe("DELIVERY");
    expect(data.active).toBe(true);
    expect(data.companyId).toBe(company.id);
    expect(data.vehicleCount).toBe(0);

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(zones)
      .where(eq(zones.id, data.id));
    expect(dbRecord).toBeDefined();
    expect(dbRecord.name).toBe("Zone Lima Centro");
  });

  // 9. Zone rejects non-Polygon type
  test("POST /api/zones rejects non-Polygon geometry type", async () => {
    const pointGeoJson = JSON.stringify({
      type: "Point",
      coordinates: [-77.05, -12.04],
    });

    const request = await createTestRequest("/api/zones", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Zone Point Invalid",
        type: "DELIVERY",
        geometry: pointGeoJson,
      },
    });

    const response = await POST_ZONE(request);
    expect(response.status).toBe(400);
  });

  // 10. Zone rejects invalid coordinates (lat > 90)
  test("POST /api/zones rejects coordinates with lat > 90", async () => {
    const invalidCoords = JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [-77.05, 95.0],
          [-77.04, 95.0],
          [-77.04, 94.0],
          [-77.05, 94.0],
          [-77.05, 95.0],
        ],
      ],
    });

    const request = await createTestRequest("/api/zones", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Zone Invalid Lat",
        type: "DELIVERY",
        geometry: invalidCoords,
      },
    });

    const response = await POST_ZONE(request);
    expect(response.status).toBe(400);
  });

  // 11. Zone rejects unclosed ring / too few points
  test("POST /api/zones rejects ring with too few points", async () => {
    const tooFewPoints = JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [-77.05, -12.04],
          [-77.04, -12.04],
          [-77.05, -12.04],
        ],
      ],
    });

    const request = await createTestRequest("/api/zones", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Zone Too Few Points",
        type: "DELIVERY",
        geometry: tooFewPoints,
      },
    });

    const response = await POST_ZONE(request);
    expect(response.status).toBe(400);
  });

  // 12. Duplicate zone name rejected
  test("POST /api/zones rejects duplicate zone name", async () => {
    await createZone({ companyId: company.id, name: "Zone Duplicate" });

    const request = await createTestRequest("/api/zones", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Zone Duplicate",
        type: "DELIVERY",
        geometry: VALID_POLYGON,
      },
    });

    const response = await POST_ZONE(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe(
      "Ya existe una zona activa con este nombre en la empresa",
    );
  });

  // 13. Zone list with vehicle counts
  test("GET /api/zones returns zones with vehicle counts", async () => {
    const zone = await createZone({
      companyId: company.id,
      name: "Zone With Vehicles",
    });
    const v1 = await createVehicle({ companyId: company.id });
    const v2 = await createVehicle({ companyId: company.id });
    await createZoneVehicle({
      companyId: company.id,
      zoneId: zone.id,
      vehicleId: v1.id,
    });
    await createZoneVehicle({
      companyId: company.id,
      zoneId: zone.id,
      vehicleId: v2.id,
    });

    const request = await createTestRequest("/api/zones", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_ZONES(request);
    expect(response.status).toBe(200);

    const { data, meta } = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(meta.total).toBeGreaterThan(0);

    const zoneWithVehicles = data.find(
      (z: { name: string }) => z.name === "Zone With Vehicles",
    );
    expect(zoneWithVehicles).toBeDefined();
    expect(zoneWithVehicles.vehicleCount).toBe(2);
    expect(zoneWithVehicles.vehicles).toHaveLength(2);
  });

  // 14. Zone update geometry (new valid GeoJSON)
  test("PATCH /api/zones/:id updates zone geometry", async () => {
    const zone = await createZone({
      companyId: company.id,
      name: "Zone To Update Geo",
    });

    const request = await createTestRequest(`/api/zones/${zone.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { id: zone.id, geometry: VALID_POLYGON_2 },
    });

    const response = await PATCH_ZONE(request, {
      params: Promise.resolve({ id: zone.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    // parsedGeometry should reflect the updated polygon
    expect(data.parsedGeometry).toBeDefined();
    expect(data.parsedGeometry.type).toBe("Polygon");
    expect(data.parsedGeometry.coordinates[0][0][0]).toBe(-77.06);
  });

  // 15. Zone soft delete
  test("DELETE /api/zones/:id soft deletes zone", async () => {
    const zone = await createZone({
      companyId: company.id,
      name: "Zone To Delete",
    });

    const request = await createTestRequest(`/api/zones/${zone.id}`, {
      method: "DELETE",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await DELETE_ZONE(request, {
      params: Promise.resolve({ id: zone.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("Zona desactivada exitosamente");

    // Verify in DB: active should be false
    const [dbRecord] = await testDb
      .select()
      .from(zones)
      .where(eq(zones.id, zone.id));
    expect(dbRecord.active).toBe(false);
  });

  // 16. Tenant isolation (zone)
  test("GET /api/zones enforces tenant isolation", async () => {
    // Zones already exist in company A from prior tests
    const companyB = await createCompany();
    const plannerB = await createPlanner(companyB.id);
    const tokenB = await createTestToken({
      userId: plannerB.id,
      companyId: companyB.id,
      email: plannerB.email,
      role: plannerB.role,
    });

    const request = await createTestRequest("/api/zones", {
      method: "GET",
      token: tokenB,
      companyId: companyB.id,
      userId: plannerB.id,
    });

    const response = await GET_ZONES(request);
    expect(response.status).toBe(200);

    const { data } = await response.json();
    // Company B should see zero zones
    expect(data).toHaveLength(0);
  });
});
