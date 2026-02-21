import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from "bun:test";
import { eq } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createPlanner,
  createOptimizationPreset,
  createCsvMappingTemplate,
  createOptimizationConfig,
  createOptimizationJob,
  createPlanMetrics,
} from "../setup/test-data";
import { optimizationPresets } from "@/db/schema";

// Route handlers
import {
  GET as presetsGET,
  POST as presetsPOST,
} from "@/app/api/optimization-presets/route";
import {
  GET as presetGET,
  PUT as presetPUT,
  DELETE as presetDELETE,
} from "@/app/api/optimization-presets/[id]/route";
import {
  GET as templatesGET,
  POST as templatesPOST,
} from "@/app/api/csv-column-mapping-templates/route";
import {
  GET as templateGET,
} from "@/app/api/csv-column-mapping-templates/[id]/route";
import { GET as plansGET } from "@/app/api/plans/route";
import { GET as planGET } from "@/app/api/plans/[id]/route";

describe("Presets, Templates & Output", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let company2: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let adminToken: string;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    company2 = await createCompany();
    admin = await createAdmin(company.id);

    adminToken = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: admin.role,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // =========================================================================
  // Optimization Presets
  // =========================================================================

  // -------------------------------------------------------------------------
  // 1. Create optimization preset
  // -------------------------------------------------------------------------
  test("POST /api/optimization-presets creates preset (201)", async () => {
    const request = await createTestRequest("/api/optimization-presets", {
      method: "POST",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Fast Delivery",
        description: "Minimize total distance",
        balanceVisits: false,
        minimizeVehicles: true,
        trafficFactor: 70,
        isDefault: false,
      },
    });
    const response = await presetsPOST(request);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.name).toBe("Fast Delivery");
    expect(body.data.companyId).toBe(company.id);
    expect(body.data.minimizeVehicles).toBe(true);
    expect(body.data.trafficFactor).toBe(70);
    expect(body.data.isDefault).toBe(false);
    expect(body.data.active).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2. Create default preset unsets other defaults (transaction)
  // -------------------------------------------------------------------------
  test("POST /api/optimization-presets with isDefault unsets other defaults", async () => {
    // Create a first default preset
    const firstDefault = await createOptimizationPreset({
      companyId: company.id,
      name: "First Default",
      isDefault: true,
    });

    // Create a second preset as default via API
    const request = await createTestRequest("/api/optimization-presets", {
      method: "POST",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "New Default Preset",
        isDefault: true,
      },
    });
    const response = await presetsPOST(request);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.isDefault).toBe(true);

    // Verify the first default was unset
    const [updated] = await testDb
      .select()
      .from(optimizationPresets)
      .where(eq(optimizationPresets.id, firstDefault.id));
    expect(updated.isDefault).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 3. List active presets
  // -------------------------------------------------------------------------
  test("GET /api/optimization-presets lists active presets", async () => {
    const request = await createTestRequest("/api/optimization-presets", {
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
    });
    const response = await presetsGET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    // All returned presets should be active and belong to this company
    for (const preset of body.data) {
      expect(preset.active).toBe(true);
      expect(preset.companyId).toBe(company.id);
    }
  });

  // -------------------------------------------------------------------------
  // 4. Update preset
  // -------------------------------------------------------------------------
  test("PUT /api/optimization-presets/[id] updates preset", async () => {
    const preset = await createOptimizationPreset({
      companyId: company.id,
      name: "To Update",
      trafficFactor: 50,
    });

    const request = await createTestRequest(`/api/optimization-presets/${preset.id}`, {
      method: "PUT",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Updated Preset",
        trafficFactor: 80,
      },
    });
    const response = await presetPUT(request, {
      params: Promise.resolve({ id: preset.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.name).toBe("Updated Preset");
    expect(body.data.trafficFactor).toBe(80);
  });

  // -------------------------------------------------------------------------
  // 5. Soft delete preset
  // -------------------------------------------------------------------------
  test("DELETE /api/optimization-presets/[id] soft deletes preset", async () => {
    const preset = await createOptimizationPreset({
      companyId: company.id,
      name: "To Delete",
    });

    const request = await createTestRequest(`/api/optimization-presets/${preset.id}`, {
      method: "DELETE",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
    });
    const response = await presetDELETE(request, {
      params: Promise.resolve({ id: preset.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify soft deleted
    const [deleted] = await testDb
      .select()
      .from(optimizationPresets)
      .where(eq(optimizationPresets.id, preset.id));
    expect(deleted.active).toBe(false);
  });

  // =========================================================================
  // CSV Column Mapping Templates
  // =========================================================================

  // -------------------------------------------------------------------------
  // 6. Create CSV template
  // -------------------------------------------------------------------------
  test("POST /api/csv-column-mapping-templates creates template (201)", async () => {
    const request = await createTestRequest("/api/csv-column-mapping-templates", {
      method: "POST",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Standard Import",
        description: "Standard CSV format",
        columnMapping: {
          "ID Seguimiento": "trackingId",
          "Direccion": "address",
          "Lat": "latitude",
          "Lon": "longitude",
          "Nombre": "customerName",
        },
        requiredFields: ["trackingId", "address", "latitude", "longitude", "customerName"],
      },
    });
    const response = await templatesPOST(request);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.name).toBe("Standard Import");
    expect(body.companyId).toBe(company.id);
    expect(body.id).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 7. List CSV templates
  // -------------------------------------------------------------------------
  test("GET /api/csv-column-mapping-templates lists templates", async () => {
    const request = await createTestRequest("/api/csv-column-mapping-templates", {
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
    });
    const response = await templatesGET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    for (const tpl of body) {
      expect(tpl.companyId).toBe(company.id);
    }
  });

  // -------------------------------------------------------------------------
  // 8. Duplicate template name returns 409
  // -------------------------------------------------------------------------
  test("POST /api/csv-column-mapping-templates rejects duplicate name (409)", async () => {
    await createCsvMappingTemplate({
      companyId: company.id,
      name: "Unique Template Name",
    });

    const request = await createTestRequest("/api/csv-column-mapping-templates", {
      method: "POST",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Unique Template Name",
        columnMapping: { col: "trackingId" },
        requiredFields: ["trackingId"],
      },
    });
    const response = await templatesPOST(request);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain("already exists");
  });

  // =========================================================================
  // Plans
  // =========================================================================

  // -------------------------------------------------------------------------
  // 9. List plans (completed jobs with metrics)
  // -------------------------------------------------------------------------
  test("GET /api/plans lists completed jobs with metrics", async () => {
    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      status: "COMPLETED",
      progress: 100,
    });
    await createPlanMetrics({
      companyId: company.id,
      jobId: job.id,
      configurationId: config.id,
      totalRoutes: 3,
      totalStops: 15,
    });

    const request = await createTestRequest("/api/plans", {
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
    });
    const response = await plansGET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.meta).toBeDefined();
    expect(body.meta.total).toBeGreaterThanOrEqual(1);

    // Find our job in the results
    const ourPlan = body.data.find((p: { id: string }) => p.id === job.id);
    expect(ourPlan).toBeDefined();
    expect(ourPlan.status).toBe("COMPLETED");
    expect(ourPlan.metrics).toBeDefined();
    expect(ourPlan.metrics.totalRoutes).toBe(3);
    expect(ourPlan.metrics.totalStops).toBe(15);
  });

  // -------------------------------------------------------------------------
  // 10. Get plan details
  // -------------------------------------------------------------------------
  test("GET /api/plans/[id] returns plan details", async () => {
    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      status: "COMPLETED",
      progress: 100,
      result: JSON.stringify({
        routes: [],
        unassignedOrders: [],
        metrics: { totalRoutes: 0, totalStops: 0 },
      }),
    });
    await createPlanMetrics({
      companyId: company.id,
      jobId: job.id,
      configurationId: config.id,
    });

    const request = await createTestRequest(`/api/plans/${job.id}`, {
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
    });
    const response = await planGET(request, {
      params: Promise.resolve({ id: job.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(job.id);
    expect(body.status).toBe("COMPLETED");
    expect(body.metrics).toBeDefined();
    // result should be parsed
    expect(body.result).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 11. Plan not found returns 404
  // -------------------------------------------------------------------------
  test("GET /api/plans/[id] returns 404 for non-existent plan", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000099";
    const request = await createTestRequest(`/api/plans/${fakeId}`, {
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
    });
    const response = await planGET(request, {
      params: Promise.resolve({ id: fakeId }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain("not found");
  });

  // -------------------------------------------------------------------------
  // 12. Preset tenant isolation
  // -------------------------------------------------------------------------
  test("Preset tenant isolation: cannot access other company presets", async () => {
    const otherPreset = await createOptimizationPreset({
      companyId: company2.id,
      name: "Other Company Preset",
    });

    // Try to GET the preset using company1's token but company1's companyId
    const request = await createTestRequest(`/api/optimization-presets/${otherPreset.id}`, {
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
    });
    const response = await presetGET(request, {
      params: Promise.resolve({ id: otherPreset.id }),
    });

    // Preset belongs to company2 but request has company.id -> not found
    expect(response.status).toBe(404);
  });
});
