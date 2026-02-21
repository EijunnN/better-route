import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createPlanner,
  createCompanyProfile,
} from "../setup/test-data";

// Route handlers
import { GET as healthGET } from "@/app/api/health/route";
import { GET as companiesGET, POST as companiesPOST } from "@/app/api/companies/route";
import {
  GET as companyGET,
  PATCH as companyPATCH,
  DELETE as companyDELETE,
} from "@/app/api/companies/[id]/route";
import {
  GET as profileGET,
  POST as profilePOST,
  DELETE as profileDELETE,
} from "@/app/api/company-profiles/route";

describe("Company Management", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let company2: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let planner: Awaited<ReturnType<typeof createPlanner>>;
  let adminToken: string;
  let plannerToken: string;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany({ legalName: "Empresa Principal", commercialName: "EP" });
    company2 = await createCompany({ legalName: "Empresa Secundaria", commercialName: "ES" });
    admin = await createAdmin(null); // ADMIN_SISTEMA with null companyId
    planner = await createPlanner(company.id);

    adminToken = await createTestToken({
      userId: admin.id,
      companyId: null,
      email: admin.email,
      role: admin.role,
    });
    plannerToken = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // -------------------------------------------------------------------------
  // 1. Health check
  // -------------------------------------------------------------------------
  test("GET /api/health returns 200 with database status", async () => {
    const request = await createTestRequest("/api/health");
    const response = await healthGET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("healthy");
    expect(body.checks.database).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 2. List companies - ADMIN_SISTEMA sees all
  // -------------------------------------------------------------------------
  test("GET /api/companies - ADMIN_SISTEMA sees all companies", async () => {
    const request = await createTestRequest("/api/companies", {
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
    });
    const response = await companiesGET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.meta).toBeDefined();
    // Admin should see at least the 2 companies we created
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // 3. List companies - non-admin gets 403 (no COMPANY:READ permission)
  // -------------------------------------------------------------------------
  test("GET /api/companies - planner gets 403 (no company read permission)", async () => {
    const request = await createTestRequest("/api/companies", {
      token: plannerToken,
      companyId: company.id,
      userId: planner.id,
    });
    const response = await companiesGET(request);

    // PLANIFICADOR role does not have COMPANY:READ permission
    expect(response.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 4. Create company with defaults
  // -------------------------------------------------------------------------
  test("POST /api/companies creates company with defaults (201)", async () => {
    const request = await createTestRequest("/api/companies", {
      method: "POST",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
      body: {
        legalName: "Nueva Empresa Test",
        commercialName: "NET",
        email: "nueva@test.com",
        country: "PE",
        timezone: "America/Lima",
        currency: "PEN",
      },
    });
    const response = await companiesPOST(request);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.legalName).toBe("Nueva Empresa Test");
    expect(body.commercialName).toBe("NET");
    expect(body.email).toBe("nueva@test.com");
    expect(body.country).toBe("PE");
    expect(body.active).toBe(true);
    expect(body.id).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 5. Reject duplicate legalName
  // -------------------------------------------------------------------------
  test("POST /api/companies rejects duplicate legalName (400)", async () => {
    const request = await createTestRequest("/api/companies", {
      method: "POST",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
      body: {
        legalName: "Empresa Principal", // already exists
        commercialName: "Dup",
        email: "dup@test.com",
        country: "PE",
        timezone: "America/Lima",
        currency: "PEN",
      },
    });
    const response = await companiesPOST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("nombre legal");
  });

  // -------------------------------------------------------------------------
  // 6. Get company by ID
  // -------------------------------------------------------------------------
  test("GET /api/companies/[id] returns company details", async () => {
    const request = await createTestRequest(`/api/companies/${company.id}`, {
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
    });
    const response = await companyGET(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(company.id);
    expect(body.legalName).toBe("Empresa Principal");
  });

  // -------------------------------------------------------------------------
  // 7. Update company
  // -------------------------------------------------------------------------
  test("PATCH /api/companies/[id] updates company info", async () => {
    const request = await createTestRequest(`/api/companies/${company.id}`, {
      method: "PATCH",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
      body: {
        commercialName: "Empresa Principal Actualizada",
      },
    });
    const response = await companyPATCH(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.commercialName).toBe("Empresa Principal Actualizada");
    expect(body.id).toBe(company.id);
  });

  // -------------------------------------------------------------------------
  // 8. Soft delete company
  // -------------------------------------------------------------------------
  test("DELETE /api/companies/[id] soft deletes company", async () => {
    // Create a disposable company for deletion
    const toDelete = await createCompany({
      legalName: "Para Eliminar",
      commercialName: "DEL",
    });

    const request = await createTestRequest(`/api/companies/${toDelete.id}`, {
      method: "DELETE",
      token: adminToken,
      companyId: toDelete.id,
      userId: admin.id,
    });
    const response = await companyDELETE(request, {
      params: Promise.resolve({ id: toDelete.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify the company is soft-deleted (active=false)
    const verifyReq = await createTestRequest(`/api/companies/${toDelete.id}`, {
      token: adminToken,
      companyId: toDelete.id,
      userId: admin.id,
    });
    const verifyRes = await companyGET(verifyReq, {
      params: Promise.resolve({ id: toDelete.id }),
    });
    const verifyBody = await verifyRes.json();
    expect(verifyBody.active).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 9. GET company profiles - default when none configured
  // -------------------------------------------------------------------------
  test("GET /api/company-profiles returns default if none configured", async () => {
    const request = await createTestRequest("/api/company-profiles", {
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
    });
    const response = await profileGET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.isDefault).toBe(true);
    expect(body.data.profile).toBeNull();
    expect(body.data.defaults).toBeDefined();
    expect(body.data.defaults.enableWeight).toBe(true);
    expect(body.data.defaults.enableVolume).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 10. POST company profile - creates/updates
  // -------------------------------------------------------------------------
  test("POST /api/company-profiles creates optimization profile (201)", async () => {
    const request = await createTestRequest("/api/company-profiles", {
      method: "POST",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
      body: {
        enableWeight: true,
        enableVolume: false,
        enableOrderValue: true,
        enableUnits: false,
        enableOrderType: false,
        priorityNew: 40,
        priorityRescheduled: 70,
        priorityUrgent: 100,
      },
    });
    const response = await profilePOST(request);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.profile).toBeDefined();
    expect(body.data.profile.enableWeight).toBe(true);
    expect(body.data.profile.enableVolume).toBe(false);
    expect(body.data.profile.enableOrderValue).toBe(true);
    expect(body.data.message).toContain("creado");
  });

  // -------------------------------------------------------------------------
  // 11. DELETE company profile - resets to defaults
  // -------------------------------------------------------------------------
  test("DELETE /api/company-profiles resets to defaults", async () => {
    // Ensure a profile exists for this company first
    await createCompanyProfile({ companyId: company2.id });

    const request = await createTestRequest("/api/company-profiles", {
      method: "DELETE",
      token: adminToken,
      companyId: company2.id,
      userId: admin.id,
    });
    const response = await profileDELETE(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.message).toContain("restablecido");
  });

  // -------------------------------------------------------------------------
  // 12. Tenant isolation - non-system-admin scoped to own company
  // -------------------------------------------------------------------------
  test("Tenant isolation: ADMIN_FLOTA cannot access other company", async () => {
    // Create an ADMIN_FLOTA bound to company (not ADMIN_SISTEMA)
    const fleetAdmin = await createPlanner(company.id);
    const fleetToken = await createTestToken({
      userId: fleetAdmin.id,
      companyId: company.id,
      email: fleetAdmin.email,
      role: "ADMIN_FLOTA",
    });

    const request = await createTestRequest(`/api/companies/${company2.id}`, {
      token: fleetToken,
      companyId: company.id,
      userId: fleetAdmin.id,
    });
    const response = await companyGET(request, {
      params: Promise.resolve({ id: company2.id }),
    });

    // ADMIN_FLOTA doesn't have COMPANY:READ -> 403
    expect(response.status).toBe(403);
  });
});
