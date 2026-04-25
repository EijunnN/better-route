import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from "bun:test";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createPlanner,
  createFieldDefinition,
  createCompanyProfile,
} from "../setup/test-data";
import { companyFieldDefinitions } from "@/db/schema";
import { eq } from "drizzle-orm";

// Route handlers - Company detail
import {
  GET as companyGET,
  PATCH as companyPATCH,
  DELETE as companyDELETE,
} from "@/app/api/companies/[id]/route";

// Route handlers - Field definitions (list + create)
import {
  GET as fieldListGET,
  POST as fieldPOST,
} from "@/app/api/companies/[id]/field-definitions/route";

// Route handlers - Field definition by ID
import {
  GET as fieldGET,
  PATCH as fieldPATCH,
  DELETE as fieldDELETE,
} from "@/app/api/companies/[id]/field-definitions/[fieldId]/route";

// Route handlers - Company optimization profiles
import {
  GET as profileGET,
  POST as profilePOST,
  DELETE as profileDELETE,
} from "@/app/api/company-profiles/route";

describe("Company Detail, Profiles & Field Definitions", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let company2: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let planner: Awaited<ReturnType<typeof createPlanner>>;
  let adminToken: string;
  let plannerToken: string;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany({
      legalName: "Detail Test Company",
      commercialName: "DTC",
      email: "detail-test@example.com",
      country: "PE",
      timezone: "America/Lima",
    });
    company2 = await createCompany({
      legalName: "Other Company",
      commercialName: "OC",
      email: "other@example.com",
    });
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
  // 1. GET company by ID - returns company details
  // -------------------------------------------------------------------------
  test("GET /api/companies/[id] returns company details for ADMIN_SISTEMA", async () => {
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
    expect(body.legalName).toBe("Detail Test Company");
    expect(body.commercialName).toBe("DTC");
    expect(body.email).toBe("detail-test@example.com");
    expect(body.country).toBe("PE");
    expect(body.timezone).toBe("America/Lima");
    expect(body.active).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2. GET company by ID - 404 for non-existent
  // -------------------------------------------------------------------------
  test("GET /api/companies/[id] returns 404 for non-existent company", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(`/api/companies/${fakeId}`, {
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
    });
    const response = await companyGET(request, {
      params: Promise.resolve({ id: fakeId }),
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 3. GET company by ID - 401 without auth
  // -------------------------------------------------------------------------
  test("GET /api/companies/[id] returns 401 without auth token", async () => {
    const request = await createTestRequest(`/api/companies/${company.id}`);
    const response = await companyGET(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 4. GET company by ID - 403 for PLANIFICADOR
  // -------------------------------------------------------------------------
  test("GET /api/companies/[id] PLANIFICADOR gets 403", async () => {
    const request = await createTestRequest(`/api/companies/${company.id}`, {
      token: plannerToken,
      companyId: company.id,
      userId: planner.id,
    });
    const response = await companyGET(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 5. GET company by ID - ADMIN_SISTEMA can access any company
  // -------------------------------------------------------------------------
  test("GET /api/companies/[id] ADMIN_SISTEMA can access any company", async () => {
    const request = await createTestRequest(`/api/companies/${company2.id}`, {
      token: adminToken,
      companyId: company2.id,
      userId: admin.id,
    });
    const response = await companyGET(request, {
      params: Promise.resolve({ id: company2.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(company2.id);
    expect(body.legalName).toBe("Other Company");
  });

  // -------------------------------------------------------------------------
  // 6. PATCH company - updates commercialName
  // -------------------------------------------------------------------------
  test("PATCH /api/companies/[id] updates company commercialName", async () => {
    const request = await createTestRequest(`/api/companies/${company.id}`, {
      method: "PATCH",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
      body: { commercialName: "Updated DTC" },
    });
    const response = await companyPATCH(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.commercialName).toBe("Updated DTC");
    expect(body.id).toBe(company.id);
    expect(body.legalName).toBe("Detail Test Company");
  });

  // -------------------------------------------------------------------------
  // 7. PATCH company - updates timezone and dateFormat
  // -------------------------------------------------------------------------
  test("PATCH /api/companies/[id] updates timezone and dateFormat", async () => {
    const request = await createTestRequest(`/api/companies/${company.id}`, {
      method: "PATCH",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
      body: { timezone: "America/Bogota", dateFormat: "YYYY-MM-DD" },
    });
    const response = await companyPATCH(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.timezone).toBe("America/Bogota");
    expect(body.dateFormat).toBe("YYYY-MM-DD");
  });

  // -------------------------------------------------------------------------
  // 8. PATCH company - 404 for non-existent
  // -------------------------------------------------------------------------
  test("PATCH /api/companies/[id] returns 404 for non-existent company", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(`/api/companies/${fakeId}`, {
      method: "PATCH",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
      body: { commercialName: "Ghost" },
    });
    const response = await companyPATCH(request, {
      params: Promise.resolve({ id: fakeId }),
    });

    expect(response.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 9. PATCH company - rejects duplicate legalName
  // -------------------------------------------------------------------------
  test("PATCH /api/companies/[id] rejects duplicate legalName (400)", async () => {
    const request = await createTestRequest(`/api/companies/${company.id}`, {
      method: "PATCH",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
      body: { legalName: "Other Company" }, // company2's legalName
    });
    const response = await companyPATCH(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("nombre legal");
  });

  // -------------------------------------------------------------------------
  // 10. PATCH company - rejects duplicate email
  // -------------------------------------------------------------------------
  test("PATCH /api/companies/[id] rejects duplicate email (400)", async () => {
    const request = await createTestRequest(`/api/companies/${company.id}`, {
      method: "PATCH",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
      body: { email: "other@example.com" }, // company2's email
    });
    const response = await companyPATCH(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("correo");
  });

  // -------------------------------------------------------------------------
  // 11. PATCH company - 401 without auth
  // -------------------------------------------------------------------------
  test("PATCH /api/companies/[id] returns 401 without auth", async () => {
    const request = await createTestRequest(`/api/companies/${company.id}`, {
      method: "PATCH",
      body: { commercialName: "No Auth" },
    });
    const response = await companyPATCH(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 12. DELETE company - soft deletes
  // -------------------------------------------------------------------------
  test("DELETE /api/companies/[id] soft-deletes company", async () => {
    const toDelete = await createCompany({
      legalName: "To Delete Detail",
      commercialName: "TDD",
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

    // Verify soft-delete via GET
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
  // 13. DELETE company - 404 for non-existent
  // -------------------------------------------------------------------------
  test("DELETE /api/companies/[id] returns 404 for non-existent company", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(`/api/companies/${fakeId}`, {
      method: "DELETE",
      token: adminToken,
      companyId: company.id,
      userId: admin.id,
    });
    const response = await companyDELETE(request, {
      params: Promise.resolve({ id: fakeId }),
    });

    expect(response.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 14. DELETE company - 401 without auth
  // -------------------------------------------------------------------------
  test("DELETE /api/companies/[id] returns 401 without auth", async () => {
    const request = await createTestRequest(`/api/companies/${company.id}`, {
      method: "DELETE",
    });
    const response = await companyDELETE(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 15. Field definitions - GET list returns empty for new company
  // -------------------------------------------------------------------------
  test("GET /api/companies/[id]/field-definitions returns empty for new company", async () => {
    const emptyCo = await createCompany();
    const request = await createTestRequest(
      `/api/companies/${emptyCo.id}/field-definitions`,
      { token: adminToken, companyId: emptyCo.id, userId: admin.id },
    );
    const response = await fieldListGET(request, {
      params: Promise.resolve({ id: emptyCo.id }),
    });

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 16. Field definitions - GET list ordered by position
  // -------------------------------------------------------------------------
  test("GET /api/companies/[id]/field-definitions returns definitions ordered by position", async () => {
    const listCo = await createCompany();
    await createFieldDefinition({ companyId: listCo.id, code: "z_field", label: "Z", position: 20 });
    await createFieldDefinition({ companyId: listCo.id, code: "a_field", label: "A", position: 1 });
    await createFieldDefinition({ companyId: listCo.id, code: "m_field", label: "M", position: 10 });

    const request = await createTestRequest(
      `/api/companies/${listCo.id}/field-definitions`,
      { token: adminToken, companyId: listCo.id, userId: admin.id },
    );
    const response = await fieldListGET(request, {
      params: Promise.resolve({ id: listCo.id }),
    });

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toHaveLength(3);
    expect(data[0].code).toBe("a_field");
    expect(data[1].code).toBe("m_field");
    expect(data[2].code).toBe("z_field");
  });

  // -------------------------------------------------------------------------
  // 17. Field definitions - GET list filters by entity query param
  // -------------------------------------------------------------------------
  test("GET /api/companies/[id]/field-definitions filters by entity query param", async () => {
    const filterCo = await createCompany();
    await createFieldDefinition({ companyId: filterCo.id, code: "order_f", entity: "orders" });
    await createFieldDefinition({ companyId: filterCo.id, code: "stop_f", entity: "route_stops" });

    const request = await createTestRequest(
      `/api/companies/${filterCo.id}/field-definitions`,
      {
        token: adminToken,
        companyId: filterCo.id,
        userId: admin.id,
        searchParams: { entity: "route_stops" },
      },
    );
    const response = await fieldListGET(request, {
      params: Promise.resolve({ id: filterCo.id }),
    });

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].code).toBe("stop_f");
    expect(data[0].entity).toBe("route_stops");
  });

  // -------------------------------------------------------------------------
  // 18. Field definitions - GET list 401 without auth
  // -------------------------------------------------------------------------
  test("GET /api/companies/[id]/field-definitions returns 401 without auth", async () => {
    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
    );
    const response = await fieldListGET(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 19. Field definitions - tenant isolation
  // -------------------------------------------------------------------------
  test("GET /api/companies/[id]/field-definitions tenant isolation", async () => {
    const coA = await createCompany();
    const coB = await createCompany();
    await createFieldDefinition({ companyId: coA.id, code: "private_field", label: "Private" });

    const request = await createTestRequest(
      `/api/companies/${coB.id}/field-definitions`,
      { token: adminToken, companyId: coB.id, userId: admin.id },
    );
    const response = await fieldListGET(request, {
      params: Promise.resolve({ id: coB.id }),
    });

    expect(response.status).toBe(200);
    const { data } = await response.json();
    const codes = data.map((d: { code: string }) => d.code);
    expect(codes).not.toContain("private_field");
  });

  // -------------------------------------------------------------------------
  // 20. Field definitions - POST creates text field with all properties
  // -------------------------------------------------------------------------
  test("POST /api/companies/[id]/field-definitions creates text field", async () => {
    const body = {
      entity: "orders",
      code: "detail_ref",
      label: "Detail Reference",
      fieldType: "text",
      required: true,
      placeholder: "Enter ref",
      position: 1,
      showInList: true,
      showInMobile: true,
      showInCsv: true,
    };

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { method: "POST", token: adminToken, companyId: company.id, userId: admin.id, body },
    );
    const response = await fieldPOST(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.code).toBe("detail_ref");
    expect(data.label).toBe("Detail Reference");
    expect(data.fieldType).toBe("text");
    expect(data.required).toBe(true);
    expect(data.placeholder).toBe("Enter ref");
    expect(data.position).toBe(1);
    expect(data.showInList).toBe(true);
    expect(data.showInMobile).toBe(true);
    expect(data.showInCsv).toBe(true);
    expect(data.companyId).toBe(company.id);
    expect(data.entity).toBe("orders");
    expect(data.active).toBe(true);
    expect(data.id).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 21. Field definitions - POST creates select field with options
  // -------------------------------------------------------------------------
  test("POST /api/companies/[id]/field-definitions creates select field with options", async () => {
    const body = {
      entity: "orders",
      code: "detail_priority",
      label: "Priority",
      fieldType: "select",
      options: ["low", "medium", "high"],
    };

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { method: "POST", token: adminToken, companyId: company.id, userId: admin.id, body },
    );
    const response = await fieldPOST(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.fieldType).toBe("select");
    expect(data.options).toEqual(["low", "medium", "high"]);
  });

  // -------------------------------------------------------------------------
  // 22. Field definitions - POST creates number field with validation rules
  // -------------------------------------------------------------------------
  test("POST /api/companies/[id]/field-definitions creates number field with validation rules", async () => {
    const body = {
      entity: "orders",
      code: "detail_weight",
      label: "Weight",
      fieldType: "number",
      required: true,
      validationRules: { min: 0, max: 500 },
    };

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { method: "POST", token: adminToken, companyId: company.id, userId: admin.id, body },
    );
    const response = await fieldPOST(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.fieldType).toBe("number");
    expect(data.validationRules).toEqual({ min: 0, max: 500 });
  });

  // -------------------------------------------------------------------------
  // 23. Field definitions - POST creates boolean field with defaultValue
  // -------------------------------------------------------------------------
  test("POST /api/companies/[id]/field-definitions creates boolean field with defaultValue", async () => {
    const body = {
      entity: "orders",
      code: "detail_fragile",
      label: "Is Fragile",
      fieldType: "boolean",
      defaultValue: "false",
    };

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { method: "POST", token: adminToken, companyId: company.id, userId: admin.id, body },
    );
    const response = await fieldPOST(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.fieldType).toBe("boolean");
    expect(data.defaultValue).toBe("false");
  });

  // -------------------------------------------------------------------------
  // 24. Field definitions - POST defaults fieldType to text
  // -------------------------------------------------------------------------
  test("POST /api/companies/[id]/field-definitions defaults fieldType to text", async () => {
    const body = {
      entity: "orders",
      code: "detail_default_type",
      label: "Default Type",
    };

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { method: "POST", token: adminToken, companyId: company.id, userId: admin.id, body },
    );
    const response = await fieldPOST(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.fieldType).toBe("text");
  });

  // -------------------------------------------------------------------------
  // 25. Field definitions - POST returns 400 when code is missing
  // -------------------------------------------------------------------------
  test("POST /api/companies/[id]/field-definitions returns 400 when code is missing", async () => {
    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      {
        method: "POST",
        token: adminToken,
        companyId: company.id,
        userId: admin.id,
        body: { label: "No Code", entity: "orders" },
      },
    );
    const response = await fieldPOST(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("code");
  });

  // -------------------------------------------------------------------------
  // 26. Field definitions - POST returns 400 when label is missing
  // -------------------------------------------------------------------------
  test("POST /api/companies/[id]/field-definitions returns 400 when label is missing", async () => {
    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      {
        method: "POST",
        token: adminToken,
        companyId: company.id,
        userId: admin.id,
        body: { code: "no_label_detail", entity: "orders" },
      },
    );
    const response = await fieldPOST(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // 27. Field definitions - POST returns 400 when entity is missing
  // -------------------------------------------------------------------------
  test("POST /api/companies/[id]/field-definitions returns 400 when entity is missing", async () => {
    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      {
        method: "POST",
        token: adminToken,
        companyId: company.id,
        userId: admin.id,
        body: { code: "no_entity_detail", label: "No Entity" },
      },
    );
    const response = await fieldPOST(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // 28. Field definitions - POST returns 409 for duplicate code
  // -------------------------------------------------------------------------
  test("POST /api/companies/[id]/field-definitions returns 409 for duplicate code", async () => {
    const dupCo = await createCompany();
    const body = {
      entity: "orders",
      code: "dup_detail_code",
      label: "Duplicate",
      fieldType: "text",
    };

    // First creation succeeds
    const req1 = await createTestRequest(
      `/api/companies/${dupCo.id}/field-definitions`,
      { method: "POST", token: adminToken, companyId: dupCo.id, userId: admin.id, body },
    );
    const res1 = await fieldPOST(req1, {
      params: Promise.resolve({ id: dupCo.id }),
    });
    expect(res1.status).toBe(201);

    // Second with same code+entity returns 409
    const req2 = await createTestRequest(
      `/api/companies/${dupCo.id}/field-definitions`,
      { method: "POST", token: adminToken, companyId: dupCo.id, userId: admin.id, body },
    );
    const res2 = await fieldPOST(req2, {
      params: Promise.resolve({ id: dupCo.id }),
    });
    expect(res2.status).toBe(409);
    const errData = await res2.json();
    expect(errData.error).toContain("dup_detail_code");
  });

  // -------------------------------------------------------------------------
  // 29. Field definitions - same code in different entities is allowed
  // -------------------------------------------------------------------------
  test("POST /api/companies/[id]/field-definitions allows same code in different entities", async () => {
    const multiCo = await createCompany();
    const bodyOrders = {
      entity: "orders",
      code: "shared_code",
      label: "Orders Field",
      fieldType: "text",
    };
    const bodyStops = {
      entity: "route_stops",
      code: "shared_code",
      label: "Stops Field",
      fieldType: "text",
    };

    const req1 = await createTestRequest(
      `/api/companies/${multiCo.id}/field-definitions`,
      { method: "POST", token: adminToken, companyId: multiCo.id, userId: admin.id, body: bodyOrders },
    );
    const res1 = await fieldPOST(req1, {
      params: Promise.resolve({ id: multiCo.id }),
    });
    expect(res1.status).toBe(201);

    const req2 = await createTestRequest(
      `/api/companies/${multiCo.id}/field-definitions`,
      { method: "POST", token: adminToken, companyId: multiCo.id, userId: admin.id, body: bodyStops },
    );
    const res2 = await fieldPOST(req2, {
      params: Promise.resolve({ id: multiCo.id }),
    });
    expect(res2.status).toBe(201);
  });

  // -------------------------------------------------------------------------
  // 30. Field definitions - POST returns 401 without auth
  // -------------------------------------------------------------------------
  test("POST /api/companies/[id]/field-definitions returns 401 without auth", async () => {
    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      {
        method: "POST",
        body: { code: "noauth", label: "No Auth", entity: "orders" },
      },
    );
    const response = await fieldPOST(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 31. Field definitions - GET single by ID
  // -------------------------------------------------------------------------
  test("GET /api/companies/[id]/field-definitions/[fieldId] returns field by ID", async () => {
    const field = await createFieldDefinition({
      companyId: company.id,
      code: "get_by_id",
      label: "Get By ID",
      fieldType: "text",
      required: true,
    });

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${field.id}`,
      { token: adminToken, companyId: company.id, userId: admin.id },
    );
    const response = await fieldGET(request, {
      params: Promise.resolve({ id: company.id, fieldId: field.id }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe(field.id);
    expect(data.code).toBe("get_by_id");
    expect(data.label).toBe("Get By ID");
    expect(data.companyId).toBe(company.id);
  });

  // -------------------------------------------------------------------------
  // 32. Field definitions - GET single 404 for non-existent
  // -------------------------------------------------------------------------
  test("GET /api/companies/[id]/field-definitions/[fieldId] returns 404 for non-existent", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${fakeId}`,
      { token: adminToken, companyId: company.id, userId: admin.id },
    );
    const response = await fieldGET(request, {
      params: Promise.resolve({ id: company.id, fieldId: fakeId }),
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("not found");
  });

  // -------------------------------------------------------------------------
  // 33. Field definitions - GET single 404 when field belongs to different company
  // -------------------------------------------------------------------------
  test("GET /api/companies/[id]/field-definitions/[fieldId] 404 cross-company", async () => {
    const field = await createFieldDefinition({
      companyId: company.id,
      code: "isolation_get",
      label: "Isolated",
    });

    const request = await createTestRequest(
      `/api/companies/${company2.id}/field-definitions/${field.id}`,
      { token: adminToken, companyId: company2.id, userId: admin.id },
    );
    const response = await fieldGET(request, {
      params: Promise.resolve({ id: company2.id, fieldId: field.id }),
    });

    expect(response.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 34. Field definitions - GET single 401 without auth
  // -------------------------------------------------------------------------
  test("GET /api/companies/[id]/field-definitions/[fieldId] returns 401 without auth", async () => {
    const field = await createFieldDefinition({
      companyId: company.id,
      code: "noauth_get",
      label: "No Auth Get",
    });

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${field.id}`,
    );
    const response = await fieldGET(request, {
      params: Promise.resolve({ id: company.id, fieldId: field.id }),
    });

    expect(response.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 35. Field definitions - PATCH updates label and required
  // -------------------------------------------------------------------------
  test("PATCH /api/companies/[id]/field-definitions/[fieldId] updates label and required", async () => {
    const field = await createFieldDefinition({
      companyId: company.id,
      code: "patch_label",
      label: "Original Label",
      required: false,
    });

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${field.id}`,
      {
        method: "PATCH",
        token: adminToken,
        companyId: company.id,
        userId: admin.id,
        body: { label: "Updated Label", required: true },
      },
    );
    const response = await fieldPATCH(request, {
      params: Promise.resolve({ id: company.id, fieldId: field.id }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.label).toBe("Updated Label");
    expect(data.required).toBe(true);
    expect(data.code).toBe("patch_label");
  });

  // -------------------------------------------------------------------------
  // 36. Field definitions - PATCH updates options
  // -------------------------------------------------------------------------
  test("PATCH /api/companies/[id]/field-definitions/[fieldId] updates options", async () => {
    const field = await createFieldDefinition({
      companyId: company.id,
      code: "patch_options",
      label: "Select Field",
      fieldType: "select",
      options: ["a", "b"],
    });

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${field.id}`,
      {
        method: "PATCH",
        token: adminToken,
        companyId: company.id,
        userId: admin.id,
        body: { options: ["a", "b", "c", "d"] },
      },
    );
    const response = await fieldPATCH(request, {
      params: Promise.resolve({ id: company.id, fieldId: field.id }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.options).toEqual(["a", "b", "c", "d"]);
  });

  // -------------------------------------------------------------------------
  // 37. Field definitions - PATCH updates position and showIn flags
  // -------------------------------------------------------------------------
  test("PATCH /api/companies/[id]/field-definitions/[fieldId] updates position and showIn flags", async () => {
    const field = await createFieldDefinition({
      companyId: company.id,
      code: "patch_position",
      label: "Position Test",
      position: 0,
      showInList: false,
      showInMobile: true,
      showInCsv: true,
    });

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${field.id}`,
      {
        method: "PATCH",
        token: adminToken,
        companyId: company.id,
        userId: admin.id,
        body: { position: 10, showInList: true, showInMobile: false, showInCsv: false },
      },
    );
    const response = await fieldPATCH(request, {
      params: Promise.resolve({ id: company.id, fieldId: field.id }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.position).toBe(10);
    expect(data.showInList).toBe(true);
    expect(data.showInMobile).toBe(false);
    expect(data.showInCsv).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 38. Field definitions - PATCH updates placeholder and defaultValue
  // -------------------------------------------------------------------------
  test("PATCH /api/companies/[id]/field-definitions/[fieldId] updates placeholder and defaultValue", async () => {
    const field = await createFieldDefinition({
      companyId: company.id,
      code: "patch_placeholder",
      label: "Placeholder Test",
      placeholder: "old placeholder",
      defaultValue: "old default",
    });

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${field.id}`,
      {
        method: "PATCH",
        token: adminToken,
        companyId: company.id,
        userId: admin.id,
        body: { placeholder: "new placeholder", defaultValue: "new default" },
      },
    );
    const response = await fieldPATCH(request, {
      params: Promise.resolve({ id: company.id, fieldId: field.id }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.placeholder).toBe("new placeholder");
    expect(data.defaultValue).toBe("new default");
  });

  // -------------------------------------------------------------------------
  // 39. Field definitions - PATCH returns 404 for non-existent
  // -------------------------------------------------------------------------
  test("PATCH /api/companies/[id]/field-definitions/[fieldId] returns 404 for non-existent", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${fakeId}`,
      {
        method: "PATCH",
        token: adminToken,
        companyId: company.id,
        userId: admin.id,
        body: { label: "Ghost" },
      },
    );
    const response = await fieldPATCH(request, {
      params: Promise.resolve({ id: company.id, fieldId: fakeId }),
    });

    expect(response.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 40. Field definitions - PATCH returns 401 without auth
  // -------------------------------------------------------------------------
  test("PATCH /api/companies/[id]/field-definitions/[fieldId] returns 401 without auth", async () => {
    const field = await createFieldDefinition({
      companyId: company.id,
      code: "noauth_patch",
      label: "No Auth Patch",
    });

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${field.id}`,
      { method: "PATCH", body: { label: "Hacked" } },
    );
    const response = await fieldPATCH(request, {
      params: Promise.resolve({ id: company.id, fieldId: field.id }),
    });

    expect(response.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 41. Field definitions - DELETE soft-deletes
  // -------------------------------------------------------------------------
  test("DELETE /api/companies/[id]/field-definitions/[fieldId] soft-deletes field", async () => {
    const field = await createFieldDefinition({
      companyId: company.id,
      code: "soft_delete",
      label: "To Soft Delete",
    });

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${field.id}`,
      { method: "DELETE", token: adminToken, companyId: company.id, userId: admin.id },
    );
    const response = await fieldDELETE(request, {
      params: Promise.resolve({ id: company.id, fieldId: field.id }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.active).toBe(false);

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(companyFieldDefinitions)
      .where(eq(companyFieldDefinitions.id, field.id));
    expect(dbRecord.active).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 42. Field definitions - DELETE returns 404 for non-existent
  // -------------------------------------------------------------------------
  test("DELETE /api/companies/[id]/field-definitions/[fieldId] returns 404 for non-existent", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${fakeId}`,
      { method: "DELETE", token: adminToken, companyId: company.id, userId: admin.id },
    );
    const response = await fieldDELETE(request, {
      params: Promise.resolve({ id: company.id, fieldId: fakeId }),
    });

    expect(response.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 43. Field definitions - DELETE returns 404 cross-company
  // -------------------------------------------------------------------------
  test("DELETE /api/companies/[id]/field-definitions/[fieldId] 404 cross-company", async () => {
    const field = await createFieldDefinition({
      companyId: company.id,
      code: "cross_delete",
      label: "Cross Delete",
    });

    const request = await createTestRequest(
      `/api/companies/${company2.id}/field-definitions/${field.id}`,
      { method: "DELETE", token: adminToken, companyId: company2.id, userId: admin.id },
    );
    const response = await fieldDELETE(request, {
      params: Promise.resolve({ id: company2.id, fieldId: field.id }),
    });

    expect(response.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 44. Field definitions - DELETE returns 401 without auth
  // -------------------------------------------------------------------------
  test("DELETE /api/companies/[id]/field-definitions/[fieldId] returns 401 without auth", async () => {
    const field = await createFieldDefinition({
      companyId: company.id,
      code: "noauth_delete",
      label: "No Auth Delete",
    });

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${field.id}`,
      { method: "DELETE" },
    );
    const response = await fieldDELETE(request, {
      params: Promise.resolve({ id: company.id, fieldId: field.id }),
    });

    expect(response.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 45. Company profiles - GET returns default when none configured
  // -------------------------------------------------------------------------
  test("GET /api/company-profiles returns default when none configured", async () => {
    const freshCo = await createCompany();
    const request = await createTestRequest("/api/company-profiles", {
      token: adminToken,
      companyId: freshCo.id,
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
    expect(body.data.defaults.enableOrderValue).toBe(false);
    expect(body.data.defaults.enableUnits).toBe(false);
    expect(body.data.defaults.enableOrderType).toBe(false);
    expect(body.data.defaults.activeDimensions).toEqual(["WEIGHT", "VOLUME"]);
    expect(body.data.templates).toBeDefined();
    expect(Array.isArray(body.data.templates)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 46. Company profiles - GET returns configured profile
  // -------------------------------------------------------------------------
  test("GET /api/company-profiles returns configured profile", async () => {
    const profileCo = await createCompany();
    await createCompanyProfile({
      companyId: profileCo.id,
      enableWeight: true,
      enableVolume: false,
      enableOrderValue: true,
    });

    const request = await createTestRequest("/api/company-profiles", {
      token: adminToken,
      companyId: profileCo.id,
      userId: admin.id,
    });
    const response = await profileGET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.isDefault).toBe(false);
    expect(body.data.profile).not.toBeNull();
    expect(body.data.profile.enableWeight).toBe(true);
    expect(body.data.profile.enableVolume).toBe(false);
    expect(body.data.profile.enableOrderValue).toBe(true);
    expect(body.data.profile.companyId).toBe(profileCo.id);
    expect(body.data.profile.activeDimensions).toBeDefined();
    expect(body.data.profile.priorityMapping).toBeDefined();
    expect(body.data.validation).toBeDefined();
    expect(body.data.templates).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 47. Company profiles - GET 401 without companyId header
  // -------------------------------------------------------------------------
  test("GET /api/company-profiles returns 400 without companyId header (ADMIN_SISTEMA)", async () => {
    const request = await createTestRequest("/api/company-profiles", {
      token: adminToken,
      userId: admin.id,
    });
    const response = await profileGET(request);

    expect(response.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // 48. Company profiles - POST creates new profile (201)
  // -------------------------------------------------------------------------
  test("POST /api/company-profiles creates new profile (201)", async () => {
    const newCo = await createCompany();
    const request = await createTestRequest("/api/company-profiles", {
      method: "POST",
      token: adminToken,
      companyId: newCo.id,
      userId: admin.id,
      body: {
        enableWeight: true,
        enableVolume: true,
        enableOrderValue: false,
        enableUnits: false,
        enableOrderType: false,
        priorityNew: 50,
        priorityRescheduled: 80,
        priorityUrgent: 100,
      },
    });
    const response = await profilePOST(request);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.profile).toBeDefined();
    expect(body.data.profile.enableWeight).toBe(true);
    expect(body.data.profile.enableVolume).toBe(true);
    expect(body.data.profile.enableOrderValue).toBe(false);
    expect(body.data.profile.companyId).toBe(newCo.id);
    expect(body.data.message).toContain("creado");
  });

  // -------------------------------------------------------------------------
  // 49. Company profiles - POST updates existing profile (200)
  // -------------------------------------------------------------------------
  test("POST /api/company-profiles updates existing profile (200)", async () => {
    const updateCo = await createCompany();
    // First create
    const createReq = await createTestRequest("/api/company-profiles", {
      method: "POST",
      token: adminToken,
      companyId: updateCo.id,
      userId: admin.id,
      body: {
        enableWeight: true,
        enableVolume: true,
        enableOrderValue: false,
        enableUnits: false,
        enableOrderType: false,
        priorityNew: 50,
        priorityRescheduled: 80,
        priorityUrgent: 100,
      },
    });
    const createRes = await profilePOST(createReq);
    expect(createRes.status).toBe(201);

    // Then update
    const updateReq = await createTestRequest("/api/company-profiles", {
      method: "POST",
      token: adminToken,
      companyId: updateCo.id,
      userId: admin.id,
      body: {
        enableWeight: false,
        enableVolume: true,
        enableOrderValue: true,
        enableUnits: true,
        enableOrderType: false,
        priorityNew: 30,
        priorityRescheduled: 60,
        priorityUrgent: 90,
      },
    });
    const updateRes = await profilePOST(updateReq);

    expect(updateRes.status).toBe(200);
    const body = await updateRes.json();
    expect(body.data.profile.enableWeight).toBe(false);
    expect(body.data.profile.enableOrderValue).toBe(true);
    expect(body.data.profile.enableUnits).toBe(true);
    expect(body.data.message).toContain("actualizado");
  });

  // -------------------------------------------------------------------------
  // 50. Company profiles - POST returns 400 for invalid data
  // -------------------------------------------------------------------------
  test("POST /api/company-profiles returns 400 for invalid priority range", async () => {
    const badCo = await createCompany();
    const request = await createTestRequest("/api/company-profiles", {
      method: "POST",
      token: adminToken,
      companyId: badCo.id,
      userId: admin.id,
      body: {
        enableWeight: true,
        enableVolume: true,
        priorityNew: 200, // out of 0-100 range
        priorityRescheduled: 80,
        priorityUrgent: 100,
      },
    });
    const response = await profilePOST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 51. Company profiles - POST returns 401 without companyId
  // -------------------------------------------------------------------------
  test("POST /api/company-profiles returns 400 without companyId (ADMIN_SISTEMA)", async () => {
    const request = await createTestRequest("/api/company-profiles", {
      method: "POST",
      token: adminToken,
      userId: admin.id,
      body: {
        enableWeight: true,
        enableVolume: true,
      },
    });
    const response = await profilePOST(request);

    expect(response.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // 52. Company profiles - DELETE resets to defaults
  // -------------------------------------------------------------------------
  test("DELETE /api/company-profiles resets profile to defaults", async () => {
    const resetCo = await createCompany();
    await createCompanyProfile({ companyId: resetCo.id });

    const request = await createTestRequest("/api/company-profiles", {
      method: "DELETE",
      token: adminToken,
      companyId: resetCo.id,
      userId: admin.id,
    });
    const response = await profileDELETE(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.message).toContain("restablecido");

    // Verify: GET should now return default
    const getReq = await createTestRequest("/api/company-profiles", {
      token: adminToken,
      companyId: resetCo.id,
      userId: admin.id,
    });
    const getRes = await profileGET(getReq);
    const getBody = await getRes.json();
    expect(getBody.data.isDefault).toBe(true);
    expect(getBody.data.profile).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 53. Company profiles - DELETE returns 401 without companyId
  // -------------------------------------------------------------------------
  test("DELETE /api/company-profiles returns 400 without companyId (ADMIN_SISTEMA)", async () => {
    const request = await createTestRequest("/api/company-profiles", {
      method: "DELETE",
      token: adminToken,
      userId: admin.id,
    });
    const response = await profileDELETE(request);

    expect(response.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // 54. Role-based access - PLANIFICADOR cannot access company detail routes
  // -------------------------------------------------------------------------
  test("PLANIFICADOR cannot access company detail routes (403)", async () => {
    // GET company
    const getReq = await createTestRequest(`/api/companies/${company.id}`, {
      token: plannerToken,
      companyId: company.id,
      userId: planner.id,
    });
    const getRes = await companyGET(getReq, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(getRes.status).toBe(403);

    // PATCH company
    const patchReq = await createTestRequest(`/api/companies/${company.id}`, {
      method: "PATCH",
      token: plannerToken,
      companyId: company.id,
      userId: planner.id,
      body: { commercialName: "Hacked" },
    });
    const patchRes = await companyPATCH(patchReq, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(patchRes.status).toBe(403);

    // DELETE company
    const delReq = await createTestRequest(`/api/companies/${company.id}`, {
      method: "DELETE",
      token: plannerToken,
      companyId: company.id,
      userId: planner.id,
    });
    const delRes = await companyDELETE(delReq, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(delRes.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 55. Role-based access - PLANIFICADOR cannot access field definition routes
  // -------------------------------------------------------------------------
  test("PLANIFICADOR cannot access field definition routes (403)", async () => {
    // GET list
    const listReq = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { token: plannerToken, companyId: company.id, userId: planner.id },
    );
    const listRes = await fieldListGET(listReq, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(listRes.status).toBe(403);

    // POST field
    const postReq = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      {
        method: "POST",
        token: plannerToken,
        companyId: company.id,
        userId: planner.id,
        body: { code: "blocked", label: "Blocked", entity: "orders" },
      },
    );
    const postRes = await fieldPOST(postReq, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(postRes.status).toBe(403);
  });
});
