import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { cleanDatabase } from "../setup/test-db";
import {
  createTestToken,
  createExpiredToken,
  createTestRefreshToken,
} from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import { createCompany, createUser } from "../setup/test-data";

import { GET as meGET } from "@/app/api/auth/me/route";
import { POST as refreshPOST } from "@/app/api/auth/refresh/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { GET as sessionsGET } from "@/app/api/auth/sessions/route";
import {
  GET as sessionByIdGET,
  DELETE as sessionDELETE,
} from "@/app/api/auth/sessions/[id]/route";
import { POST as invalidateAllPOST } from "@/app/api/auth/sessions/invalidate-all/route";

describe("Auth sessions & token management", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createUser>>;
  let planner: Awaited<ReturnType<typeof createUser>>;
  let driver: Awaited<ReturnType<typeof createUser>>;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    admin = await createUser({
      companyId: null as any,
      email: "admin@sessions.test",
      role: "ADMIN_SISTEMA",
    });
    planner = await createUser({
      companyId: company.id,
      email: "planner@sessions.test",
      role: "PLANIFICADOR",
    });
    driver = await createUser({
      companyId: company.id,
      email: "driver@sessions.test",
      role: "CONDUCTOR",
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // -----------------------------------------------------------------------
  // 1. GET /auth/me — returns current user profile + permissions
  // -----------------------------------------------------------------------
  test("GET /auth/me returns user profile and permissions", async () => {
    const token = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });

    const req = await createTestRequest("/api/auth/me", { token });
    const res = await meGET(req);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.id).toBe(planner.id);
    expect(data.email).toBe("planner@sessions.test");
    expect(data.role).toBe("PLANIFICADOR");
    expect(data.companyId).toBe(company.id);
    expect(data.active).toBe(true);
    expect(data.createdAt).toBeDefined();
    expect(data.permissions).toBeDefined();
    expect(Array.isArray(data.permissions)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 2. GET /auth/me — invalid token → 401
  // -----------------------------------------------------------------------
  test("GET /auth/me with invalid token returns 401", async () => {
    const req = await createTestRequest("/api/auth/me", {
      token: "not.a.valid.jwt.token",
    });
    const res = await meGET(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("No autorizado");
  });

  // -----------------------------------------------------------------------
  // 3. GET /auth/me — expired token → 401
  // -----------------------------------------------------------------------
  test("GET /auth/me with expired token returns 401", async () => {
    const token = await createExpiredToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });

    const req = await createTestRequest("/api/auth/me", { token });
    const res = await meGET(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("No autorizado");
  });

  // -----------------------------------------------------------------------
  // 4. GET /auth/me — inactive user → 403
  // -----------------------------------------------------------------------
  test("GET /auth/me with inactive user returns 403", async () => {
    const inactiveUser = await createUser({
      companyId: company.id,
      email: "inactive@sessions.test",
      active: false,
    });

    const token = await createTestToken({
      userId: inactiveUser.id,
      companyId: company.id,
      email: inactiveUser.email,
      role: inactiveUser.role,
    });

    const req = await createTestRequest("/api/auth/me", { token });
    const res = await meGET(req);

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Usuario inactivo");
  });

  // -----------------------------------------------------------------------
  // 5. POST /auth/refresh — generates new token pair
  // -----------------------------------------------------------------------
  test("POST /auth/refresh generates new token pair", async () => {
    const refreshToken = await createTestRefreshToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });

    const req = await createTestRequest("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken },
    });

    const res = await refreshPOST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.accessToken).toBeDefined();
    expect(typeof data.accessToken).toBe("string");
    expect(data.refreshToken).toBeDefined();
    expect(typeof data.refreshToken).toBe("string");
    expect(data.expiresIn).toBe(900); // 15 * 60
  });

  // -----------------------------------------------------------------------
  // 6. POST /auth/refresh — invalid refresh token → 401
  // -----------------------------------------------------------------------
  test("POST /auth/refresh with invalid token returns 401", async () => {
    const req = await createTestRequest("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken: "invalid.refresh.token" },
    });

    const res = await refreshPOST(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toBe("Token inválido");
  });

  // -----------------------------------------------------------------------
  // 7. POST /auth/refresh — access token used as refresh → 401
  // -----------------------------------------------------------------------
  test("POST /auth/refresh rejects an access token", async () => {
    const accessToken = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });

    const req = await createTestRequest("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken: accessToken },
    });

    const res = await refreshPOST(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toBe("Token inválido");
  });

  // -----------------------------------------------------------------------
  // 8. POST /auth/logout — clears session
  // -----------------------------------------------------------------------
  test("POST /auth/logout returns success", async () => {
    const req = await createTestRequest("/api/auth/logout", {
      method: "POST",
    });

    const res = await logoutPOST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("Sesión cerrada correctamente");
  });

  // -----------------------------------------------------------------------
  // 9. GET /auth/sessions — lists user sessions
  // -----------------------------------------------------------------------
  test("GET /auth/sessions lists sessions for authenticated user", async () => {
    const token = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });

    const req = await createTestRequest("/api/auth/sessions", { token });
    const res = await sessionsGET(req);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("sessions");
    expect(Array.isArray(data.sessions)).toBe(true);
    expect(data).toHaveProperty("count");
    expect(typeof data.count).toBe("number");
  });

  // -----------------------------------------------------------------------
  // 10. GET /auth/sessions — unauthenticated → 401
  // -----------------------------------------------------------------------
  test("GET /auth/sessions without token returns 401", async () => {
    const req = await createTestRequest("/api/auth/sessions");
    const res = await sessionsGET(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Failed to get sessions");
  });

  // -----------------------------------------------------------------------
  // 11. DELETE /auth/sessions/[id] — session not found → 404
  // -----------------------------------------------------------------------
  test("DELETE /auth/sessions/[id] with non-existent session returns 404", async () => {
    const token = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: planner.role,
    });

    const req = await createTestRequest("/api/auth/sessions/nonexistent-id", {
      method: "DELETE",
      token,
    });

    const res = await sessionDELETE(req, {
      params: Promise.resolve({ id: "nonexistent-id" }),
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Session not found");
  });

  // -----------------------------------------------------------------------
  // 12. DELETE /auth/sessions/[id] — another user's session → 403
  // -----------------------------------------------------------------------
  test("DELETE /auth/sessions/[id] for another user's session returns 403", async () => {
    // Import the session mock to create a session directly
    const { createSession } = await import("@/lib/auth/session");

    // Create a session owned by the admin
    const sessionId = await createSession(admin.id, {
      userAgent: "Admin Browser",
      ipAddress: "10.0.0.1",
    });

    // The driver tries to delete it
    const token = await createTestToken({
      userId: driver.id,
      companyId: company.id,
      email: driver.email,
      role: driver.role,
    });

    const req = await createTestRequest(`/api/auth/sessions/${sessionId}`, {
      method: "DELETE",
      token,
    });

    const res = await sessionDELETE(req, {
      params: Promise.resolve({ id: sessionId }),
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Access denied");
  });

  // -----------------------------------------------------------------------
  // 13. POST /auth/sessions/invalidate-all — requires ADMIN_SISTEMA
  // -----------------------------------------------------------------------
  test("POST /auth/sessions/invalidate-all succeeds for admin", async () => {
    const token = await createTestToken({
      userId: admin.id,
      companyId: null,
      email: admin.email,
      role: "ADMIN_SISTEMA",
    });

    const req = await createTestRequest("/api/auth/sessions/invalidate-all", {
      method: "POST",
      token,
    });

    const res = await invalidateAllPOST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(typeof data.count).toBe("number");
    expect(data.message).toContain("Invalidated");
  });

  // -----------------------------------------------------------------------
  // 14. POST /auth/sessions/invalidate-all — non-admin → 403
  // -----------------------------------------------------------------------
  test("POST /auth/sessions/invalidate-all denied for non-admin", async () => {
    const token = await createTestToken({
      userId: planner.id,
      companyId: company.id,
      email: planner.email,
      role: "PLANIFICADOR",
    });

    const req = await createTestRequest("/api/auth/sessions/invalidate-all", {
      method: "POST",
      token,
    });

    const res = await invalidateAllPOST(req);
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.error).toContain("Access denied");
  });
});
