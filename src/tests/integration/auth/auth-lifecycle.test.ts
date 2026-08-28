import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as refreshPOST } from "@/app/api/auth/refresh/route";
import { GET as ordersGET } from "@/app/api/orders/route";
import { resetRateLimit } from "@/lib/infra/rate-limit";
import { createExpiredToken, createTestToken } from "../setup/test-auth";
import { createCompany, createUser } from "../setup/test-data";
import { cleanDatabase } from "../setup/test-db";
import { createTestRequest } from "../setup/test-request";

/**
 * El login limita por dos dimensiones (IP y email). Sin reverse proxy los
 * requests de test caen todos en la IP "unknown", así que hay que liberar
 * ambas cubetas entre tests.
 */
async function resetAuthLimits(...emails: string[]): Promise<void> {
  await resetRateLimit("auth:ip:unknown");
  await Promise.all(
    emails.map((email) => resetRateLimit(`auth:email:${email.toLowerCase()}`)),
  );
}

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

  beforeEach(async () => {
    await resetAuthLimits(
      "auth-test@test.com",
      "inactive@test.com",
      "nobody@nowhere.com",
    );
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
  // 4. Login with non-existent email — indistinguible de password incorrecta
  // -----------------------------------------------------------------------
  test("login with non-existent email is indistinguishable from a wrong password", async () => {
    const unknownEmailReq = await createTestRequest("/api/auth/login", {
      method: "POST",
      body: { email: "nobody@nowhere.com", password: "password123" },
    });
    const unknownEmailRes = await loginPOST(unknownEmailReq);

    const wrongPasswordReq = await createTestRequest("/api/auth/login", {
      method: "POST",
      body: { email: "auth-test@test.com", password: "wrong-password" },
    });
    const wrongPasswordRes = await loginPOST(wrongPasswordReq);

    // Mismo status y mismo mensaje: el endpoint no puede usarse como oráculo
    // de qué emails están registrados.
    expect(unknownEmailRes.status).toBe(401);
    expect(wrongPasswordRes.status).toBe(401);
    expect(await unknownEmailRes.json()).toEqual(await wrongPasswordRes.json());
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
    await resetAuthLimits("auth-test@test.com");

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

  // -----------------------------------------------------------------------
  // 8. Rotación de refresh tokens y detección de reuso
  // -----------------------------------------------------------------------
  test("reusar un refresh token ya rotado revoca la sesión entera", async () => {
    await resetAuthLimits("auth-test@test.com");

    const loginReq = await createTestRequest("/api/auth/login", {
      method: "POST",
      body: { email: "auth-test@test.com", password: "password123" },
    });
    const loginRes = await loginPOST(loginReq);
    expect(loginRes.status).toBe(200);
    const { refreshToken: originalToken } = await loginRes.json();

    // Rotación normal: el refresh devuelve un token distinto al usado.
    const rotateReq = await createTestRequest("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken: originalToken },
    });
    const rotateRes = await refreshPOST(rotateReq);
    expect(rotateRes.status).toBe(200);
    const { refreshToken: rotatedToken } = await rotateRes.json();
    expect(rotatedToken).not.toBe(originalToken);

    // Reusar el token viejo: firma válida y no expirado, pero ya rotado.
    const replayReq = await createTestRequest("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken: originalToken },
    });
    expect((await refreshPOST(replayReq)).status).toBe(401);

    // Y el reuso mata la sesión completa: el token legítimo tampoco sirve,
    // así que un ladrón no puede quedarse con la sesión del usuario.
    const afterReplayReq = await createTestRequest("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken: rotatedToken },
    });
    expect((await refreshPOST(afterReplayReq)).status).toBe(401);
  });
});
