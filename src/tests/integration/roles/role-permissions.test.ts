import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { and, eq } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createUser,
  createRole,
  createPermission,
  createRolePermission,
  createUserRole,
} from "../setup/test-data";
import { roles, rolePermissions, userRoles } from "@/db/schema";

// Route handlers
import { GET as LIST_ROLES, POST as CREATE_ROLE } from "@/app/api/roles/route";
import {
  GET as GET_ROLE,
  PATCH as PATCH_ROLE,
  DELETE as DELETE_ROLE,
} from "@/app/api/roles/[id]/route";
import {
  GET as GET_ROLE_PERMS,
  PUT as PUT_ROLE_PERMS,
  PATCH as PATCH_ROLE_PERM,
} from "@/app/api/roles/[id]/permissions/route";
import { GET as LIST_PERMISSIONS } from "@/app/api/permissions/route";
import {
  GET as GET_USER_ROLES,
  POST as ASSIGN_USER_ROLE,
  DELETE as REMOVE_USER_ROLE,
} from "@/app/api/users/[id]/roles/route";

describe("Role & Permission Management", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let token: string;
  /** Extra headers needed for routes that use setupAuthContext + requireTenantContext */
  let authHeaders: Record<string, string>;

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
    authHeaders = {
      "x-user-email": admin.email,
      "x-user-role": admin.role,
    };
  });

  beforeEach(async () => {
    // Clean role-related tables between tests
    await testDb.delete(userRoles);
    await testDb.delete(rolePermissions);
    await testDb.delete(roles).where(eq(roles.companyId, company.id));
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ---------------------------------------------------------------------------
  // POST /api/roles
  // ---------------------------------------------------------------------------

  test("POST /api/roles creates a custom role (201)", async () => {
    const body = {
      name: "Supervisor de Campo",
      description: "Supervisa las operaciones en campo",
      code: "SUPERVISOR_CAMPO",
    };

    const request = await createTestRequest("/api/roles", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      body,
    });

    const response = await CREATE_ROLE(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.name).toBe("Supervisor de Campo");
    expect(data.description).toBe("Supervisa las operaciones en campo");
    expect(data.code).toBe("SUPERVISOR_CAMPO");
    expect(data.isSystem).toBe(false);
    expect(data.companyId).toBe(company.id);
    expect(data.active).toBe(true);
    expect(data.id).toBeDefined();

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(roles)
      .where(eq(roles.id, data.id));
    expect(dbRecord).toBeDefined();
    expect(dbRecord.name).toBe("Supervisor de Campo");
  });

  test("POST /api/roles rejects duplicate name (400)", async () => {
    await createRole({
      companyId: company.id,
      name: "Coordinador",
      active: true,
    });

    const request = await createTestRequest("/api/roles", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      body: { name: "Coordinador" },
    });

    const response = await CREATE_ROLE(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("Ya existe un rol con este nombre");
  });

  // ---------------------------------------------------------------------------
  // GET /api/roles
  // ---------------------------------------------------------------------------

  test("GET /api/roles lists roles with filters", async () => {
    await createRole({
      companyId: company.id,
      name: "Active Custom",
      active: true,
      isSystem: false,
    });
    await createRole({
      companyId: company.id,
      name: "System Role",
      active: true,
      isSystem: true,
    });
    await createRole({
      companyId: company.id,
      name: "Inactive Role",
      active: false,
      isSystem: false,
    });

    // Filter by isSystem=true
    const reqSystem = await createTestRequest("/api/roles", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      searchParams: { isSystem: "true" },
    });

    const resSystem = await LIST_ROLES(reqSystem);
    expect(resSystem.status).toBe(200);
    const systemData = await resSystem.json();
    expect(
      systemData.data.every((r: { isSystem: boolean }) => r.isSystem === true),
    ).toBe(true);
    expect(systemData.data.length).toBeGreaterThanOrEqual(1);

    // Filter by active=true
    const reqActive = await createTestRequest("/api/roles", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      searchParams: { active: "true" },
    });

    const resActive = await LIST_ROLES(reqActive);
    expect(resActive.status).toBe(200);
    const activeData = await resActive.json();
    expect(
      activeData.data.every((r: { active: boolean }) => r.active === true),
    ).toBe(true);

    // Search by name
    const reqSearch = await createTestRequest("/api/roles", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      searchParams: { search: "Active Custom" },
    });

    const resSearch = await LIST_ROLES(reqSearch);
    expect(resSearch.status).toBe(200);
    const searchData = await resSearch.json();
    expect(searchData.data.length).toBe(1);
    expect(searchData.data[0].name).toBe("Active Custom");
  });

  test("GET /api/roles returns enabledPermissionsCount per role", async () => {
    const role = await createRole({ companyId: company.id, name: "Counted Role" });
    const perm1 = await createPermission({ entity: "orders", action: "VIEW", category: "ORDERS" });
    const perm2 = await createPermission({ entity: "orders", action: "CREATE", category: "ORDERS" });
    await createRolePermission({ roleId: role.id, permissionId: perm1.id, enabled: true });
    await createRolePermission({ roleId: role.id, permissionId: perm2.id, enabled: false });

    const request = await createTestRequest("/api/roles", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
    });

    const response = await LIST_ROLES(request);
    expect(response.status).toBe(200);

    const { data } = await response.json();
    const found = data.find((r: { id: string }) => r.id === role.id);
    expect(found).toBeDefined();
    expect(found.enabledPermissionsCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // GET /api/roles/[id]
  // ---------------------------------------------------------------------------

  test("GET /api/roles/:id includes permission count and user count", async () => {
    const role = await createRole({ companyId: company.id, name: "Detail Role" });
    const perm = await createPermission({ entity: "vehicles", action: "VIEW", category: "VEHICLES" });
    await createRolePermission({ roleId: role.id, permissionId: perm.id, enabled: true });

    const user = await createUser({ companyId: company.id });
    await createUserRole({ userId: user.id, roleId: role.id, active: true });

    const request = await createTestRequest(`/api/roles/${role.id}`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
    });

    const response = await GET_ROLE(request, {
      params: Promise.resolve({ id: role.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.id).toBe(role.id);
    expect(data.name).toBe("Detail Role");
    expect(data.permissions).toBeDefined();
    expect(data.permissions.length).toBeGreaterThanOrEqual(1);
    expect(data.usersCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/roles/[id]
  // ---------------------------------------------------------------------------

  test("PATCH /api/roles/:id updates name and description", async () => {
    const role = await createRole({
      companyId: company.id,
      name: "Old Name",
      description: "Old Description",
    });

    const request = await createTestRequest(`/api/roles/${role.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      body: { name: "New Name", description: "New Description" },
    });

    const response = await PATCH_ROLE(request, {
      params: Promise.resolve({ id: role.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.name).toBe("New Name");
    expect(data.description).toBe("New Description");

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(roles)
      .where(eq(roles.id, role.id));
    expect(dbRecord.name).toBe("New Name");
  });

  test("PATCH system role returns 403", async () => {
    const systemRole = await createRole({
      companyId: company.id,
      name: "System Admin Role",
      isSystem: true,
    });

    const request = await createTestRequest(`/api/roles/${systemRole.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      body: { name: "Hacked Name" },
    });

    const response = await PATCH_ROLE(request, {
      params: Promise.resolve({ id: systemRole.id }),
    });
    expect(response.status).toBe(403);

    const data = await response.json();
    expect(data.error).toContain("sistema no pueden ser modificados");
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/roles/[id]
  // ---------------------------------------------------------------------------

  test("DELETE /api/roles/:id soft deletes a role", async () => {
    const role = await createRole({
      companyId: company.id,
      name: "To Delete",
    });

    const request = await createTestRequest(`/api/roles/${role.id}`, {
      method: "DELETE",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
    });

    const response = await DELETE_ROLE(request, {
      params: Promise.resolve({ id: role.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.active).toBe(false);

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(roles)
      .where(eq(roles.id, role.id));
    expect(dbRecord.active).toBe(false);
  });

  test("DELETE role with assigned users returns 400", async () => {
    const role = await createRole({
      companyId: company.id,
      name: "Assigned Role",
    });
    const user = await createUser({ companyId: company.id });
    await createUserRole({ userId: user.id, roleId: role.id, active: true });

    const request = await createTestRequest(`/api/roles/${role.id}`, {
      method: "DELETE",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
    });

    const response = await DELETE_ROLE(request, {
      params: Promise.resolve({ id: role.id }),
    });
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("asignado a");
  });

  // ---------------------------------------------------------------------------
  // GET /api/permissions
  // ---------------------------------------------------------------------------

  test("GET /api/permissions lists system permission catalog", async () => {
    // Ensure at least one permission exists
    await createPermission({
      entity: "orders",
      action: "VIEW",
      name: "Ver Pedidos",
      category: "ORDERS",
      displayOrder: 1,
    });

    const request = await createTestRequest("/api/permissions", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
    });

    const response = await LIST_PERMISSIONS(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.data).toBeDefined();
    expect(data.data.length).toBeGreaterThanOrEqual(1);
    expect(data.grouped).toBeDefined();
    expect(data.categories).toBeDefined();
    expect(data.categories.length).toBeGreaterThanOrEqual(1);

    // Each permission should have expected fields
    const firstPerm = data.data[0];
    expect(firstPerm.id).toBeDefined();
    expect(firstPerm.entity).toBeDefined();
    expect(firstPerm.action).toBeDefined();
    expect(firstPerm.name).toBeDefined();
    expect(firstPerm.category).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // GET /api/roles/[id]/permissions
  // ---------------------------------------------------------------------------

  test("GET /api/roles/:id/permissions returns grouped by category", async () => {
    const role = await createRole({ companyId: company.id, name: "Perm Group Role" });
    const perm1 = await createPermission({
      entity: "orders",
      action: "VIEW",
      name: "Ver Pedidos",
      category: "ORDERS",
      displayOrder: 1,
    });
    const perm2 = await createPermission({
      entity: "vehicles",
      action: "VIEW",
      name: "Ver Vehiculos",
      category: "VEHICLES",
      displayOrder: 1,
    });
    await createRolePermission({ roleId: role.id, permissionId: perm1.id, enabled: true });
    await createRolePermission({ roleId: role.id, permissionId: perm2.id, enabled: false });

    const request = await createTestRequest(`/api/roles/${role.id}/permissions`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
    });

    const response = await GET_ROLE_PERMS(request, {
      params: Promise.resolve({ id: role.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.roleId).toBe(role.id);
    expect(data.roleName).toBe("Perm Group Role");
    expect(data.isSystem).toBe(false);
    expect(data.permissions).toBeDefined();

    // Permissions should be grouped by category
    const categories = Object.keys(data.permissions);
    expect(categories.length).toBeGreaterThanOrEqual(1);

    // Check that permissions have the correct enabled status
    const allPerms = Object.values(data.permissions).flat() as Array<{
      id: string;
      enabled: boolean;
    }>;
    const foundPerm1 = allPerms.find((p) => p.id === perm1.id);
    const foundPerm2 = allPerms.find((p) => p.id === perm2.id);
    expect(foundPerm1?.enabled).toBe(true);
    expect(foundPerm2?.enabled).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // PUT /api/roles/[id]/permissions
  // ---------------------------------------------------------------------------

  test("PUT /api/roles/:id/permissions bulk updates permissions", async () => {
    const role = await createRole({ companyId: company.id, name: "Bulk Update Role" });
    const perm1 = await createPermission({
      entity: "orders",
      action: "VIEW",
      category: "ORDERS",
    });
    const perm2 = await createPermission({
      entity: "orders",
      action: "CREATE",
      category: "ORDERS",
    });
    // Start with both disabled
    await createRolePermission({ roleId: role.id, permissionId: perm1.id, enabled: false });
    await createRolePermission({ roleId: role.id, permissionId: perm2.id, enabled: false });

    const request = await createTestRequest(`/api/roles/${role.id}/permissions`, {
      method: "PUT",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      body: {
        permissions: [
          { permissionId: perm1.id, enabled: true },
          { permissionId: perm2.id, enabled: true },
        ],
      },
    });

    const response = await PUT_ROLE_PERMS(request, {
      params: Promise.resolve({ id: role.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.roleId).toBe(role.id);
    expect(data.permissions).toBeDefined();
    expect(data.message).toBe("Permisos actualizados correctamente");

    // Verify both enabled in response
    const p1 = data.permissions.find(
      (p: { permissionId: string }) => p.permissionId === perm1.id,
    );
    const p2 = data.permissions.find(
      (p: { permissionId: string }) => p.permissionId === perm2.id,
    );
    expect(p1.enabled).toBe(true);
    expect(p2.enabled).toBe(true);

    // Verify in DB
    const dbPerms = await testDb
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, role.id));
    const enabledCount = dbPerms.filter((rp) => rp.enabled).length;
    expect(enabledCount).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/roles/[id]/permissions
  // ---------------------------------------------------------------------------

  test("PATCH /api/roles/:id/permissions toggles single permission", async () => {
    const role = await createRole({ companyId: company.id, name: "Toggle Role" });
    const perm = await createPermission({
      entity: "vehicles",
      action: "EDIT",
      category: "VEHICLES",
    });
    await createRolePermission({ roleId: role.id, permissionId: perm.id, enabled: false });

    // Toggle ON
    const requestOn = await createTestRequest(`/api/roles/${role.id}/permissions`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      body: { permissionId: perm.id, enabled: true },
    });

    const responseOn = await PATCH_ROLE_PERM(requestOn, {
      params: Promise.resolve({ id: role.id }),
    });
    expect(responseOn.status).toBe(200);

    const dataOn = await responseOn.json();
    expect(dataOn.permissionId).toBe(perm.id);
    expect(dataOn.enabled).toBe(true);
    expect(dataOn.message).toBe("Permiso activado");

    // Toggle OFF
    const requestOff = await createTestRequest(`/api/roles/${role.id}/permissions`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      body: { permissionId: perm.id, enabled: false },
    });

    const responseOff = await PATCH_ROLE_PERM(requestOff, {
      params: Promise.resolve({ id: role.id }),
    });
    expect(responseOff.status).toBe(200);

    const dataOff = await responseOff.json();
    expect(dataOff.enabled).toBe(false);
    expect(dataOff.message).toBe("Permiso desactivado");
  });

  // ---------------------------------------------------------------------------
  // POST /api/users/[id]/roles
  // ---------------------------------------------------------------------------

  test("POST /api/users/:id/roles assigns role to user", async () => {
    const role = await createRole({ companyId: company.id, name: "Assignable Role" });
    const user = await createUser({ companyId: company.id });

    const request = await createTestRequest(`/api/users/${user.id}/roles`, {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      body: { roleId: role.id, isPrimary: false },
    });

    const response = await ASSIGN_USER_ROLE(request, {
      params: Promise.resolve({ id: user.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.message).toBe("Rol asignado correctamente");
    expect(data.roleId).toBe(role.id);
    expect(data.roleName).toBe("Assignable Role");

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(userRoles)
      .where(
        and(eq(userRoles.userId, user.id), eq(userRoles.roleId, role.id)),
      );
    expect(dbRecord).toBeDefined();
    expect(dbRecord.active).toBe(true);
  });

  test("POST /api/users/:id/roles duplicate active assignment returns 400", async () => {
    const role = await createRole({ companyId: company.id, name: "Dup Role" });
    const user = await createUser({ companyId: company.id });
    await createUserRole({ userId: user.id, roleId: role.id, active: true });

    const request = await createTestRequest(`/api/users/${user.id}/roles`, {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      body: { roleId: role.id },
    });

    const response = await ASSIGN_USER_ROLE(request, {
      params: Promise.resolve({ id: user.id }),
    });
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("ya tiene este rol");
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/users/[id]/roles
  // ---------------------------------------------------------------------------

  test("DELETE /api/users/:id/roles removes role assignment", async () => {
    const role = await createRole({ companyId: company.id, name: "Removable Role" });
    const user = await createUser({ companyId: company.id });
    await createUserRole({ userId: user.id, roleId: role.id, active: true });

    const request = await createTestRequest(`/api/users/${user.id}/roles`, {
      method: "DELETE",
      token,
      companyId: company.id,
      userId: admin.id,
      headers: authHeaders,
      searchParams: { roleId: role.id },
    });

    const response = await REMOVE_USER_ROLE(request, {
      params: Promise.resolve({ id: user.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.message).toBe("Rol removido correctamente");

    // Verify soft delete in DB
    const [dbRecord] = await testDb
      .select()
      .from(userRoles)
      .where(
        and(eq(userRoles.userId, user.id), eq(userRoles.roleId, role.id)),
      );
    expect(dbRecord.active).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Tenant Isolation
  // ---------------------------------------------------------------------------

  test("Company B cannot see Company A roles", async () => {
    await createRole({
      companyId: company.id,
      name: "Company A Only Role",
    });

    const companyB = await createCompany();
    const adminB = await createAdmin(null, {
      email: `adminB-roles-${Date.now()}@test.com`,
      username: `admin_b_roles_${Date.now()}`,
    });
    const tokenB = await createTestToken({
      userId: adminB.id,
      companyId: companyB.id,
      email: adminB.email,
      role: adminB.role,
    });

    const request = await createTestRequest("/api/roles", {
      method: "GET",
      token: tokenB,
      companyId: companyB.id,
      userId: adminB.id,
      headers: { "x-user-email": adminB.email, "x-user-role": adminB.role },
    });

    const response = await LIST_ROLES(request);
    expect(response.status).toBe(200);

    const { data } = await response.json();
    const companyARoles = data.filter(
      (r: { companyId: string }) => r.companyId === company.id,
    );
    expect(companyARoles).toHaveLength(0);
  });
});
