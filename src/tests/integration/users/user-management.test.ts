import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { eq } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createPlanner,
  createUser,
} from "../setup/test-data";
import { users } from "@/db/schema";
import { GET, POST } from "@/app/api/users/route";
import { GET as GET_ONE, PUT, DELETE } from "@/app/api/users/[id]/route";

describe("User Management", () => {
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

  beforeEach(async () => {
    // Clean only users that belong to the test company (preserve admin)
    await testDb
      .delete(users)
      .where(eq(users.companyId, company.id));
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // 1. Create PLANIFICADOR user
  test("POST /api/users creates PLANIFICADOR user", async () => {
    const body = {
      name: "Maria Planner",
      email: "maria.planner@test.com",
      username: "maria_planner",
      password: "securePass123",
      role: "PLANIFICADOR",
    };

    const request = await createTestRequest("/api/users", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.name).toBe("Maria Planner");
    expect(data.email).toBe("maria.planner@test.com");
    expect(data.username).toBe("maria_planner");
    expect(data.role).toBe("PLANIFICADOR");
    expect(data.companyId).toBe(company.id);
    expect(data.active).toBe(true);
    expect(data.id).toBeDefined();

    // Verify record in DB
    const [dbRecord] = await testDb
      .select()
      .from(users)
      .where(eq(users.id, data.id));
    expect(dbRecord).toBeDefined();
    expect(dbRecord.name).toBe("Maria Planner");
    expect(dbRecord.companyId).toBe(company.id);
  });

  // 2. Create CONDUCTOR with driver fields
  test("POST /api/users creates CONDUCTOR with driver fields", async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const body = {
      name: "Carlos Driver",
      email: "carlos.driver@test.com",
      username: "carlos_driver",
      password: "securePass123",
      role: "CONDUCTOR",
      identification: "DNI-12345678",
      licenseNumber: "LIC-98765",
      licenseExpiry: futureDate.toISOString(),
      licenseCategories: "A,B",
      driverStatus: "AVAILABLE",
    };

    const request = await createTestRequest("/api/users", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.name).toBe("Carlos Driver");
    expect(data.role).toBe("CONDUCTOR");
    expect(data.licenseNumber).toBe("LIC-98765");
    expect(data.identification).toBe("DNI-12345678");
    expect(data.driverStatus).toBe("AVAILABLE");
    expect(data.licenseCategories).toBe("A,B");
  });

  // 3. Duplicate email rejected
  test("POST /api/users rejects duplicate email", async () => {
    await createUser({
      companyId: company.id,
      email: "duplicate@test.com",
      username: "unique_user_1",
    });

    const request = await createTestRequest("/api/users", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Duplicate Email",
        email: "duplicate@test.com",
        username: "unique_user_2",
        password: "securePass123",
        role: "PLANIFICADOR",
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("correo");
  });

  // 4. Duplicate username rejected
  test("POST /api/users rejects duplicate username", async () => {
    await createUser({
      companyId: company.id,
      email: "unique1@test.com",
      username: "dup_username",
    });

    const request = await createTestRequest("/api/users", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Duplicate Username",
        email: "unique2@test.com",
        username: "dup_username",
        password: "securePass123",
        role: "PLANIFICADOR",
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("nombre de usuario");
  });

  // 5. List users with role filter
  test("GET /api/users filters by role", async () => {
    await createUser({
      companyId: company.id,
      role: "PLANIFICADOR",
      email: "planner1@test.com",
      username: "planner_1",
    });
    await createUser({
      companyId: company.id,
      role: "PLANIFICADOR",
      email: "planner2@test.com",
      username: "planner_2",
    });
    await createUser({
      companyId: company.id,
      role: "MONITOR",
      email: "monitor1@test.com",
      username: "monitor_1",
    });

    const request = await createTestRequest("/api/users", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      searchParams: { role: "PLANIFICADOR" },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const { data } = await response.json();
    expect(data).toHaveLength(2);
    expect(
      data.every((u: { role: string }) => u.role === "PLANIFICADOR"),
    ).toBe(true);
  });

  // 6. Search by name/email
  test("GET /api/users searches by name or email", async () => {
    await createUser({
      companyId: company.id,
      name: "Fernando Gonzalez",
      email: "fernando@test.com",
      username: "fernando_g",
    });
    await createUser({
      companyId: company.id,
      name: "Ana Martinez",
      email: "ana@test.com",
      username: "ana_m",
    });

    const request = await createTestRequest("/api/users", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      searchParams: { search: "Fernando" },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const { data } = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("Fernando Gonzalez");
  });

  // 7. Update user name/email
  test("PUT /api/users/:id updates user name", async () => {
    const user = await createUser({
      companyId: company.id,
      name: "Original Name",
      email: "original@test.com",
      username: "original_user",
    });

    const request = await createTestRequest(`/api/users/${user.id}`, {
      method: "PUT",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { name: "Updated Name" },
    });

    const response = await PUT(request, {
      params: Promise.resolve({ id: user.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.name).toBe("Updated Name");

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(users)
      .where(eq(users.id, user.id));
    expect(dbRecord.name).toBe("Updated Name");
  });

  // 8. Soft delete (active=false)
  test("DELETE /api/users/:id soft deletes user", async () => {
    const user = await createUser({
      companyId: company.id,
      email: "todelete@test.com",
      username: "to_delete",
    });

    const request = await createTestRequest(`/api/users/${user.id}`, {
      method: "DELETE",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: user.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.message).toBe("User deactivated successfully");
    expect(data.user.active).toBe(false);

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(users)
      .where(eq(users.id, user.id));
    expect(dbRecord.active).toBe(false);
  });

  // 9. ADMIN_SISTEMA with companyId=null
  test("POST /api/users creates ADMIN_SISTEMA with null companyId", async () => {
    const body = {
      name: "Super Admin",
      email: "superadmin@test.com",
      username: "super_admin",
      password: "securePass123",
      role: "ADMIN_SISTEMA",
    };

    const request = await createTestRequest("/api/users", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.role).toBe("ADMIN_SISTEMA");
    expect(data.companyId).toBeNull();

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(users)
      .where(eq(users.id, data.id));
    expect(dbRecord.companyId).toBeNull();
  });

  // 10. 404 for non-existent user
  test("GET /api/users/:id returns 404 for non-existent user", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const request = await createTestRequest(`/api/users/${fakeId}`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET_ONE(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("User not found");
  });

  // 11. Tenant isolation
  test("Company B cannot see Company A users", async () => {
    // Create a user in company A
    await createUser({
      companyId: company.id,
      name: "Company A User",
      email: "companyA@test.com",
      username: "company_a_user",
    });

    // Create company B with its own admin
    const companyB = await createCompany();
    const adminB = await createAdmin(null, {
      email: `adminB-${Date.now()}@test.com`,
      username: `admin_b_${Date.now()}`,
    });
    const tokenB = await createTestToken({
      userId: adminB.id,
      companyId: companyB.id,
      email: adminB.email,
      role: adminB.role,
    });

    const request = await createTestRequest("/api/users", {
      method: "GET",
      token: tokenB,
      companyId: companyB.id,
      userId: adminB.id,
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const { data } = await response.json();
    // Company B should not see Company A's users
    const companyAUsers = data.filter(
      (u: { companyId: string }) => u.companyId === company.id,
    );
    expect(companyAUsers).toHaveLength(0);
  });

  // 12. Missing auth returns 401
  test("request without auth returns 401", async () => {
    const request = await createTestRequest("/api/users", {
      method: "GET",
    });

    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
