import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createPlanner,
  createFleet,
  createVehicle,
} from "../setup/test-data";
import { fleets, vehicleFleets, vehicles } from "@/db/schema";

import {
  GET as GET_FLEET,
  PATCH as PATCH_FLEET,
  DELETE as DELETE_FLEET,
} from "@/app/api/fleets/[id]/route";
import { GET as GET_VEHICLE_COUNTS } from "@/app/api/fleets/[id]/vehicle-counts/route";
import { GET as GET_FLEET_VEHICLES } from "@/app/api/fleets/[id]/vehicles/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Insert a row into the vehicle_fleets junction table directly. */
async function linkVehicleToFleet(
  companyId: string,
  vehicleId: string,
  fleetId: string,
  active = true,
) {
  const [record] = await testDb
    .insert(vehicleFleets)
    .values({ companyId, vehicleId, fleetId, active })
    .returning();
  return record;
}

// =========================================================================
// Fleet Detail (GET /api/fleets/[id])
// =========================================================================
describe("Fleet Detail - GET /api/fleets/[id]", () => {
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

  test("returns fleet by ID with 200", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Detail Fleet" });

    const request = await createTestRequest(`/api/fleets/${fleet.id}`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_FLEET(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.id).toBe(fleet.id);
    expect(data.name).toBe("Detail Fleet");
    expect(data.companyId).toBe(company.id);
    expect(data.active).toBe(true);
    expect(data.vehicles).toBeInstanceOf(Array);
    expect(data.users).toBeInstanceOf(Array);
    expect(typeof data.vehicleCount).toBe("number");
    expect(typeof data.userCount).toBe("number");
  });

  test("returns fleet with associated vehicles", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet With Vehicles Detail" });
    const v1 = await createVehicle({ companyId: company.id, name: "V1-Detail" });
    const v2 = await createVehicle({ companyId: company.id, name: "V2-Detail" });
    await linkVehicleToFleet(company.id, v1.id, fleet.id);
    await linkVehicleToFleet(company.id, v2.id, fleet.id);

    const request = await createTestRequest(`/api/fleets/${fleet.id}`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_FLEET(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.vehicleCount).toBe(2);
    expect(data.vehicles).toHaveLength(2);
    expect(data.vehicleIds).toHaveLength(2);

    const vehicleIds = data.vehicles.map((v: { id: string }) => v.id);
    expect(vehicleIds).toContain(v1.id);
    expect(vehicleIds).toContain(v2.id);
  });

  test("excludes inactive vehicle-fleet links from count", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Inactive Links" });
    const v1 = await createVehicle({ companyId: company.id });
    const v2 = await createVehicle({ companyId: company.id });
    await linkVehicleToFleet(company.id, v1.id, fleet.id, true);
    await linkVehicleToFleet(company.id, v2.id, fleet.id, false); // inactive

    const request = await createTestRequest(`/api/fleets/${fleet.id}`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_FLEET(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.vehicleCount).toBe(1);
    expect(data.vehicles).toHaveLength(1);
    expect(data.vehicles[0].id).toBe(v1.id);
  });

  test("returns 404 for non-existent fleet ID", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const request = await createTestRequest(`/api/fleets/${fakeId}`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_FLEET(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("Fleet not found");
  });

  test("returns 401 when no auth token is provided", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Auth Test" });

    const request = await createTestRequest(`/api/fleets/${fleet.id}`, {
      method: "GET",
      // No token, no companyId, no userId
    });

    const response = await GET_FLEET(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(401);
  });

  test("enforces tenant isolation - cannot access fleet from another company", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Tenant A" });

    const companyB = await createCompany();
    const plannerB = await createPlanner(companyB.id);
    const tokenB = await createTestToken({
      userId: plannerB.id,
      companyId: companyB.id,
      email: plannerB.email,
      role: plannerB.role,
    });

    const request = await createTestRequest(`/api/fleets/${fleet.id}`, {
      method: "GET",
      token: tokenB,
      companyId: companyB.id,
      userId: plannerB.id,
    });

    const response = await GET_FLEET(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    // Fleet belongs to company A, user from company B should get 404
    expect(response.status).toBe(404);
  });
});

// =========================================================================
// Fleet Update (PATCH /api/fleets/[id])
// =========================================================================
describe("Fleet Update - PATCH /api/fleets/[id]", () => {
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

  test("updates fleet name", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Original Name" });

    const request = await createTestRequest(`/api/fleets/${fleet.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { name: "Updated Name" },
    });

    const response = await PATCH_FLEET(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.name).toBe("Updated Name");

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(fleets)
      .where(eq(fleets.id, fleet.id));
    expect(dbRecord.name).toBe("Updated Name");
  });

  test("updates fleet description", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Desc Test" });

    const request = await createTestRequest(`/api/fleets/${fleet.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { description: "New description text" },
    });

    const response = await PATCH_FLEET(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.description).toBe("New description text");
  });

  test("updates fleet vehicle associations via vehicleIds", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet VehicleIds Update" });
    const v1 = await createVehicle({ companyId: company.id });
    const v2 = await createVehicle({ companyId: company.id });
    const v3 = await createVehicle({ companyId: company.id });

    // Initially link v1
    await linkVehicleToFleet(company.id, v1.id, fleet.id);

    // Update to v2 + v3 (should deactivate v1 link, create v2 and v3 links)
    const request = await createTestRequest(`/api/fleets/${fleet.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { vehicleIds: [v2.id, v3.id] },
    });

    const response = await PATCH_FLEET(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.vehicleCount).toBe(2);
    expect(data.vehicles).toHaveLength(2);

    const ids = data.vehicles.map((v: { id: string }) => v.id);
    expect(ids).toContain(v2.id);
    expect(ids).toContain(v3.id);
    expect(ids).not.toContain(v1.id);
  });

  test("rejects duplicate fleet name within same company", async () => {
    await createFleet({ companyId: company.id, name: "Taken Name" });
    const fleet = await createFleet({ companyId: company.id, name: "Another Name" });

    const request = await createTestRequest(`/api/fleets/${fleet.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { name: "Taken Name" },
    });

    const response = await PATCH_FLEET(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Ya existe una flota activa con este nombre en la empresa");
  });

  test("returns 404 when updating non-existent fleet", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const request = await createTestRequest(`/api/fleets/${fakeId}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { name: "Ghost Fleet" },
    });

    const response = await PATCH_FLEET(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("Fleet not found");
  });

  test("returns 401 when no auth token is provided", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Patch Auth" });

    const request = await createTestRequest(`/api/fleets/${fleet.id}`, {
      method: "PATCH",
      body: { name: "No Auth" },
    });

    const response = await PATCH_FLEET(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(401);
  });

  test("enforces tenant isolation on PATCH", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Tenant A Fleet Patch" });

    const companyB = await createCompany();
    const adminB = await createAdmin(companyB.id);
    const tokenB = await createTestToken({
      userId: adminB.id,
      companyId: companyB.id,
      email: adminB.email,
      role: adminB.role,
    });

    const request = await createTestRequest(`/api/fleets/${fleet.id}`, {
      method: "PATCH",
      token: tokenB,
      companyId: companyB.id,
      userId: adminB.id,
      body: { name: "Hacked Fleet" },
    });

    const response = await PATCH_FLEET(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    // May return 403 (permission) or 404 (not found in tenant) depending on auth flow
    expect([403, 404]).toContain(response.status);
  });
});

// =========================================================================
// Fleet Delete (DELETE /api/fleets/[id])
// =========================================================================
describe("Fleet Delete - DELETE /api/fleets/[id]", () => {
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

  test("soft deletes a fleet", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet To Soft Delete" });

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

  test("deactivates vehicle links when deleting fleet", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Delete With Vehicles" });
    const v1 = await createVehicle({ companyId: company.id });
    const v2 = await createVehicle({ companyId: company.id });
    await linkVehicleToFleet(company.id, v1.id, fleet.id);
    await linkVehicleToFleet(company.id, v2.id, fleet.id);

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
    expect(data.deactivatedVehicles).toBe(2);

    // Verify vehicle-fleet links are deactivated
    const links = await testDb
      .select()
      .from(vehicleFleets)
      .where(eq(vehicleFleets.fleetId, fleet.id));
    for (const link of links) {
      expect(link.active).toBe(false);
    }
  });

  test("returns 404 when deleting non-existent fleet", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const request = await createTestRequest(`/api/fleets/${fakeId}`, {
      method: "DELETE",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await DELETE_FLEET(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("Fleet not found");
  });

  test("returns 401 when no auth token is provided", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Delete Auth" });

    const request = await createTestRequest(`/api/fleets/${fleet.id}`, {
      method: "DELETE",
    });

    const response = await DELETE_FLEET(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(401);
  });

  test("enforces tenant isolation on DELETE", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Tenant A Fleet Delete" });

    const companyB = await createCompany();
    const adminB = await createAdmin(companyB.id);
    const tokenB = await createTestToken({
      userId: adminB.id,
      companyId: companyB.id,
      email: adminB.email,
      role: adminB.role,
    });

    const request = await createTestRequest(`/api/fleets/${fleet.id}`, {
      method: "DELETE",
      token: tokenB,
      companyId: companyB.id,
      userId: adminB.id,
    });

    const response = await DELETE_FLEET(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    // May return 403 (permission) or 404 (not found in tenant) depending on auth flow
    expect([403, 404]).toContain(response.status);

    // Verify fleet is still active in company A
    const [dbRecord] = await testDb
      .select()
      .from(fleets)
      .where(eq(fleets.id, fleet.id));
    expect(dbRecord.active).toBe(true);
  });
});

// =========================================================================
// Fleet Vehicle Counts (GET /api/fleets/[id]/vehicle-counts)
// =========================================================================
describe("Fleet Vehicle Counts - GET /api/fleets/[id]/vehicle-counts", () => {
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

  test("returns zeros when fleet has no vehicles", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Empty Fleet Counts" });

    const request = await createTestRequest(`/api/fleets/${fleet.id}/vehicle-counts`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_VEHICLE_COUNTS(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.fleet.id).toBe(fleet.id);
    expect(data.fleet.name).toBe("Empty Fleet Counts");
    expect(data.counts.total).toBe(0);
    expect(data.counts.byStatus.AVAILABLE).toBe(0);
    expect(data.counts.byStatus.IN_MAINTENANCE).toBe(0);
    expect(data.counts.byStatus.ASSIGNED).toBe(0);
    expect(data.counts.byStatus.INACTIVE).toBe(0);
    expect(data.counts.utilizationRate).toBe(0);
  });

  test("returns correct counts grouped by status", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Counts Mixed" });

    const vAvail1 = await createVehicle({ companyId: company.id, status: "AVAILABLE" });
    const vAvail2 = await createVehicle({ companyId: company.id, status: "AVAILABLE" });
    const vAssigned = await createVehicle({ companyId: company.id, status: "ASSIGNED" });
    const vMaintenance = await createVehicle({ companyId: company.id, status: "IN_MAINTENANCE" });

    await linkVehicleToFleet(company.id, vAvail1.id, fleet.id);
    await linkVehicleToFleet(company.id, vAvail2.id, fleet.id);
    await linkVehicleToFleet(company.id, vAssigned.id, fleet.id);
    await linkVehicleToFleet(company.id, vMaintenance.id, fleet.id);

    const request = await createTestRequest(`/api/fleets/${fleet.id}/vehicle-counts`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_VEHICLE_COUNTS(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.counts.total).toBe(4);
    expect(data.counts.byStatus.AVAILABLE).toBe(2);
    expect(data.counts.byStatus.ASSIGNED).toBe(1);
    expect(data.counts.byStatus.IN_MAINTENANCE).toBe(1);
    expect(data.counts.byStatus.INACTIVE).toBe(0);
    // utilizationRate = assigned / total * 100 = 1/4 * 100 = 25
    expect(data.counts.utilizationRate).toBe(25);
  });

  test("excludes inactive vehicle-fleet links from counts", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Counts Inactive Links" });
    const v1 = await createVehicle({ companyId: company.id, status: "AVAILABLE" });
    const v2 = await createVehicle({ companyId: company.id, status: "AVAILABLE" });
    await linkVehicleToFleet(company.id, v1.id, fleet.id, true);
    await linkVehicleToFleet(company.id, v2.id, fleet.id, false); // inactive link

    const request = await createTestRequest(`/api/fleets/${fleet.id}/vehicle-counts`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_VEHICLE_COUNTS(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.counts.total).toBe(1);
    expect(data.counts.byStatus.AVAILABLE).toBe(1);
  });

  test("returns 404 for non-existent fleet", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const request = await createTestRequest(`/api/fleets/${fakeId}/vehicle-counts`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_VEHICLE_COUNTS(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("Fleet not found");
  });

  test("returns 401 when no auth token is provided", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Counts Auth" });

    const request = await createTestRequest(`/api/fleets/${fleet.id}/vehicle-counts`, {
      method: "GET",
    });

    const response = await GET_VEHICLE_COUNTS(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(401);
  });

  test("enforces tenant isolation on vehicle-counts", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Counts Tenant" });
    const v = await createVehicle({ companyId: company.id, status: "AVAILABLE" });
    await linkVehicleToFleet(company.id, v.id, fleet.id);

    const companyB = await createCompany();
    const plannerB = await createPlanner(companyB.id);
    const tokenB = await createTestToken({
      userId: plannerB.id,
      companyId: companyB.id,
      email: plannerB.email,
      role: plannerB.role,
    });

    const request = await createTestRequest(`/api/fleets/${fleet.id}/vehicle-counts`, {
      method: "GET",
      token: tokenB,
      companyId: companyB.id,
      userId: plannerB.id,
    });

    const response = await GET_VEHICLE_COUNTS(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(404);
  });
});

// =========================================================================
// Fleet Vehicles (GET /api/fleets/[id]/vehicles)
// =========================================================================
describe("Fleet Vehicles - GET /api/fleets/[id]/vehicles", () => {
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

  test("returns empty list when fleet has no vehicles", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Empty Fleet Vehicles" });

    const request = await createTestRequest(`/api/fleets/${fleet.id}/vehicles`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_FLEET_VEHICLES(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.fleet.id).toBe(fleet.id);
    expect(body.fleet.name).toBe("Empty Fleet Vehicles");
    expect(body.data).toHaveLength(0);
    expect(Number(body.meta.total)).toBe(0);
  });

  test("returns vehicles belonging to the fleet", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Vehicles List" });
    const v1 = await createVehicle({ companyId: company.id, name: "VList-1", plate: "VL-001" });
    const v2 = await createVehicle({ companyId: company.id, name: "VList-2", plate: "VL-002" });
    const v3 = await createVehicle({ companyId: company.id, name: "VList-3", plate: "VL-003" });
    await linkVehicleToFleet(company.id, v1.id, fleet.id);
    await linkVehicleToFleet(company.id, v2.id, fleet.id);
    await linkVehicleToFleet(company.id, v3.id, fleet.id);

    const request = await createTestRequest(`/api/fleets/${fleet.id}/vehicles`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_FLEET_VEHICLES(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveLength(3);
    expect(Number(body.meta.total)).toBe(3);

    const vehicleIds = body.data.map((v: { id: string }) => v.id);
    expect(vehicleIds).toContain(v1.id);
    expect(vehicleIds).toContain(v2.id);
    expect(vehicleIds).toContain(v3.id);
  });

  test("excludes inactive vehicle-fleet links", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Vehicles Inactive" });
    const v1 = await createVehicle({ companyId: company.id });
    const v2 = await createVehicle({ companyId: company.id });
    await linkVehicleToFleet(company.id, v1.id, fleet.id, true);
    await linkVehicleToFleet(company.id, v2.id, fleet.id, false); // inactive

    const request = await createTestRequest(`/api/fleets/${fleet.id}/vehicles`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_FLEET_VEHICLES(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(v1.id);
  });

  test("supports filtering by vehicle status", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Status Filter" });
    const vAvail = await createVehicle({ companyId: company.id, status: "AVAILABLE" });
    const vAssigned = await createVehicle({ companyId: company.id, status: "ASSIGNED" });
    await linkVehicleToFleet(company.id, vAvail.id, fleet.id);
    await linkVehicleToFleet(company.id, vAssigned.id, fleet.id);

    const request = await createTestRequest(`/api/fleets/${fleet.id}/vehicles`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      searchParams: { status: "AVAILABLE" },
    });

    const response = await GET_FLEET_VEHICLES(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(vAvail.id);
    expect(body.data[0].status).toBe("AVAILABLE");
  });

  test("supports pagination with limit and offset", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Pagination" });

    // Create 5 vehicles
    const vehiclePromises = Array.from({ length: 5 }, (_, i) =>
      createVehicle({ companyId: company.id, name: `VPag-${i}` }),
    );
    const createdVehicles = await Promise.all(vehiclePromises);

    for (const v of createdVehicles) {
      await linkVehicleToFleet(company.id, v.id, fleet.id);
    }

    // Request page of 2
    const request = await createTestRequest(`/api/fleets/${fleet.id}/vehicles`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      searchParams: { limit: "2", offset: "0" },
    });

    const response = await GET_FLEET_VEHICLES(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveLength(2);
    expect(Number(body.meta.total)).toBe(5);
    expect(Number(body.meta.limit)).toBe(2);
    expect(Number(body.meta.offset)).toBe(0);
  });

  test("returns 404 for non-existent fleet", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const request = await createTestRequest(`/api/fleets/${fakeId}/vehicles`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_FLEET_VEHICLES(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("Fleet not found");
  });

  test("returns 401 when no auth token is provided", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Vehicles Auth" });

    const request = await createTestRequest(`/api/fleets/${fleet.id}/vehicles`, {
      method: "GET",
    });

    const response = await GET_FLEET_VEHICLES(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(401);
  });

  test("enforces tenant isolation on fleet vehicles", async () => {
    const fleet = await createFleet({ companyId: company.id, name: "Fleet Vehicles Tenant" });
    const v = await createVehicle({ companyId: company.id });
    await linkVehicleToFleet(company.id, v.id, fleet.id);

    const companyB = await createCompany();
    const plannerB = await createPlanner(companyB.id);
    const tokenB = await createTestToken({
      userId: plannerB.id,
      companyId: companyB.id,
      email: plannerB.email,
      role: plannerB.role,
    });

    const request = await createTestRequest(`/api/fleets/${fleet.id}/vehicles`, {
      method: "GET",
      token: tokenB,
      companyId: companyB.id,
      userId: plannerB.id,
    });

    const response = await GET_FLEET_VEHICLES(request, {
      params: Promise.resolve({ id: fleet.id }),
    });
    expect(response.status).toBe(404);
  });
});
