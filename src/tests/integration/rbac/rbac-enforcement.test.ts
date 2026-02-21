/**
 * RBAC enforcement integration tests.
 *
 * Verifies that route handlers correctly enforce role-based permissions:
 * - Each role can only access endpoints allowed by ROLE_PERMISSIONS
 * - Missing / invalid tokens return 401
 * - Tenant isolation prevents cross-company data leaks
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createPlanner,
  createMonitor,
  createFleetAdmin,
  createDriver,
  createOrder,
} from "../setup/test-data";
import {
  GET as getOrders,
  POST as createOrderRoute,
} from "@/app/api/orders/route";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
let companyA: { id: string };
let companyB: { id: string };

let adminUser: { id: string; email: string; role: string };
let plannerUser: { id: string; email: string; role: string; companyId: string };
let monitorUser: { id: string; email: string; role: string; companyId: string };
let fleetAdminUser: { id: string; email: string; role: string; companyId: string };
let driverUser: { id: string; email: string; role: string; companyId: string };

// Company B user for tenant isolation
let companyBUser: { id: string; email: string; role: string; companyId: string };

beforeAll(async () => {
  await cleanDatabase();

  // Create two companies
  companyA = await createCompany({ commercialName: "RBAC Company A" });
  companyB = await createCompany({ commercialName: "RBAC Company B" });

  // Create users with different roles (all in company A except admin)
  adminUser = await createAdmin(null);
  plannerUser = await createPlanner(companyA.id);
  monitorUser = await createMonitor(companyA.id);
  fleetAdminUser = await createFleetAdmin(companyA.id);
  driverUser = await createDriver(companyA.id);

  // Company B planner for tenant isolation test
  companyBUser = await createPlanner(companyB.id);
});

afterAll(async () => {
  await cleanDatabase();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a token for the given user record. */
async function tokenFor(user: {
  id: string;
  email: string;
  role: string;
  companyId?: string | null;
}) {
  return createTestToken({
    userId: user.id,
    companyId: user.companyId ?? null,
    email: user.email,
    role: user.role,
  });
}

/** Standard order body used for POST tests. */
function orderBody() {
  return {
    trackingId: `TRK-RBAC-${Date.now()}`,
    address: "Av. Test 123, Lima",
    latitude: "-12.0464",
    longitude: "-77.0428",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RBAC enforcement", () => {
  // ---- ADMIN_SISTEMA -------------------------------------------------------
  describe("ADMIN_SISTEMA", () => {
    test("can read orders", async () => {
      const token = await tokenFor(adminUser);
      const req = await createTestRequest("/api/orders", {
        token,
        companyId: companyA.id,
      });

      const res = await getOrders(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("data");
    });

    test("can create orders", async () => {
      const token = await tokenFor(adminUser);
      const req = await createTestRequest("/api/orders", {
        method: "POST",
        token,
        companyId: companyA.id,
        body: orderBody(),
      });

      const res = await createOrderRoute(req);
      expect(res.status).toBe(201);
    });
  });

  // ---- PLANIFICADOR --------------------------------------------------------
  describe("PLANIFICADOR", () => {
    test("can read orders", async () => {
      const token = await tokenFor(plannerUser);
      const req = await createTestRequest("/api/orders", {
        token,
        companyId: companyA.id,
      });

      const res = await getOrders(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("data");
    });

    test("can create orders", async () => {
      const token = await tokenFor(plannerUser);
      const req = await createTestRequest("/api/orders", {
        method: "POST",
        token,
        companyId: companyA.id,
        body: orderBody(),
      });

      const res = await createOrderRoute(req);
      expect(res.status).toBe(201);
    });
  });

  // ---- CONDUCTOR -----------------------------------------------------------
  describe("CONDUCTOR", () => {
    test("can read orders", async () => {
      const token = await tokenFor(driverUser);
      const req = await createTestRequest("/api/orders", {
        token,
        companyId: companyA.id,
      });

      const res = await getOrders(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("data");
    });

    test("cannot create orders", async () => {
      const token = await tokenFor(driverUser);
      const req = await createTestRequest("/api/orders", {
        method: "POST",
        token,
        companyId: companyA.id,
        body: orderBody(),
      });

      const res = await createOrderRoute(req);
      expect(res.status).toBe(403);
    });
  });

  // ---- MONITOR -------------------------------------------------------------
  describe("MONITOR", () => {
    test("can read orders", async () => {
      const token = await tokenFor(monitorUser);
      const req = await createTestRequest("/api/orders", {
        token,
        companyId: companyA.id,
      });

      const res = await getOrders(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("data");
    });

    test("cannot create orders", async () => {
      const token = await tokenFor(monitorUser);
      const req = await createTestRequest("/api/orders", {
        method: "POST",
        token,
        companyId: companyA.id,
        body: orderBody(),
      });

      const res = await createOrderRoute(req);
      expect(res.status).toBe(403);
    });
  });

  // ---- ADMIN_FLOTA ---------------------------------------------------------
  describe("ADMIN_FLOTA", () => {
    test("cannot create orders", async () => {
      const token = await tokenFor(fleetAdminUser);
      const req = await createTestRequest("/api/orders", {
        method: "POST",
        token,
        companyId: companyA.id,
        body: orderBody(),
      });

      const res = await createOrderRoute(req);
      expect(res.status).toBe(403);
    });
  });

  // ---- Authentication failures ---------------------------------------------
  describe("Authentication", () => {
    test("missing auth token returns 401", async () => {
      const req = await createTestRequest("/api/orders", {
        companyId: companyA.id,
      });

      const res = await getOrders(req);
      expect(res.status).toBe(401);
    });

    test("invalid token returns 401", async () => {
      const req = await createTestRequest("/api/orders", {
        token: "not-a-valid-jwt-token",
        companyId: companyA.id,
      });

      const res = await getOrders(req);
      expect(res.status).toBe(401);
    });
  });

  // ---- Tenant isolation ----------------------------------------------------
  describe("Tenant isolation", () => {
    test("user cannot see orders from another company", async () => {
      // Create an order in company A
      await createOrder({ companyId: companyA.id, trackingId: `TRK-ISO-${Date.now()}` });

      // Company B user requests orders scoped to company B
      const token = await tokenFor(companyBUser);
      const req = await createTestRequest("/api/orders", {
        token,
        companyId: companyB.id,
      });

      const res = await getOrders(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      // Company B should have no orders — the isolation-created order belongs to A
      expect(body.data).toEqual([]);
    });
  });
});
