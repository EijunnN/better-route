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
  createUserRole,
} from "../setup/test-data";
import { users, userRoles, roles } from "@/db/schema";
import {
  GET as GET_USER,
  PUT as PUT_USER,
  DELETE as DELETE_USER,
} from "@/app/api/users/[id]/route";
import {
  GET as GET_ROLES,
  POST as POST_ROLE,
  DELETE as DELETE_ROLE,
} from "@/app/api/users/[id]/roles/route";
import { GET as GET_SESSIONS } from "@/app/api/users/[id]/sessions/route";
import { POST as POST_IMPORT } from "@/app/api/users/import/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the `params` object that Next.js App Router passes to [id] routes. */
function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** Non-existent UUID for 404 tests. */
const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("User Detail, Roles & Sessions", () => {
  let companyA: Awaited<ReturnType<typeof createCompany>>;
  let companyB: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let adminB: Awaited<ReturnType<typeof createAdmin>>;
  let tokenA: string;
  let tokenB: string;
  /** Extra headers for routes that use setupAuthContext + requireTenantContext */
  let authHeadersA: Record<string, string>;
  let authHeadersB: Record<string, string>;

  beforeAll(async () => {
    await cleanDatabase();

    // Two companies for tenant-isolation tests
    companyA = await createCompany({ commercialName: "Company A" });
    companyB = await createCompany({ commercialName: "Company B" });

    // ADMIN_SISTEMA (companyId=null) acts on Company A
    admin = await createAdmin(null, {
      email: "admin-detail@test.com",
      username: "admin_detail",
    });
    tokenA = await createTestToken({
      userId: admin.id,
      companyId: companyA.id,
      email: admin.email,
      role: admin.role,
    });

    // Separate admin for Company B
    adminB = await createAdmin(null, {
      email: "admin-b-detail@test.com",
      username: "admin_b_detail",
    });
    tokenB = await createTestToken({
      userId: adminB.id,
      companyId: companyB.id,
      email: adminB.email,
      role: adminB.role,
    });

    authHeadersA = {
      "x-user-email": admin.email,
      "x-user-role": admin.role,
    };
    authHeadersB = {
      "x-user-email": adminB.email,
      "x-user-role": adminB.role,
    };
  });

  beforeEach(async () => {
    // Clean company-scoped users (preserve admins which have null companyId)
    await testDb.delete(userRoles);
    await testDb.delete(roles).where(eq(roles.companyId, companyA.id));
    await testDb.delete(roles).where(eq(roles.companyId, companyB.id));
    await testDb.delete(users).where(eq(users.companyId, companyA.id));
    await testDb.delete(users).where(eq(users.companyId, companyB.id));
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // =========================================================================
  // GET /api/users/[id]  —  Get user by ID
  // =========================================================================

  describe("GET /api/users/[id]", () => {
    test("returns user by ID (200)", async () => {
      const user = await createUser({
        companyId: companyA.id,
        name: "Detail User",
        email: "detail@test.com",
        username: "detail_user",
      });

      const request = await createTestRequest(`/api/users/${user.id}`, {
        method: "GET",
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
      });

      const response = await GET_USER(request, idParams(user.id));
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.id).toBe(user.id);
      expect(data.name).toBe("Detail User");
      expect(data.email).toBe("detail@test.com");
      expect(data.username).toBe("detail_user");
      expect(data.companyId).toBe(companyA.id);
      expect(data.active).toBe(true);
      // primaryFleet is null when user has no fleet
      expect(data.primaryFleet).toBeNull();
    });

    test("returns 404 for non-existent user", async () => {
      const request = await createTestRequest(`/api/users/${FAKE_UUID}`, {
        method: "GET",
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
      });

      const response = await GET_USER(request, idParams(FAKE_UUID));
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("User not found");
    });

    test("returns 401 without authentication", async () => {
      const request = await createTestRequest(`/api/users/${FAKE_UUID}`, {
        method: "GET",
      });

      const response = await GET_USER(request, idParams(FAKE_UUID));
      expect(response.status).toBe(401);
    });

    test("tenant isolation — cannot read user from another company", async () => {
      const userA = await createUser({
        companyId: companyA.id,
        name: "Company A User",
        email: "companyA-detail@test.com",
        username: "company_a_detail",
      });

      // Company B admin tries to read Company A user
      const request = await createTestRequest(`/api/users/${userA.id}`, {
        method: "GET",
        token: tokenB,
        companyId: companyB.id,
        userId: adminB.id,
      });

      const response = await GET_USER(request, idParams(userA.id));
      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // PUT /api/users/[id]  —  Update user
  // =========================================================================

  describe("PUT /api/users/[id]", () => {
    test("updates user name", async () => {
      const user = await createUser({
        companyId: companyA.id,
        name: "Old Name",
        email: "update-name@test.com",
        username: "update_name",
      });

      const request = await createTestRequest(`/api/users/${user.id}`, {
        method: "PUT",
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
        body: { name: "New Name" },
      });

      const response = await PUT_USER(request, idParams(user.id));
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.name).toBe("New Name");

      // Verify in DB
      const [dbRecord] = await testDb
        .select()
        .from(users)
        .where(eq(users.id, user.id));
      expect(dbRecord.name).toBe("New Name");
    });

    test("updates user email", async () => {
      const user = await createUser({
        companyId: companyA.id,
        email: "old-email@test.com",
        username: "update_email",
      });

      const request = await createTestRequest(`/api/users/${user.id}`, {
        method: "PUT",
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
        body: { email: "new-email@test.com" },
      });

      const response = await PUT_USER(request, idParams(user.id));
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.email).toBe("new-email@test.com");
    });

    test("updates user role", async () => {
      const user = await createUser({
        companyId: companyA.id,
        role: "PLANIFICADOR",
        email: "role-change@test.com",
        username: "role_change",
      });

      const request = await createTestRequest(`/api/users/${user.id}`, {
        method: "PUT",
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
        body: { role: "MONITOR" },
      });

      const response = await PUT_USER(request, idParams(user.id));
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.role).toBe("MONITOR");
    });

    test("updates active status (deactivate)", async () => {
      const user = await createUser({
        companyId: companyA.id,
        email: "deactivate@test.com",
        username: "deactivate_user",
      });

      const request = await createTestRequest(`/api/users/${user.id}`, {
        method: "PUT",
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
        body: { active: false },
      });

      const response = await PUT_USER(request, idParams(user.id));
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.active).toBe(false);
    });

    test("rejects duplicate email on update", async () => {
      await createUser({
        companyId: companyA.id,
        email: "taken@test.com",
        username: "taken_email",
      });
      const user = await createUser({
        companyId: companyA.id,
        email: "original@test.com",
        username: "original_email",
      });

      const request = await createTestRequest(`/api/users/${user.id}`, {
        method: "PUT",
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
        body: { email: "taken@test.com" },
      });

      const response = await PUT_USER(request, idParams(user.id));
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain("correo");
    });

    test("rejects duplicate username on update", async () => {
      await createUser({
        companyId: companyA.id,
        email: "taken-un@test.com",
        username: "taken_username",
      });
      const user = await createUser({
        companyId: companyA.id,
        email: "orig-un@test.com",
        username: "orig_username",
      });

      const request = await createTestRequest(`/api/users/${user.id}`, {
        method: "PUT",
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
        body: { username: "taken_username" },
      });

      const response = await PUT_USER(request, idParams(user.id));
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain("nombre de usuario");
    });

    test("returns 404 for non-existent user", async () => {
      const request = await createTestRequest(`/api/users/${FAKE_UUID}`, {
        method: "PUT",
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
        body: { name: "Ghost" },
      });

      const response = await PUT_USER(request, idParams(FAKE_UUID));
      expect(response.status).toBe(404);
    });

    test("returns 401 without authentication", async () => {
      const request = await createTestRequest(`/api/users/${FAKE_UUID}`, {
        method: "PUT",
        body: { name: "No Auth" },
      });

      const response = await PUT_USER(request, idParams(FAKE_UUID));
      expect(response.status).toBe(401);
    });

    test("tenant isolation — cannot update user from another company", async () => {
      const userA = await createUser({
        companyId: companyA.id,
        name: "Company A Only",
        email: "tenant-update@test.com",
        username: "tenant_update",
      });

      const request = await createTestRequest(`/api/users/${userA.id}`, {
        method: "PUT",
        token: tokenB,
        companyId: companyB.id,
        userId: adminB.id,
        body: { name: "Hacked" },
      });

      const response = await PUT_USER(request, idParams(userA.id));
      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // DELETE /api/users/[id]  —  Soft delete user
  // =========================================================================

  describe("DELETE /api/users/[id]", () => {
    test("soft deletes user (sets active=false)", async () => {
      const user = await createUser({
        companyId: companyA.id,
        email: "soft-del@test.com",
        username: "soft_del",
      });

      const request = await createTestRequest(`/api/users/${user.id}`, {
        method: "DELETE",
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
      });

      const response = await DELETE_USER(request, idParams(user.id));
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.message).toBe("User deactivated successfully");
      expect(data.user.active).toBe(false);
      expect(data.user.id).toBe(user.id);

      // Verify in DB
      const [dbRecord] = await testDb
        .select()
        .from(users)
        .where(eq(users.id, user.id));
      expect(dbRecord.active).toBe(false);
    });

    test("returns 404 for non-existent user", async () => {
      const request = await createTestRequest(`/api/users/${FAKE_UUID}`, {
        method: "DELETE",
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
      });

      const response = await DELETE_USER(request, idParams(FAKE_UUID));
      expect(response.status).toBe(404);
    });

    test("returns 401 without authentication", async () => {
      const request = await createTestRequest(`/api/users/${FAKE_UUID}`, {
        method: "DELETE",
      });

      const response = await DELETE_USER(request, idParams(FAKE_UUID));
      expect(response.status).toBe(401);
    });

    test("tenant isolation — cannot delete user from another company", async () => {
      const userA = await createUser({
        companyId: companyA.id,
        email: "tenant-del@test.com",
        username: "tenant_del",
      });

      const request = await createTestRequest(`/api/users/${userA.id}`, {
        method: "DELETE",
        token: tokenB,
        companyId: companyB.id,
        userId: adminB.id,
      });

      const response = await DELETE_USER(request, idParams(userA.id));
      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // GET /api/users/[id]/roles  —  Get user roles
  // =========================================================================

  describe("GET /api/users/[id]/roles", () => {
    test("returns user roles (200)", async () => {
      const user = await createUser({
        companyId: companyA.id,
        name: "Roled User",
        email: "roled@test.com",
        username: "roled_user",
      });

      const role = await createRole({
        companyId: companyA.id,
        name: "Test Operator",
        code: "TEST_OPERATOR",
      });

      await createUserRole({
        userId: user.id,
        roleId: role.id,
        isPrimary: true,
        active: true,
      });

      const request = await createTestRequest(
        `/api/users/${user.id}/roles`,
        {
          method: "GET",
          token: tokenA,
          companyId: companyA.id,
          userId: admin.id,
          headers: authHeadersA,
        },
      );

      const response = await GET_ROLES(request, idParams(user.id));
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.userId).toBe(user.id);
      expect(data.userName).toBe("Roled User");
      expect(data.roles).toHaveLength(1);
      expect(data.roles[0].roleName).toBe("Test Operator");
      expect(data.roles[0].roleCode).toBe("TEST_OPERATOR");
      expect(data.roles[0].isPrimary).toBe(true);
    });

    test("returns empty roles array for user with no roles", async () => {
      const user = await createUser({
        companyId: companyA.id,
        email: "no-roles@test.com",
        username: "no_roles",
      });

      const request = await createTestRequest(
        `/api/users/${user.id}/roles`,
        {
          method: "GET",
          token: tokenA,
          companyId: companyA.id,
          userId: admin.id,
          headers: authHeadersA,
        },
      );

      const response = await GET_ROLES(request, idParams(user.id));
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.roles).toHaveLength(0);
    });

    test("returns 404 for non-existent user", async () => {
      const request = await createTestRequest(
        `/api/users/${FAKE_UUID}/roles`,
        {
          method: "GET",
          token: tokenA,
          companyId: companyA.id,
          userId: admin.id,
          headers: authHeadersA,
        },
      );

      const response = await GET_ROLES(request, idParams(FAKE_UUID));
      expect(response.status).toBe(404);
    });

    test("returns 401 without authentication", async () => {
      const request = await createTestRequest(
        `/api/users/${FAKE_UUID}/roles`,
        { method: "GET" },
      );

      const response = await GET_ROLES(request, idParams(FAKE_UUID));
      expect(response.status).toBe(401);
    });

    test("tenant isolation — cannot read roles from another company user", async () => {
      const userA = await createUser({
        companyId: companyA.id,
        email: "tenant-roles@test.com",
        username: "tenant_roles",
      });

      const request = await createTestRequest(
        `/api/users/${userA.id}/roles`,
        {
          method: "GET",
          token: tokenB,
          companyId: companyB.id,
          userId: adminB.id,
          headers: authHeadersB,
        },
      );

      const response = await GET_ROLES(request, idParams(userA.id));
      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // POST /api/users/[id]/roles  —  Assign role to user
  // =========================================================================

  describe("POST /api/users/[id]/roles", () => {
    test("assigns a role to a user", async () => {
      const user = await createUser({
        companyId: companyA.id,
        email: "assign-role@test.com",
        username: "assign_role",
      });

      const role = await createRole({
        companyId: companyA.id,
        name: "Dispatcher",
        code: "DISPATCHER",
      });

      const request = await createTestRequest(
        `/api/users/${user.id}/roles`,
        {
          method: "POST",
          token: tokenA,
          companyId: companyA.id,
          userId: admin.id,
          headers: authHeadersA,
          body: { roleId: role.id, isPrimary: false },
        },
      );

      const response = await POST_ROLE(request, idParams(user.id));
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.message).toBe("Rol asignado correctamente");
      expect(data.roleId).toBe(role.id);
      expect(data.roleName).toBe("Dispatcher");

      // Verify in DB
      const [dbRecord] = await testDb
        .select()
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, user.id),
            eq(userRoles.roleId, role.id),
          ),
        );
      expect(dbRecord).toBeDefined();
      expect(dbRecord.active).toBe(true);
    });

    test("assigns a primary role and reflects in user roles list", async () => {
      const user = await createUser({
        companyId: companyA.id,
        email: "primary-role@test.com",
        username: "primary_role",
      });

      const role = await createRole({
        companyId: companyA.id,
        name: "Primary Role",
        code: "PRIMARY_ROLE",
      });

      const request = await createTestRequest(
        `/api/users/${user.id}/roles`,
        {
          method: "POST",
          token: tokenA,
          companyId: companyA.id,
          userId: admin.id,
          headers: authHeadersA,
          body: { roleId: role.id, isPrimary: true },
        },
      );

      const response = await POST_ROLE(request, idParams(user.id));
      expect(response.status).toBe(200);

      // Verify the role assignment is primary in DB
      const [dbRecord] = await testDb
        .select()
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, user.id),
            eq(userRoles.roleId, role.id),
          ),
        );
      expect(dbRecord.isPrimary).toBe(true);
    });

    test("rejects duplicate active role assignment", async () => {
      const user = await createUser({
        companyId: companyA.id,
        email: "dup-role@test.com",
        username: "dup_role",
      });

      const role = await createRole({
        companyId: companyA.id,
        name: "Dup Role",
        code: "DUP_ROLE",
      });

      // First assignment
      await createUserRole({
        userId: user.id,
        roleId: role.id,
        isPrimary: false,
        active: true,
      });

      // Second assignment of same role
      const request = await createTestRequest(
        `/api/users/${user.id}/roles`,
        {
          method: "POST",
          token: tokenA,
          companyId: companyA.id,
          userId: admin.id,
          headers: authHeadersA,
          body: { roleId: role.id },
        },
      );

      const response = await POST_ROLE(request, idParams(user.id));
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain("ya tiene este rol");
    });

    test("reactivates an inactive role assignment", async () => {
      const user = await createUser({
        companyId: companyA.id,
        email: "reactivate-role@test.com",
        username: "reactivate_role",
      });

      const role = await createRole({
        companyId: companyA.id,
        name: "Reactivate Role",
        code: "REACTIVATE_ROLE",
      });

      // Create an inactive assignment
      await createUserRole({
        userId: user.id,
        roleId: role.id,
        isPrimary: false,
        active: false,
      });

      // Reassign the same role (should reactivate)
      const request = await createTestRequest(
        `/api/users/${user.id}/roles`,
        {
          method: "POST",
          token: tokenA,
          companyId: companyA.id,
          userId: admin.id,
          headers: authHeadersA,
          body: { roleId: role.id, isPrimary: true },
        },
      );

      const response = await POST_ROLE(request, idParams(user.id));
      expect(response.status).toBe(200);

      // Verify reactivated in DB
      const [dbRecord] = await testDb
        .select()
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, user.id),
            eq(userRoles.roleId, role.id),
          ),
        );
      expect(dbRecord.active).toBe(true);
      expect(dbRecord.isPrimary).toBe(true);
    });

    test("returns 400 when roleId is missing", async () => {
      const user = await createUser({
        companyId: companyA.id,
        email: "missing-roleid@test.com",
        username: "missing_roleid",
      });

      const request = await createTestRequest(
        `/api/users/${user.id}/roles`,
        {
          method: "POST",
          token: tokenA,
          companyId: companyA.id,
          userId: admin.id,
          headers: authHeadersA,
          body: {},
        },
      );

      const response = await POST_ROLE(request, idParams(user.id));
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain("roleId");
    });

    test("returns 404 when role does not exist", async () => {
      const user = await createUser({
        companyId: companyA.id,
        email: "ghost-role@test.com",
        username: "ghost_role",
      });

      const request = await createTestRequest(
        `/api/users/${user.id}/roles`,
        {
          method: "POST",
          token: tokenA,
          companyId: companyA.id,
          userId: admin.id,
          headers: authHeadersA,
          body: { roleId: FAKE_UUID },
        },
      );

      const response = await POST_ROLE(request, idParams(user.id));
      expect(response.status).toBe(404);
    });

    test("returns 404 for non-existent user", async () => {
      const role = await createRole({
        companyId: companyA.id,
        name: "Orphan Role",
        code: "ORPHAN_ROLE",
      });

      const request = await createTestRequest(
        `/api/users/${FAKE_UUID}/roles`,
        {
          method: "POST",
          token: tokenA,
          companyId: companyA.id,
          userId: admin.id,
          headers: authHeadersA,
          body: { roleId: role.id },
        },
      );

      const response = await POST_ROLE(request, idParams(FAKE_UUID));
      expect(response.status).toBe(404);
    });

    test("returns 401 without authentication", async () => {
      const request = await createTestRequest(
        `/api/users/${FAKE_UUID}/roles`,
        {
          method: "POST",
          body: { roleId: FAKE_UUID },
        },
      );

      const response = await POST_ROLE(request, idParams(FAKE_UUID));
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // DELETE /api/users/[id]/roles  —  Remove role from user
  // =========================================================================

  describe("DELETE /api/users/[id]/roles", () => {
    test("removes a role from a user (soft delete)", async () => {
      const user = await createUser({
        companyId: companyA.id,
        email: "remove-role@test.com",
        username: "remove_role",
      });

      const role = await createRole({
        companyId: companyA.id,
        name: "Removable Role",
        code: "REMOVABLE_ROLE",
      });

      await createUserRole({
        userId: user.id,
        roleId: role.id,
        isPrimary: false,
        active: true,
      });

      const request = await createTestRequest(
        `/api/users/${user.id}/roles`,
        {
          method: "DELETE",
          token: tokenA,
          companyId: companyA.id,
          userId: admin.id,
          headers: authHeadersA,
          searchParams: { roleId: role.id },
        },
      );

      const response = await DELETE_ROLE(request, idParams(user.id));
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.message).toBe("Rol removido correctamente");

      // Verify soft-deleted in DB
      const [dbRecord] = await testDb
        .select()
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, user.id),
            eq(userRoles.roleId, role.id),
          ),
        );
      expect(dbRecord.active).toBe(false);
    });

    test("returns 400 when roleId query param is missing", async () => {
      const user = await createUser({
        companyId: companyA.id,
        email: "no-roleid-param@test.com",
        username: "no_roleid_param",
      });

      const request = await createTestRequest(
        `/api/users/${user.id}/roles`,
        {
          method: "DELETE",
          token: tokenA,
          companyId: companyA.id,
          userId: admin.id,
          headers: authHeadersA,
          // No searchParams — roleId is missing
        },
      );

      const response = await DELETE_ROLE(request, idParams(user.id));
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain("roleId");
    });

    test("returns 404 for non-existent user", async () => {
      const request = await createTestRequest(
        `/api/users/${FAKE_UUID}/roles`,
        {
          method: "DELETE",
          token: tokenA,
          companyId: companyA.id,
          userId: admin.id,
          headers: authHeadersA,
          searchParams: { roleId: FAKE_UUID },
        },
      );

      const response = await DELETE_ROLE(request, idParams(FAKE_UUID));
      expect(response.status).toBe(404);
    });

    test("returns 401 without authentication", async () => {
      const request = await createTestRequest(
        `/api/users/${FAKE_UUID}/roles`,
        {
          method: "DELETE",
          searchParams: { roleId: FAKE_UUID },
        },
      );

      const response = await DELETE_ROLE(request, idParams(FAKE_UUID));
      expect(response.status).toBe(401);
    });

    test("tenant isolation — cannot remove role from another company user", async () => {
      const userA = await createUser({
        companyId: companyA.id,
        email: "tenant-remrole@test.com",
        username: "tenant_remrole",
      });

      const role = await createRole({
        companyId: companyA.id,
        name: "Tenant Role",
        code: "TENANT_ROLE",
      });

      await createUserRole({
        userId: userA.id,
        roleId: role.id,
        isPrimary: false,
        active: true,
      });

      // Company B admin tries to remove role from Company A user
      const request = await createTestRequest(
        `/api/users/${userA.id}/roles`,
        {
          method: "DELETE",
          token: tokenB,
          companyId: companyB.id,
          userId: adminB.id,
          headers: authHeadersB,
          searchParams: { roleId: role.id },
        },
      );

      const response = await DELETE_ROLE(request, idParams(userA.id));
      expect(response.status).toBe(404);
    });
  });

  // =========================================================================
  // GET /api/users/[id]/sessions  —  List user sessions
  // =========================================================================

  describe("GET /api/users/[id]/sessions", () => {
    test("returns sessions for authenticated admin (200)", async () => {
      // The session mock returns an in-memory store. Since no sessions have
      // been created in the mock for this user, we expect an empty array.
      const user = await createUser({
        companyId: companyA.id,
        email: "sessions@test.com",
        username: "sessions_user",
      });

      const request = await createTestRequest(
        `/api/users/${user.id}/sessions`,
        {
          method: "GET",
          token: tokenA,
          companyId: companyA.id,
          userId: admin.id,
        },
      );

      const response = await GET_SESSIONS(request, idParams(user.id));
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.userId).toBe(user.id);
      expect(Array.isArray(data.sessions)).toBe(true);
      expect(data.count).toBe(data.sessions.length);
    });

    test("returns 401 without authentication", async () => {
      const request = await createTestRequest(
        `/api/users/${FAKE_UUID}/sessions`,
        { method: "GET" },
      );

      const response = await GET_SESSIONS(request, idParams(FAKE_UUID));
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // POST /api/users/import  —  Bulk import users via CSV
  // =========================================================================

  describe("POST /api/users/import", () => {
    /** Build a FormData with CSV content as a file attachment. */
    function buildCsvFormData(csvContent: string): FormData {
      const blob = new Blob([csvContent], { type: "text/csv" });
      const file = new File([blob], "users.csv", { type: "text/csv" });
      const formData = new FormData();
      formData.append("file", file);
      return formData;
    }

    /** Create a raw Request with FormData (cannot use createTestRequest for formData). */
    async function buildImportRequest(
      formData: FormData,
      opts: { token: string; companyId: string; userId: string },
    ): Promise<Request> {
      const url = new URL("/api/users/import", "http://localhost:3000");
      const headers: Record<string, string> = {
        authorization: `Bearer ${opts.token}`,
        "x-company-id": opts.companyId,
        "x-user-id": opts.userId,
      };

      // We use the native Request (which the preload maps to NextRequest)
      return new Request(url, {
        method: "POST",
        headers,
        body: formData,
      });
    }

    test("imports valid CSV with multiple users", async () => {
      const csv = [
        "name,email,username,password,role",
        "Alice Import,alice@import.com,alice_import,Password123!,PLANIFICADOR",
        "Bob Import,bob@import.com,bob_import,Password456!,MONITOR",
      ].join("\n");

      const formData = buildCsvFormData(csv);
      const request = await buildImportRequest(formData, {
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
      });

      const response = await POST_IMPORT(request as any);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.created).toBe(2);

      // Verify in DB
      const [alice] = await testDb
        .select()
        .from(users)
        .where(eq(users.email, "alice@import.com"));
      expect(alice).toBeDefined();
      expect(alice.name).toBe("Alice Import");
      expect(alice.role).toBe("PLANIFICADOR");
      expect(alice.companyId).toBe(companyA.id);

      const [bob] = await testDb
        .select()
        .from(users)
        .where(eq(users.email, "bob@import.com"));
      expect(bob).toBeDefined();
      expect(bob.role).toBe("MONITOR");
    });

    test("imports CSV with CONDUCTOR including driver fields", async () => {
      const csv = [
        "name,email,username,password,role,identification,licenseNumber,driverStatus",
        "Driver One,driver1@import.com,driver1_import,Password123!,CONDUCTOR,DNI-111,LIC-001,AVAILABLE",
      ].join("\n");

      const formData = buildCsvFormData(csv);
      const request = await buildImportRequest(formData, {
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
      });

      const response = await POST_IMPORT(request as any);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.created).toBe(1);

      const [driver] = await testDb
        .select()
        .from(users)
        .where(eq(users.email, "driver1@import.com"));
      expect(driver.role).toBe("CONDUCTOR");
      expect(driver.identification).toBe("DNI-111");
      expect(driver.licenseNumber).toBe("LIC-001");
      expect(driver.driverStatus).toBe("AVAILABLE");
    });

    test("supports semicolon-separated CSV", async () => {
      const csv = [
        "name;email;username;password;role",
        "Semi User;semi@import.com;semi_import;Password123!;PLANIFICADOR",
      ].join("\n");

      const formData = buildCsvFormData(csv);
      const request = await buildImportRequest(formData, {
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
      });

      const response = await POST_IMPORT(request as any);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.created).toBe(1);
    });

    test("returns 400 when no file is attached", async () => {
      const formData = new FormData();
      // No file attached
      const request = await buildImportRequest(formData, {
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
      });

      const response = await POST_IMPORT(request as any);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain("archivo");
    });

    test("returns 400 for empty CSV (header only)", async () => {
      const csv = "name,email,username,password,role\n";

      const formData = buildCsvFormData(csv);
      const request = await buildImportRequest(formData, {
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
      });

      const response = await POST_IMPORT(request as any);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.created).toBe(0);
    });

    test("returns 400 for validation errors (missing required fields)", async () => {
      const csv = [
        "name,email,username,password,role",
        // name too short, email invalid, username too short, password too short
        "A,,ab,short,INVALID_ROLE",
      ].join("\n");

      const formData = buildCsvFormData(csv);
      const request = await buildImportRequest(formData, {
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
      });

      const response = await POST_IMPORT(request as any);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe("Validation failed");
      expect(data.details.length).toBeGreaterThan(0);
    });

    test("returns 400 for duplicate emails within CSV", async () => {
      const csv = [
        "name,email,username,password,role",
        "User A,same@import.com,user_a_dup,Password123!,PLANIFICADOR",
        "User B,same@import.com,user_b_dup,Password123!,MONITOR",
      ].join("\n");

      const formData = buildCsvFormData(csv);
      const request = await buildImportRequest(formData, {
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
      });

      const response = await POST_IMPORT(request as any);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.details.some((d: { field: string }) => d.field === "email")).toBe(true);
    });

    test("returns 400 for duplicate usernames within CSV", async () => {
      const csv = [
        "name,email,username,password,role",
        "User A,a-dup@import.com,same_username,Password123!,PLANIFICADOR",
        "User B,b-dup@import.com,same_username,Password123!,MONITOR",
      ].join("\n");

      const formData = buildCsvFormData(csv);
      const request = await buildImportRequest(formData, {
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
      });

      const response = await POST_IMPORT(request as any);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(
        data.details.some((d: { field: string }) => d.field === "username"),
      ).toBe(true);
    });

    test("returns 207 for partial success (some DB conflicts)", async () => {
      // Pre-create a user whose email will clash
      await createUser({
        companyId: companyA.id,
        email: "clash@import.com",
        username: "clash_existing",
      });

      const csv = [
        "name,email,username,password,role",
        // This one will conflict on email
        "Clash User,clash@import.com,clash_import,Password123!,PLANIFICADOR",
        // This one is valid
        "Good User,good@import.com,good_import,Password123!,PLANIFICADOR",
      ].join("\n");

      const formData = buildCsvFormData(csv);
      const request = await buildImportRequest(formData, {
        token: tokenA,
        companyId: companyA.id,
        userId: admin.id,
      });

      const response = await POST_IMPORT(request as any);
      expect(response.status).toBe(207);

      const data = await response.json();
      expect(data.created).toBe(1);
      expect(data.details.length).toBeGreaterThan(0);
    });

    test("returns 401 without authentication", async () => {
      const csv = "name,email,username,password,role\nA,a@b.com,abc,pass1234,PLANIFICADOR";
      const formData = buildCsvFormData(csv);
      const url = new URL("/api/users/import", "http://localhost:3000");
      const request = new Request(url, {
        method: "POST",
        body: formData,
      });

      const response = await POST_IMPORT(request as any);
      expect(response.status).toBe(401);
    });
  });
});
