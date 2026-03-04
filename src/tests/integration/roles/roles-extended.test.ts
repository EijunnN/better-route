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
  createRole,
  createPermission,
  createRolePermission,
  createCsvMappingTemplate,
} from "../setup/test-data";
import { csvColumnMappingTemplates } from "@/db/schema";

// Route handlers — Batch permissions
import { GET as BATCH_PERMS_GET } from "@/app/api/roles/batch/permissions/route";

// Route handlers — Role detail (for 404 / edge-case tests not in role-permissions.test.ts)
import {
  GET as GET_ROLE,
  PATCH as PATCH_ROLE,
  DELETE as DELETE_ROLE,
} from "@/app/api/roles/[id]/route";

// Route handlers — CSV column mapping templates
import {
  GET as LIST_TEMPLATES,
  POST as CREATE_TEMPLATE,
} from "@/app/api/csv-column-mapping-templates/route";
import {
  GET as GET_TEMPLATE,
  PATCH as PATCH_TEMPLATE,
  DELETE as DELETE_TEMPLATE,
} from "@/app/api/csv-column-mapping-templates/[id]/route";

// =============================================================================
// Helpers
// =============================================================================
const FAKE_UUID = "00000000-0000-0000-0000-000000000099";

describe("Roles Extended & CSV Templates", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let company2: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let token: string;
  let authHeaders: Record<string, string>;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    company2 = await createCompany();

    admin = await createAdmin(company.id);
    token = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: admin.role,
    });
    authHeaders = {
      "x-user-email": admin.email,
      "x-user-role": admin.role,
    };
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ===========================================================================
  // Batch Permissions — GET /api/roles/batch/permissions
  // ===========================================================================

  test("batch perms: returns grouped permissions for multiple roles", async () => {
    const roleA = await createRole({ companyId: company.id, name: `BatchA ${Date.now()}` });
    const roleB = await createRole({ companyId: company.id, name: `BatchB ${Date.now()}` });
    const perm1 = await createPermission({
      entity: "orders",
      action: "VIEW",
      name: `BP1 ${Date.now()}`,
      category: "ORDERS",
      displayOrder: 1,
    });
    const perm2 = await createPermission({
      entity: "vehicles",
      action: "EDIT",
      name: `BP2 ${Date.now()}`,
      category: "VEHICLES",
      displayOrder: 1,
    });
    await createRolePermission({ roleId: roleA.id, permissionId: perm1.id, enabled: true });
    await createRolePermission({ roleId: roleA.id, permissionId: perm2.id, enabled: false });
    await createRolePermission({ roleId: roleB.id, permissionId: perm1.id, enabled: false });
    await createRolePermission({ roleId: roleB.id, permissionId: perm2.id, enabled: true });

    const request = await createTestRequest("/api/roles/batch/permissions", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      searchParams: { roleIds: `${roleA.id},${roleB.id}` },
    });

    const response = await BATCH_PERMS_GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data[roleA.id]).toBeDefined();
    expect(body.data[roleB.id]).toBeDefined();

    // Flatten all permissions for roleA and find specific ones
    const roleAPerms = Object.values(body.data[roleA.id]).flat() as Array<{
      id: string;
      enabled: boolean;
    }>;
    const roleAp1 = roleAPerms.find((p) => p.id === perm1.id);
    const roleAp2 = roleAPerms.find((p) => p.id === perm2.id);
    expect(roleAp1?.enabled).toBe(true);
    expect(roleAp2?.enabled).toBe(false);

    // Flatten all permissions for roleB
    const roleBPerms = Object.values(body.data[roleB.id]).flat() as Array<{
      id: string;
      enabled: boolean;
    }>;
    const roleBp1 = roleBPerms.find((p) => p.id === perm1.id);
    const roleBp2 = roleBPerms.find((p) => p.id === perm2.id);
    expect(roleBp1?.enabled).toBe(false);
    expect(roleBp2?.enabled).toBe(true);
  });

  test("batch perms: returns permissions grouped by category with all fields", async () => {
    const role = await createRole({ companyId: company.id, name: `CatRole ${Date.now()}` });
    const perm = await createPermission({
      entity: "orders",
      action: "VIEW",
      name: `CatP ${Date.now()}`,
      category: "ORDERS",
      displayOrder: 1,
    });
    await createRolePermission({ roleId: role.id, permissionId: perm.id, enabled: true });

    const request = await createTestRequest("/api/roles/batch/permissions", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      searchParams: { roleIds: role.id },
    });

    const response = await BATCH_PERMS_GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    const roleData = body.data[role.id];
    expect(roleData).toBeDefined();
    expect(roleData["ORDERS"]).toBeDefined();

    // Each entry should have expected fields
    const ordersPerms = roleData["ORDERS"] as Array<{
      id: string;
      entity: string;
      action: string;
      name: string;
      enabled: boolean;
    }>;
    expect(ordersPerms.length).toBeGreaterThanOrEqual(1);
    const found = ordersPerms.find((p) => p.id === perm.id);
    expect(found).toBeDefined();
    expect(found!.entity).toBe("orders");
    expect(found!.action).toBe("VIEW");
    expect(found!.enabled).toBe(true);
  });

  test("batch perms: returns 400 when roleIds param is missing", async () => {
    const request = await createTestRequest("/api/roles/batch/permissions", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
    });

    const response = await BATCH_PERMS_GET(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("roleIds");
  });

  test("batch perms: returns empty data for empty roleIds after split", async () => {
    const request = await createTestRequest("/api/roles/batch/permissions", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      searchParams: { roleIds: ",,," },
    });

    const response = await BATCH_PERMS_GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toEqual({});
  });

  test("batch perms: filters out roles from other companies", async () => {
    const roleA = await createRole({ companyId: company.id, name: `IsoA ${Date.now()}` });
    const otherRole = await createRole({
      companyId: company2.id,
      name: `IsoOther ${Date.now()}`,
    });

    const request = await createTestRequest("/api/roles/batch/permissions", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      searchParams: { roleIds: `${roleA.id},${otherRole.id}` },
    });

    const response = await BATCH_PERMS_GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data[roleA.id]).toBeDefined();
    expect(body.data[otherRole.id]).toBeUndefined();
  });

  test("batch perms: returns empty data for non-existent role IDs", async () => {
    const request = await createTestRequest("/api/roles/batch/permissions", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      searchParams: { roleIds: FAKE_UUID },
    });

    const response = await BATCH_PERMS_GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toEqual({});
  });

  test("batch perms: handles single role ID", async () => {
    const role = await createRole({ companyId: company.id, name: `Single ${Date.now()}` });

    const request = await createTestRequest("/api/roles/batch/permissions", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      searchParams: { roleIds: role.id },
    });

    const response = await BATCH_PERMS_GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Object.keys(body.data)).toHaveLength(1);
    expect(body.data[role.id]).toBeDefined();
  });

  // ===========================================================================
  // Roles [id] — 404 and edge-case tests (not in role-permissions.test.ts)
  // ===========================================================================

  test("role detail: GET returns 404 for non-existent role", async () => {
    const request = await createTestRequest(`/api/roles/${FAKE_UUID}`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
    });

    const response = await GET_ROLE(request, {
      params: Promise.resolve({ id: FAKE_UUID }),
    });
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test("role detail: PATCH returns 404 for non-existent role", async () => {
    const request = await createTestRequest(`/api/roles/${FAKE_UUID}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      body: { name: "Ghost Role" },
    });

    const response = await PATCH_ROLE(request, {
      params: Promise.resolve({ id: FAKE_UUID }),
    });
    expect(response.status).toBe(404);
  });

  test("role detail: DELETE returns 404 for non-existent role", async () => {
    const request = await createTestRequest(`/api/roles/${FAKE_UUID}`, {
      method: "DELETE",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
    });

    const response = await DELETE_ROLE(request, {
      params: Promise.resolve({ id: FAKE_UUID }),
    });
    expect(response.status).toBe(404);
  });

  test("role detail: DELETE system role returns 403", async () => {
    const systemRole = await createRole({
      companyId: company.id,
      name: `SysUndel ${Date.now()}`,
      isSystem: true,
    });

    const request = await createTestRequest(`/api/roles/${systemRole.id}`, {
      method: "DELETE",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
    });

    const response = await DELETE_ROLE(request, {
      params: Promise.resolve({ id: systemRole.id }),
    });
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error).toContain("sistema no pueden ser eliminados");
  });

  test("role detail: PATCH rejects duplicate name (400)", async () => {
    const ts = Date.now();
    await createRole({
      companyId: company.id,
      name: `ExistDup ${ts}`,
      active: true,
    });
    const roleToUpdate = await createRole({
      companyId: company.id,
      name: `Original ${ts}`,
    });

    const request = await createTestRequest(`/api/roles/${roleToUpdate.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      body: { name: `ExistDup ${ts}` },
    });

    const response = await PATCH_ROLE(request, {
      params: Promise.resolve({ id: roleToUpdate.id }),
    });
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("Ya existe un rol con este nombre");
  });

  test("role detail: PATCH allows updating to same name (no collision)", async () => {
    const role = await createRole({
      companyId: company.id,
      name: `KeepSame ${Date.now()}`,
    });

    const request = await createTestRequest(`/api/roles/${role.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      body: { name: role.name, description: "Added description" },
    });

    const response = await PATCH_ROLE(request, {
      params: Promise.resolve({ id: role.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.description).toBe("Added description");
  });

  test("role detail: GET for role from another company returns 404", async () => {
    const otherRole = await createRole({
      companyId: company2.id,
      name: `OtherCo ${Date.now()}`,
    });

    const request = await createTestRequest(`/api/roles/${otherRole.id}`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
    });

    const response = await GET_ROLE(request, {
      params: Promise.resolve({ id: otherRole.id }),
    });
    expect(response.status).toBe(404);
  });

  // ===========================================================================
  // CSV Column Mapping Templates — Full CRUD
  // ===========================================================================

  test("csv template: GET single template returns full data", async () => {
    const template = await createCsvMappingTemplate({
      companyId: company.id,
      name: `Detail ${Date.now()}`,
      description: "Some description",
      columnMapping: {
        "ID Seguimiento": "trackingId",
        "Direccion": "address",
        "Lat": "latitude",
      },
      requiredFields: ["trackingId", "address"],
    });

    const request = await createTestRequest(
      `/api/csv-column-mapping-templates/${template.id}`,
      {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      },
    );

    const response = await GET_TEMPLATE(request, {
      params: Promise.resolve({ id: template.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.id).toBe(template.id);
    expect(body.name).toBe(template.name);
    expect(body.description).toBe("Some description");
    expect(body.companyId).toBe(company.id);
    expect(body.columnMapping).toBeDefined();
    expect(body.columnMapping["ID Seguimiento"]).toBe("trackingId");
    expect(body.requiredFields).toBeDefined();
    expect(body.requiredFields).toContain("trackingId");
    expect(body.active).toBe(true);
  });

  test("csv template: GET returns 404 for non-existent ID", async () => {
    const request = await createTestRequest(
      `/api/csv-column-mapping-templates/${FAKE_UUID}`,
      {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      },
    );

    const response = await GET_TEMPLATE(request, {
      params: Promise.resolve({ id: FAKE_UUID }),
    });
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toContain("not found");
  });

  test("csv template: GET from another company returns 404 (tenant isolation)", async () => {
    const otherTemplate = await createCsvMappingTemplate({
      companyId: company2.id,
      name: `OtherCoTpl ${Date.now()}`,
    });

    const request = await createTestRequest(
      `/api/csv-column-mapping-templates/${otherTemplate.id}`,
      {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      },
    );

    const response = await GET_TEMPLATE(request, {
      params: Promise.resolve({ id: otherTemplate.id }),
    });
    expect(response.status).toBe(404);
  });

  test("csv template: PATCH updates name and description", async () => {
    const template = await createCsvMappingTemplate({
      companyId: company.id,
      name: `OldName ${Date.now()}`,
      description: "Old description",
    });

    const newName = `UpdatedName ${Date.now()}`;
    const request = await createTestRequest(
      `/api/csv-column-mapping-templates/${template.id}`,
      {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          name: newName,
          description: "Updated description",
        },
      },
    );

    const response = await PATCH_TEMPLATE(request, {
      params: Promise.resolve({ id: template.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.name).toBe(newName);
    expect(body.description).toBe("Updated description");
    expect(body.id).toBe(template.id);
  });

  test("csv template: PATCH updates columnMapping", async () => {
    const template = await createCsvMappingTemplate({
      companyId: company.id,
      name: `MapUp ${Date.now()}`,
      columnMapping: { "Col A": "trackingId" },
    });

    const newMapping = {
      "Col A": "trackingId",
      "Col B": "address",
      "Col C": "latitude",
    };

    const request = await createTestRequest(
      `/api/csv-column-mapping-templates/${template.id}`,
      {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { columnMapping: newMapping },
      },
    );

    const response = await PATCH_TEMPLATE(request, {
      params: Promise.resolve({ id: template.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.columnMapping).toBeDefined();
    expect(body.columnMapping["Col B"]).toBe("address");
    expect(body.columnMapping["Col C"]).toBe("latitude");
  });

  test("csv template: PATCH updates requiredFields", async () => {
    const template = await createCsvMappingTemplate({
      companyId: company.id,
      name: `ReqF ${Date.now()}`,
      requiredFields: ["trackingId"],
    });

    const request = await createTestRequest(
      `/api/csv-column-mapping-templates/${template.id}`,
      {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { requiredFields: ["trackingId", "address", "customerName"] },
      },
    );

    const response = await PATCH_TEMPLATE(request, {
      params: Promise.resolve({ id: template.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.requiredFields).toContain("trackingId");
    expect(body.requiredFields).toContain("address");
    expect(body.requiredFields).toContain("customerName");
  });

  test("csv template: PATCH returns 404 for non-existent ID", async () => {
    const request = await createTestRequest(
      `/api/csv-column-mapping-templates/${FAKE_UUID}`,
      {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { name: "Ghost Template" },
      },
    );

    const response = await PATCH_TEMPLATE(request, {
      params: Promise.resolve({ id: FAKE_UUID }),
    });
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toContain("not found");
  });

  test("csv template: PATCH rejects duplicate name (409)", async () => {
    const ts = Date.now();
    await createCsvMappingTemplate({
      companyId: company.id,
      name: `Taken ${ts}`,
    });
    const toUpdate = await createCsvMappingTemplate({
      companyId: company.id,
      name: `Mine ${ts}`,
    });

    const request = await createTestRequest(
      `/api/csv-column-mapping-templates/${toUpdate.id}`,
      {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { name: `Taken ${ts}` },
      },
    );

    const response = await PATCH_TEMPLATE(request, {
      params: Promise.resolve({ id: toUpdate.id }),
    });
    expect(response.status).toBe(409);

    const body = await response.json();
    expect(body.error).toContain("already exists");
  });

  test("csv template: PATCH allows keeping same name (no collision)", async () => {
    const template = await createCsvMappingTemplate({
      companyId: company.id,
      name: `SameName ${Date.now()}`,
    });

    const request = await createTestRequest(
      `/api/csv-column-mapping-templates/${template.id}`,
      {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { name: template.name, description: "Added desc" },
      },
    );

    const response = await PATCH_TEMPLATE(request, {
      params: Promise.resolve({ id: template.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.description).toBe("Added desc");
  });

  test("csv template: PATCH from another company returns 404 (tenant isolation)", async () => {
    const otherTemplate = await createCsvMappingTemplate({
      companyId: company2.id,
      name: `OtherPatch ${Date.now()}`,
    });

    const request = await createTestRequest(
      `/api/csv-column-mapping-templates/${otherTemplate.id}`,
      {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { name: "Hijacked Name" },
      },
    );

    const response = await PATCH_TEMPLATE(request, {
      params: Promise.resolve({ id: otherTemplate.id }),
    });
    expect(response.status).toBe(404);
  });

  test("csv template: PATCH can set active to false", async () => {
    const template = await createCsvMappingTemplate({
      companyId: company.id,
      name: `DeactPatch ${Date.now()}`,
      active: true,
    });

    const request = await createTestRequest(
      `/api/csv-column-mapping-templates/${template.id}`,
      {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { active: false },
      },
    );

    const response = await PATCH_TEMPLATE(request, {
      params: Promise.resolve({ id: template.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.active).toBe(false);
  });

  test("csv template: DELETE soft-deletes (sets active=false)", async () => {
    const template = await createCsvMappingTemplate({
      companyId: company.id,
      name: `ToDel ${Date.now()}`,
      active: true,
    });

    const request = await createTestRequest(
      `/api/csv-column-mapping-templates/${template.id}`,
      {
        method: "DELETE",
        token,
        companyId: company.id,
        userId: admin.id,
      },
    );

    const response = await DELETE_TEMPLATE(request, {
      params: Promise.resolve({ id: template.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(csvColumnMappingTemplates)
      .where(eq(csvColumnMappingTemplates.id, template.id));
    expect(dbRecord).toBeDefined();
    expect(dbRecord.active).toBe(false);
  });

  test("csv template: DELETE returns 404 for non-existent ID", async () => {
    const request = await createTestRequest(
      `/api/csv-column-mapping-templates/${FAKE_UUID}`,
      {
        method: "DELETE",
        token,
        companyId: company.id,
        userId: admin.id,
      },
    );

    const response = await DELETE_TEMPLATE(request, {
      params: Promise.resolve({ id: FAKE_UUID }),
    });
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toContain("not found");
  });

  test("csv template: DELETE from another company returns 404 (tenant isolation)", async () => {
    const otherTemplate = await createCsvMappingTemplate({
      companyId: company2.id,
      name: `OtherDel ${Date.now()}`,
    });

    const request = await createTestRequest(
      `/api/csv-column-mapping-templates/${otherTemplate.id}`,
      {
        method: "DELETE",
        token,
        companyId: company.id,
        userId: admin.id,
      },
    );

    const response = await DELETE_TEMPLATE(request, {
      params: Promise.resolve({ id: otherTemplate.id }),
    });
    expect(response.status).toBe(404);
  });

  test("csv template: deleted template no longer appears in list", async () => {
    const template = await createCsvMappingTemplate({
      companyId: company.id,
      name: `Disappear ${Date.now()}`,
      active: true,
    });

    // Delete it
    const deleteReq = await createTestRequest(
      `/api/csv-column-mapping-templates/${template.id}`,
      {
        method: "DELETE",
        token,
        companyId: company.id,
        userId: admin.id,
      },
    );
    const deleteRes = await DELETE_TEMPLATE(deleteReq, {
      params: Promise.resolve({ id: template.id }),
    });
    expect(deleteRes.status).toBe(200);

    // List should not include it (list only returns active=true)
    const listReq = await createTestRequest(
      "/api/csv-column-mapping-templates",
      {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      },
    );
    const listRes = await LIST_TEMPLATES(listReq);
    expect(listRes.status).toBe(200);

    const listBody = await listRes.json();
    const found = (listBody as Array<{ id: string }>).find(
      (t) => t.id === template.id,
    );
    expect(found).toBeUndefined();
  });

  test("csv template: POST returns 400 for missing required fields", async () => {
    const request = await createTestRequest(
      "/api/csv-column-mapping-templates",
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          description: "Orphan description",
        },
      },
    );

    const response = await CREATE_TEMPLATE(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("Validation failed");
  });

  test("csv template: POST returns 400 for empty name", async () => {
    const request = await createTestRequest(
      "/api/csv-column-mapping-templates",
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          name: "",
          columnMapping: { Col: "trackingId" },
          requiredFields: ["trackingId"],
        },
      },
    );

    const response = await CREATE_TEMPLATE(request);
    expect(response.status).toBe(400);
  });

  test("csv template: POST returns 400 for invalid system field in mapping", async () => {
    const request = await createTestRequest(
      "/api/csv-column-mapping-templates",
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          name: `InvalidF ${Date.now()}`,
          columnMapping: { Col: "nonExistentField" },
          requiredFields: ["trackingId"],
        },
      },
    );

    const response = await CREATE_TEMPLATE(request);
    expect(response.status).toBe(400);
  });

  test("csv template: full CRUD lifecycle", async () => {
    const ts = Date.now();

    // CREATE
    const createReq = await createTestRequest(
      "/api/csv-column-mapping-templates",
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          name: `Lifecycle ${ts}`,
          description: "Created for lifecycle test",
          columnMapping: {
            "Tracking": "trackingId",
            "Address": "address",
          },
          requiredFields: ["trackingId", "address"],
        },
      },
    );
    const createRes = await CREATE_TEMPLATE(createReq);
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const templateId = created.id;
    expect(templateId).toBeDefined();

    // READ
    const readReq = await createTestRequest(
      `/api/csv-column-mapping-templates/${templateId}`,
      {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      },
    );
    const readRes = await GET_TEMPLATE(readReq, {
      params: Promise.resolve({ id: templateId }),
    });
    expect(readRes.status).toBe(200);
    const read = await readRes.json();
    expect(read.name).toBe(`Lifecycle ${ts}`);

    // UPDATE
    const updateReq = await createTestRequest(
      `/api/csv-column-mapping-templates/${templateId}`,
      {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          name: `Lifecycle v2 ${ts}`,
          columnMapping: {
            "Tracking": "trackingId",
            "Address": "address",
            "Customer": "customerName",
          },
        },
      },
    );
    const updateRes = await PATCH_TEMPLATE(updateReq, {
      params: Promise.resolve({ id: templateId }),
    });
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.name).toBe(`Lifecycle v2 ${ts}`);
    expect(updated.columnMapping["Customer"]).toBe("customerName");

    // DELETE
    const deleteReq = await createTestRequest(
      `/api/csv-column-mapping-templates/${templateId}`,
      {
        method: "DELETE",
        token,
        companyId: company.id,
        userId: admin.id,
      },
    );
    const deleteRes = await DELETE_TEMPLATE(deleteReq, {
      params: Promise.resolve({ id: templateId }),
    });
    expect(deleteRes.status).toBe(200);
    expect((await deleteRes.json()).success).toBe(true);

    // VERIFY soft-deleted
    const [dbRecord] = await testDb
      .select()
      .from(csvColumnMappingTemplates)
      .where(eq(csvColumnMappingTemplates.id, templateId));
    expect(dbRecord.active).toBe(false);
  });
});
