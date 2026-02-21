import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken, createExpiredToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import { createCompany, createUser } from "../setup/test-data";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { GET as ordersGET } from "@/app/api/orders/route";
import { resetRateLimit } from "@/lib/infra/rate-limit";

describe("Auth lifecycle", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let user: Awaited<ReturnType<typeof createUser>>;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    user = await createUser({
      companyId: company.id,
      email: "auth-test@test.com",
      role: "PLANIFICADOR",
    });
  });

  beforeEach(() => {
    resetRateLimit("unknown");
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // -----------------------------------------------------------------------
  // 1. Login with valid credentials
  // -----------------------------------------------------------------------
  test("login with valid credentials returns tokens and user info", async () => {
    const req = await createTestRequest("/api/auth/login", {
      method: "POST",
      body: { email: "auth-test@test.com", password: "password123" },
    });

    const res = await loginPOST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.accessToken).toBeDefined();
    expect(data.refreshToken).toBeDefined();
    expect(data.expiresIn).toBe(900);
    expect(data.user).toMatchObject({
      id: user.id,
      email: "auth-test@test.com",
      role: "PLANIFICADOR",
      companyId: company.id,
    });
  });

  // -----------------------------------------------------------------------
  // 2. Login with wrong password
  // -----------------------------------------------------------------------
  test("login with wrong password returns 401", async () => {
    const req = await createTestRequest("/api/auth/login", {
      method: "POST",
      body: { email: "auth-test@test.com", password: "wrong-password" },
    });

    const res = await loginPOST(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toBe("Credenciales inválidas");
  });

  // -----------------------------------------------------------------------
  // 3. Login with inactive user
  // -----------------------------------------------------------------------
  test("login with inactive user returns 403", async () => {
    const inactiveUser = await createUser({
      companyId: company.id,
      email: "inactive@test.com",
      active: false,
    });

    const req = await createTestRequest("/api/auth/login", {
      method: "POST",
      body: { email: inactiveUser.email, password: "password123" },
    });

    const res = await loginPOST(req);
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.error).toBe("Usuario inactivo");
  });

  // -----------------------------------------------------------------------
  // 4. Login with non-existent email
  // -----------------------------------------------------------------------
  test("login with non-existent email returns 401", async () => {
    const req = await createTestRequest("/api/auth/login", {
      method: "POST",
      body: { email: "nobody@nowhere.com", password: "password123" },
    });

    const res = await loginPOST(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toBe("Usuario no encontrado");
  });

  // -----------------------------------------------------------------------
  // 5. Expired token rejected on protected route
  // -----------------------------------------------------------------------
  test("expired token is rejected on protected route", async () => {
    const token = await createExpiredToken({
      userId: user.id,
      companyId: company.id,
      email: user.email,
      role: user.role,
    });

    const req = await createTestRequest("/api/orders", {
      method: "GET",
      token,
      companyId: company.id,
      userId: user.id,
    });

    const res = await ordersGET(req);
    expect(res.status).toBe(401);
  });

  // -----------------------------------------------------------------------
  // 6. Valid token accepted on protected route
  // -----------------------------------------------------------------------
  test("valid token is accepted on protected route", async () => {
    const token = await createTestToken({
      userId: user.id,
      companyId: company.id,
      email: user.email,
      role: user.role,
    });

    const req = await createTestRequest("/api/orders", {
      method: "GET",
      token,
      companyId: company.id,
      userId: user.id,
    });

    const res = await ordersGET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("data");
    expect(data).toHaveProperty("meta");
  });

  // -----------------------------------------------------------------------
  // 7. Rate limiting after N failed attempts
  // -----------------------------------------------------------------------
  test("rate limiting kicks in after 5 failed login attempts", async () => {
    resetRateLimit("unknown");

    // Make 5 requests to exhaust the limit
    for (let i = 0; i < 5; i++) {
      const req = await createTestRequest("/api/auth/login", {
        method: "POST",
        body: { email: "auth-test@test.com", password: "wrong-password" },
      });
      const res = await loginPOST(req);
      // First 5 should be 401 (wrong password, but not rate-limited)
      expect(res.status).toBe(401);
    }

    // 6th request should be rate-limited
    const req = await createTestRequest("/api/auth/login", {
      method: "POST",
      body: { email: "auth-test@test.com", password: "wrong-password" },
    });
    const res = await loginPOST(req);
    expect(res.status).toBe(429);

    const data = await res.json();
    expect(data.error).toBe(
      "Demasiados intentos. Intente nuevamente más tarde",
    );
  });
});
