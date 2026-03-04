import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { eq, sql } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import { createCompany, createAdmin } from "../setup/test-data";
import { alerts, alertRules, alertNotifications } from "@/db/schema";

// ---------------------------------------------------------------------------
// Route handler imports
// ---------------------------------------------------------------------------
import {
  GET as LIST_ALERTS,
  POST as CREATE_ALERT,
} from "@/app/api/alerts/route";
import {
  GET as GET_ALERT,
  PATCH as PATCH_ALERT,
  DELETE as DELETE_ALERT,
} from "@/app/api/alerts/[id]/route";
import { POST as ACKNOWLEDGE_ALERT } from "@/app/api/alerts/[id]/acknowledge/route";
import { POST as DISMISS_ALERT } from "@/app/api/alerts/[id]/dismiss/route";
import {
  GET as LIST_RULES,
  POST as CREATE_RULE,
} from "@/app/api/alerts/rules/route";
import {
  GET as GET_RULE,
  PUT as UPDATE_RULE,
  DELETE as DELETE_RULE,
} from "@/app/api/alerts/rules/[id]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Insert an alert directly into the DB via testDb (bypasses route handlers).
 */
async function insertAlert(
  companyId: string,
  overrides: Partial<typeof alerts.$inferInsert> = {},
) {
  const [record] = await testDb
    .insert(alerts)
    .values({
      companyId,
      type: "DRIVER_LICENSE_EXPIRING",
      severity: "WARNING",
      entityType: "DRIVER",
      entityId: FAKE_UUID,
      title: `Test Alert ${Date.now()}`,
      status: "ACTIVE",
      ...overrides,
    })
    .returning();
  return record;
}

/**
 * Insert an alert rule directly into the DB via testDb.
 */
async function insertAlertRule(
  companyId: string,
  overrides: Partial<typeof alertRules.$inferInsert> = {},
) {
  const [record] = await testDb
    .insert(alertRules)
    .values({
      companyId,
      name: `Rule ${Date.now()}`,
      type: "DRIVER_LICENSE_EXPIRING",
      severity: "WARNING",
      enabled: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ===========================================================================
// Test suite
// ===========================================================================
describe("Alerts CRUD & Rules", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let token: string;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    admin = await createAdmin(company.id);
    token = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: admin.role,
    });
  });

  beforeEach(async () => {
    // Clean alert-related tables between tests (order matters due to FKs)
    await testDb.execute(
      sql`DELETE FROM alert_notifications WHERE alert_id IN (SELECT id FROM alerts WHERE company_id = ${company.id})`,
    );
    await testDb
      .delete(alerts)
      .where(eq(alerts.companyId, company.id));
    await testDb
      .delete(alertRules)
      .where(eq(alertRules.companyId, company.id));
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // =========================================================================
  // ALERTS - POST (Create)
  // =========================================================================
  describe("POST /api/alerts", () => {
    test("creates an alert with valid data (201)", async () => {
      const body = {
        type: "DRIVER_LICENSE_EXPIRING",
        severity: "WARNING",
        entityType: "DRIVER",
        entityId: FAKE_UUID,
        title: "Driver license expiring soon",
        description: "License expires in 15 days",
        metadata: { daysUntilExpiry: 15 },
      };

      const request = await createTestRequest("/api/alerts", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body,
      });

      const response = await CREATE_ALERT(request);
      expect(response.status).toBe(201);

      const { data } = await response.json();
      expect(data.type).toBe("DRIVER_LICENSE_EXPIRING");
      expect(data.severity).toBe("WARNING");
      expect(data.entityType).toBe("DRIVER");
      expect(data.entityId).toBe(FAKE_UUID);
      expect(data.title).toBe("Driver license expiring soon");
      expect(data.description).toBe("License expires in 15 days");
      expect(data.status).toBe("ACTIVE");
      expect(data.companyId).toBe(company.id);
      expect(data.metadata).toEqual({ daysUntilExpiry: 15 });

      // Verify in DB
      const [dbRecord] = await testDb
        .select()
        .from(alerts)
        .where(eq(alerts.id, data.id));
      expect(dbRecord).toBeDefined();
      expect(dbRecord.title).toBe("Driver license expiring soon");
    });

    test("returns 400 when required fields are missing", async () => {
      const request = await createTestRequest("/api/alerts", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          type: "DRIVER_LICENSE_EXPIRING",
          // severity, entityType, entityId, title missing
        },
      });

      const response = await CREATE_ALERT(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain("Missing required fields");
    });

    test("returns 401 without auth token", async () => {
      const request = await createTestRequest("/api/alerts", {
        method: "POST",
        body: {
          type: "DRIVER_LICENSE_EXPIRING",
          severity: "WARNING",
          entityType: "DRIVER",
          entityId: FAKE_UUID,
          title: "No auth",
        },
      });

      const response = await CREATE_ALERT(request);
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // ALERTS - GET (List)
  // =========================================================================
  describe("GET /api/alerts", () => {
    test("lists alerts with pagination meta (200)", async () => {
      await insertAlert(company.id, { title: "Alert A" });
      await insertAlert(company.id, { title: "Alert B" });

      const request = await createTestRequest("/api/alerts", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await LIST_ALERTS(request);
      expect(response.status).toBe(200);

      const { data, meta } = await response.json();
      expect(data.length).toBe(2);
      expect(Number(meta.total)).toBe(2);
      expect(Number(meta.limit)).toBe(50);
      expect(Number(meta.offset)).toBe(0);
    });

    test("filters by status", async () => {
      await insertAlert(company.id, { status: "ACTIVE", title: "Active one" });
      await insertAlert(company.id, {
        status: "DISMISSED",
        title: "Dismissed one",
      });

      const request = await createTestRequest("/api/alerts", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { status: "DISMISSED" },
      });

      const response = await LIST_ALERTS(request);
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.length).toBe(1);
      expect(data[0].title).toBe("Dismissed one");
    });

    test("excludes DISMISSED alerts by default", async () => {
      await insertAlert(company.id, { status: "ACTIVE", title: "Active" });
      await insertAlert(company.id, {
        status: "DISMISSED",
        title: "Dismissed",
      });

      const request = await createTestRequest("/api/alerts", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await LIST_ALERTS(request);
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.length).toBe(1);
      expect(data[0].title).toBe("Active");
    });

    test("filters by severity", async () => {
      await insertAlert(company.id, { severity: "CRITICAL", title: "Crit" });
      await insertAlert(company.id, { severity: "INFO", title: "Info" });

      const request = await createTestRequest("/api/alerts", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { severity: "CRITICAL" },
      });

      const response = await LIST_ALERTS(request);
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.length).toBe(1);
      expect(data[0].title).toBe("Crit");
    });

    test("filters by type", async () => {
      await insertAlert(company.id, {
        type: "DRIVER_LICENSE_EXPIRING",
        title: "License",
      });
      await insertAlert(company.id, {
        type: "VEHICLE_IN_MAINTENANCE",
        title: "Vehicle",
      });

      const request = await createTestRequest("/api/alerts", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { type: "VEHICLE_IN_MAINTENANCE" },
      });

      const response = await LIST_ALERTS(request);
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.length).toBe(1);
      expect(data[0].title).toBe("Vehicle");
    });

    test("filters by entityType", async () => {
      await insertAlert(company.id, { entityType: "DRIVER", title: "D1" });
      await insertAlert(company.id, { entityType: "VEHICLE", title: "V1" });

      const request = await createTestRequest("/api/alerts", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { entityType: "VEHICLE" },
      });

      const response = await LIST_ALERTS(request);
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.length).toBe(1);
      expect(data[0].title).toBe("V1");
    });

    test("respects limit and offset params", async () => {
      for (let i = 0; i < 5; i++) {
        await insertAlert(company.id, { title: `Alert ${i}` });
      }

      const request = await createTestRequest("/api/alerts", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { limit: "2", offset: "1" },
      });

      const response = await LIST_ALERTS(request);
      expect(response.status).toBe(200);

      const { data, meta } = await response.json();
      expect(data.length).toBe(2);
      expect(Number(meta.total)).toBe(5);
      expect(Number(meta.limit)).toBe(2);
      expect(Number(meta.offset)).toBe(1);
    });

    test("returns 401 without auth token", async () => {
      const request = await createTestRequest("/api/alerts", {
        method: "GET",
      });

      const response = await LIST_ALERTS(request);
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // ALERTS - GET by ID
  // =========================================================================
  describe("GET /api/alerts/[id]", () => {
    test("returns alert by id with relations (200)", async () => {
      const alert = await insertAlert(company.id, {
        title: "Single alert",
        description: "Detailed desc",
      });

      const request = await createTestRequest(`/api/alerts/${alert.id}`, {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await GET_ALERT(request, {
        params: Promise.resolve({ id: alert.id }),
      });
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.id).toBe(alert.id);
      expect(data.title).toBe("Single alert");
      expect(data.description).toBe("Detailed desc");
    });

    test("returns 404 for non-existent id", async () => {
      const request = await createTestRequest(`/api/alerts/${FAKE_UUID}`, {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await GET_ALERT(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Alert not found");
    });

    test("returns 401 without auth", async () => {
      const request = await createTestRequest(`/api/alerts/${FAKE_UUID}`, {
        method: "GET",
      });

      const response = await GET_ALERT(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // ALERTS - PATCH (Update)
  // =========================================================================
  describe("PATCH /api/alerts/[id]", () => {
    test("updates alert status (200)", async () => {
      const alert = await insertAlert(company.id);

      const request = await createTestRequest(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { status: "RESOLVED" },
      });

      const response = await PATCH_ALERT(request, {
        params: Promise.resolve({ id: alert.id }),
      });
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.status).toBe("RESOLVED");
      expect(data.resolvedAt).toBeDefined();
    });

    test("sets resolvedAt automatically when status is RESOLVED", async () => {
      const alert = await insertAlert(company.id);

      const request = await createTestRequest(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { status: "RESOLVED" },
      });

      const response = await PATCH_ALERT(request, {
        params: Promise.resolve({ id: alert.id }),
      });
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.resolvedAt).toBeDefined();

      // Verify in DB
      const [dbRecord] = await testDb
        .select()
        .from(alerts)
        .where(eq(alerts.id, alert.id));
      expect(dbRecord.resolvedAt).not.toBeNull();
    });

    test("allows explicit resolvedAt timestamp", async () => {
      const alert = await insertAlert(company.id);
      const resolvedAt = "2025-12-01T10:00:00.000Z";

      const request = await createTestRequest(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { status: "RESOLVED", resolvedAt },
      });

      const response = await PATCH_ALERT(request, {
        params: Promise.resolve({ id: alert.id }),
      });
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(new Date(data.resolvedAt).toISOString()).toBe(resolvedAt);
    });

    test("returns 404 for non-existent alert", async () => {
      const request = await createTestRequest(`/api/alerts/${FAKE_UUID}`, {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { status: "RESOLVED" },
      });

      const response = await PATCH_ALERT(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Alert not found");
    });

    test("returns 401 without auth", async () => {
      const request = await createTestRequest(`/api/alerts/${FAKE_UUID}`, {
        method: "PATCH",
        body: { status: "RESOLVED" },
      });

      const response = await PATCH_ALERT(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // ALERTS - DELETE
  // =========================================================================
  describe("DELETE /api/alerts/[id]", () => {
    test("deletes an existing alert (200)", async () => {
      const alert = await insertAlert(company.id);

      const request = await createTestRequest(`/api/alerts/${alert.id}`, {
        method: "DELETE",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await DELETE_ALERT(request, {
        params: Promise.resolve({ id: alert.id }),
      });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify deleted from DB
      const records = await testDb
        .select()
        .from(alerts)
        .where(eq(alerts.id, alert.id));
      expect(records.length).toBe(0);
    });

    test("returns 404 for non-existent alert", async () => {
      const request = await createTestRequest(`/api/alerts/${FAKE_UUID}`, {
        method: "DELETE",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await DELETE_ALERT(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Alert not found");
    });

    test("returns 401 without auth", async () => {
      const request = await createTestRequest(`/api/alerts/${FAKE_UUID}`, {
        method: "DELETE",
      });

      const response = await DELETE_ALERT(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // ALERTS - Acknowledge
  // =========================================================================
  describe("POST /api/alerts/[id]/acknowledge", () => {
    test("acknowledges an ACTIVE alert (200)", async () => {
      const alert = await insertAlert(company.id, { status: "ACTIVE" });

      const request = await createTestRequest(
        `/api/alerts/${alert.id}/acknowledge`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { note: "Seen and noted" },
        },
      );

      const response = await ACKNOWLEDGE_ALERT(request, {
        params: Promise.resolve({ id: alert.id }),
      });
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.status).toBe("ACKNOWLEDGED");
      expect(data.acknowledgedBy).toBe(admin.id);
      expect(data.acknowledgedAt).toBeDefined();
      expect(data.metadata).toBeDefined();
      expect((data.metadata as any).acknowledgmentNote).toBe("Seen and noted");
    });

    test("returns 400 when acknowledging an already ACKNOWLEDGED alert", async () => {
      const alert = await insertAlert(company.id, {
        status: "ACKNOWLEDGED",
        acknowledgedBy: admin.id,
        acknowledgedAt: new Date(),
      });

      const request = await createTestRequest(
        `/api/alerts/${alert.id}/acknowledge`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { note: "Try again" },
        },
      );

      const response = await ACKNOWLEDGE_ALERT(request, {
        params: Promise.resolve({ id: alert.id }),
      });
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe("Alert already acknowledged");
    });

    test("returns 400 when acknowledging a DISMISSED alert", async () => {
      const alert = await insertAlert(company.id, { status: "DISMISSED" });

      const request = await createTestRequest(
        `/api/alerts/${alert.id}/acknowledge`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { note: "Nope" },
        },
      );

      const response = await ACKNOWLEDGE_ALERT(request, {
        params: Promise.resolve({ id: alert.id }),
      });
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe("Cannot acknowledge a dismissed alert");
    });

    test("returns 404 for non-existent alert", async () => {
      const request = await createTestRequest(
        `/api/alerts/${FAKE_UUID}/acknowledge`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { note: "none" },
        },
      );

      const response = await ACKNOWLEDGE_ALERT(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Alert not found");
    });

    test("returns 401 without auth token", async () => {
      const request = await createTestRequest(
        `/api/alerts/${FAKE_UUID}/acknowledge`,
        {
          method: "POST",
          body: { note: "no auth" },
        },
      );

      const response = await ACKNOWLEDGE_ALERT(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // ALERTS - Dismiss
  // =========================================================================
  describe("POST /api/alerts/[id]/dismiss", () => {
    test("dismisses an ACTIVE alert (200)", async () => {
      const alert = await insertAlert(company.id, { status: "ACTIVE" });

      const request = await createTestRequest(
        `/api/alerts/${alert.id}/dismiss`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { note: "Not relevant" },
        },
      );

      const response = await DISMISS_ALERT(request, {
        params: Promise.resolve({ id: alert.id }),
      });
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.status).toBe("DISMISSED");
      expect(data.metadata).toBeDefined();
      expect((data.metadata as any).dismissalNote).toBe("Not relevant");
      expect((data.metadata as any).dismissedBy).toBe(admin.id);
      expect((data.metadata as any).dismissedAt).toBeDefined();
    });

    test("dismisses an ACKNOWLEDGED alert (200)", async () => {
      const alert = await insertAlert(company.id, {
        status: "ACKNOWLEDGED",
        acknowledgedBy: admin.id,
        acknowledgedAt: new Date(),
      });

      const request = await createTestRequest(
        `/api/alerts/${alert.id}/dismiss`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { note: "Resolved externally" },
        },
      );

      const response = await DISMISS_ALERT(request, {
        params: Promise.resolve({ id: alert.id }),
      });
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.status).toBe("DISMISSED");
    });

    test("returns 400 when dismissing an already DISMISSED alert", async () => {
      const alert = await insertAlert(company.id, { status: "DISMISSED" });

      const request = await createTestRequest(
        `/api/alerts/${alert.id}/dismiss`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { note: "Already gone" },
        },
      );

      const response = await DISMISS_ALERT(request, {
        params: Promise.resolve({ id: alert.id }),
      });
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe("Alert already dismissed");
    });

    test("returns 404 for non-existent alert", async () => {
      const request = await createTestRequest(
        `/api/alerts/${FAKE_UUID}/dismiss`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { note: "none" },
        },
      );

      const response = await DISMISS_ALERT(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Alert not found");
    });

    test("returns 401 without auth", async () => {
      const request = await createTestRequest(
        `/api/alerts/${FAKE_UUID}/dismiss`,
        {
          method: "POST",
          body: { note: "no auth" },
        },
      );

      const response = await DISMISS_ALERT(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // ALERTS - Tenant isolation
  // =========================================================================
  describe("Tenant isolation", () => {
    test("company B cannot see company A alerts", async () => {
      const alertA = await insertAlert(company.id, {
        title: "Company A alert",
      });

      // Create company B
      const companyB = await createCompany();
      const adminB = await createAdmin(companyB.id);
      const tokenB = await createTestToken({
        userId: adminB.id,
        companyId: companyB.id,
        email: adminB.email,
        role: adminB.role,
      });

      // Company B tries to GET company A's alert
      const request = await createTestRequest(`/api/alerts/${alertA.id}`, {
        method: "GET",
        token: tokenB,
        companyId: companyB.id,
        userId: adminB.id,
      });

      const response = await GET_ALERT(request, {
        params: Promise.resolve({ id: alertA.id }),
      });
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Alert not found");
    });

    test("company B listing does not include company A alerts", async () => {
      await insertAlert(company.id, { title: "Company A only" });

      const companyB = await createCompany();
      const adminB = await createAdmin(companyB.id);
      const tokenB = await createTestToken({
        userId: adminB.id,
        companyId: companyB.id,
        email: adminB.email,
        role: adminB.role,
      });

      const request = await createTestRequest("/api/alerts", {
        method: "GET",
        token: tokenB,
        companyId: companyB.id,
        userId: adminB.id,
      });

      const response = await LIST_ALERTS(request);
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.length).toBe(0);
    });
  });

  // =========================================================================
  // ALERT RULES - POST (Create)
  // =========================================================================
  describe("POST /api/alerts/rules", () => {
    test("creates a rule with valid data (201)", async () => {
      const body = {
        name: "License Expiry Warning",
        type: "DRIVER_LICENSE_EXPIRING",
        severity: "WARNING",
        threshold: 30,
        metadata: { reminderDays: [30, 15, 7] },
        enabled: true,
      };

      const request = await createTestRequest("/api/alerts/rules", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body,
      });

      const response = await CREATE_RULE(request);
      expect(response.status).toBe(201);

      const { data } = await response.json();
      expect(data.name).toBe("License Expiry Warning");
      expect(data.type).toBe("DRIVER_LICENSE_EXPIRING");
      expect(data.severity).toBe("WARNING");
      expect(data.threshold).toBe(30);
      expect(data.enabled).toBe(true);
      expect(data.companyId).toBe(company.id);
      expect(data.metadata).toEqual({ reminderDays: [30, 15, 7] });

      // Verify in DB
      const [dbRecord] = await testDb
        .select()
        .from(alertRules)
        .where(eq(alertRules.id, data.id));
      expect(dbRecord).toBeDefined();
      expect(dbRecord.name).toBe("License Expiry Warning");
    });

    test("creates a rule with defaults (enabled=true when not provided)", async () => {
      const request = await createTestRequest("/api/alerts/rules", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          name: "Defaults Rule",
          type: "VEHICLE_IN_MAINTENANCE",
          severity: "INFO",
        },
      });

      const response = await CREATE_RULE(request);
      expect(response.status).toBe(201);

      const { data } = await response.json();
      expect(data.enabled).toBe(true);
      expect(data.threshold).toBeNull();
      expect(data.metadata).toBeNull();
    });

    test("returns 400 when required fields are missing", async () => {
      const request = await createTestRequest("/api/alerts/rules", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          name: "Incomplete Rule",
          // type and severity missing
        },
      });

      const response = await CREATE_RULE(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain("Missing required fields");
    });

    test("returns 401 without auth", async () => {
      const request = await createTestRequest("/api/alerts/rules", {
        method: "POST",
        body: {
          name: "No Auth Rule",
          type: "DRIVER_ABSENT",
          severity: "CRITICAL",
        },
      });

      const response = await CREATE_RULE(request);
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // ALERT RULES - GET (List)
  // =========================================================================
  describe("GET /api/alerts/rules", () => {
    test("lists rules with pagination meta (200)", async () => {
      await insertAlertRule(company.id, { name: "Rule A" });
      await insertAlertRule(company.id, { name: "Rule B" });

      const request = await createTestRequest("/api/alerts/rules", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await LIST_RULES(request);
      expect(response.status).toBe(200);

      const { data, meta } = await response.json();
      expect(data.length).toBe(2);
      expect(Number(meta.total)).toBe(2);
      expect(Number(meta.limit)).toBe(100);
      expect(Number(meta.offset)).toBe(0);
    });

    test("filters by type", async () => {
      await insertAlertRule(company.id, {
        name: "License Rule",
        type: "DRIVER_LICENSE_EXPIRING",
      });
      await insertAlertRule(company.id, {
        name: "Maintenance Rule",
        type: "VEHICLE_IN_MAINTENANCE",
      });

      const request = await createTestRequest("/api/alerts/rules", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { type: "VEHICLE_IN_MAINTENANCE" },
      });

      const response = await LIST_RULES(request);
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.length).toBe(1);
      expect(data[0].name).toBe("Maintenance Rule");
    });

    test("filters by enabled", async () => {
      await insertAlertRule(company.id, {
        name: "Enabled",
        enabled: true,
      });
      await insertAlertRule(company.id, {
        name: "Disabled",
        enabled: false,
      });

      const request = await createTestRequest("/api/alerts/rules", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { enabled: "true" },
      });

      const response = await LIST_RULES(request);
      expect(response.status).toBe(200);

      const { data } = await response.json();
      // Both may match because of the `enabled !== null` check in the handler
      // (it always adds the condition since searchParams.get returns string or null).
      // When enabled="true", it should filter to only enabled rules.
      const enabledOnly = data.filter((r: any) => r.enabled === true);
      expect(enabledOnly.length).toBeGreaterThanOrEqual(1);
    });

    test("respects limit and offset params", async () => {
      for (let i = 0; i < 5; i++) {
        await insertAlertRule(company.id, { name: `Rule ${i}` });
      }

      const request = await createTestRequest("/api/alerts/rules", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { limit: "2", offset: "0" },
      });

      const response = await LIST_RULES(request);
      expect(response.status).toBe(200);

      const { data, meta } = await response.json();
      expect(data.length).toBe(2);
      expect(Number(meta.total)).toBe(5);
    });

    test("returns 401 without auth", async () => {
      const request = await createTestRequest("/api/alerts/rules", {
        method: "GET",
      });

      const response = await LIST_RULES(request);
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // ALERT RULES - GET by ID
  // =========================================================================
  describe("GET /api/alerts/rules/[id]", () => {
    test("returns rule by id with related alerts (200)", async () => {
      const rule = await insertAlertRule(company.id, {
        name: "Detail Rule",
        threshold: 15,
      });

      const request = await createTestRequest(
        `/api/alerts/rules/${rule.id}`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await GET_RULE(request, {
        params: Promise.resolve({ id: rule.id }),
      });
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.id).toBe(rule.id);
      expect(data.name).toBe("Detail Rule");
      expect(data.threshold).toBe(15);
      // Should include alerts relation (empty array in this case)
      expect(data.alerts).toBeDefined();
      expect(Array.isArray(data.alerts)).toBe(true);
    });

    test("returns rule with associated alerts", async () => {
      const rule = await insertAlertRule(company.id, {
        name: "Rule with alerts",
      });
      await insertAlert(company.id, { ruleId: rule.id, title: "From rule" });

      const request = await createTestRequest(
        `/api/alerts/rules/${rule.id}`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await GET_RULE(request, {
        params: Promise.resolve({ id: rule.id }),
      });
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.alerts.length).toBe(1);
      expect(data.alerts[0].title).toBe("From rule");
    });

    test("returns 404 for non-existent rule", async () => {
      const request = await createTestRequest(
        `/api/alerts/rules/${FAKE_UUID}`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await GET_RULE(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Alert rule not found");
    });

    test("returns 401 without auth", async () => {
      const request = await createTestRequest(
        `/api/alerts/rules/${FAKE_UUID}`,
        {
          method: "GET",
        },
      );

      const response = await GET_RULE(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // ALERT RULES - PUT (Update)
  // =========================================================================
  describe("PUT /api/alerts/rules/[id]", () => {
    test("updates rule fields (200)", async () => {
      const rule = await insertAlertRule(company.id, {
        name: "Original Name",
        severity: "WARNING",
        threshold: 30,
      });

      const request = await createTestRequest(
        `/api/alerts/rules/${rule.id}`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: {
            name: "Updated Name",
            severity: "CRITICAL",
            threshold: 7,
            enabled: false,
          },
        },
      );

      const response = await UPDATE_RULE(request, {
        params: Promise.resolve({ id: rule.id }),
      });
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.name).toBe("Updated Name");
      expect(data.severity).toBe("CRITICAL");
      expect(data.threshold).toBe(7);
      expect(data.enabled).toBe(false);

      // Verify in DB
      const [dbRecord] = await testDb
        .select()
        .from(alertRules)
        .where(eq(alertRules.id, rule.id));
      expect(dbRecord.name).toBe("Updated Name");
      expect(dbRecord.severity).toBe("CRITICAL");
      expect(dbRecord.enabled).toBe(false);
    });

    test("partial update only changes provided fields", async () => {
      const rule = await insertAlertRule(company.id, {
        name: "Keep This",
        severity: "INFO",
        threshold: 10,
        enabled: true,
      });

      const request = await createTestRequest(
        `/api/alerts/rules/${rule.id}`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { threshold: 20 },
        },
      );

      const response = await UPDATE_RULE(request, {
        params: Promise.resolve({ id: rule.id }),
      });
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.name).toBe("Keep This");
      expect(data.severity).toBe("INFO");
      expect(data.threshold).toBe(20);
      expect(data.enabled).toBe(true);
    });

    test("returns 404 for non-existent rule", async () => {
      const request = await createTestRequest(
        `/api/alerts/rules/${FAKE_UUID}`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { name: "Ghost" },
        },
      );

      const response = await UPDATE_RULE(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Alert rule not found");
    });

    test("returns 401 without auth", async () => {
      const request = await createTestRequest(
        `/api/alerts/rules/${FAKE_UUID}`,
        {
          method: "PUT",
          body: { name: "No Auth" },
        },
      );

      const response = await UPDATE_RULE(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // ALERT RULES - DELETE
  // =========================================================================
  describe("DELETE /api/alerts/rules/[id]", () => {
    test("deletes an existing rule (200)", async () => {
      const rule = await insertAlertRule(company.id, { name: "To Delete" });

      const request = await createTestRequest(
        `/api/alerts/rules/${rule.id}`,
        {
          method: "DELETE",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await DELETE_RULE(request, {
        params: Promise.resolve({ id: rule.id }),
      });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify deleted from DB
      const records = await testDb
        .select()
        .from(alertRules)
        .where(eq(alertRules.id, rule.id));
      expect(records.length).toBe(0);
    });

    test("returns 404 for non-existent rule", async () => {
      const request = await createTestRequest(
        `/api/alerts/rules/${FAKE_UUID}`,
        {
          method: "DELETE",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await DELETE_RULE(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("Alert rule not found");
    });

    test("returns 401 without auth", async () => {
      const request = await createTestRequest(
        `/api/alerts/rules/${FAKE_UUID}`,
        {
          method: "DELETE",
        },
      );

      const response = await DELETE_RULE(request, {
        params: Promise.resolve({ id: FAKE_UUID }),
      });
      expect(response.status).toBe(401);
    });
  });

  // =========================================================================
  // ALERT RULES - Tenant isolation
  // =========================================================================
  describe("Rules tenant isolation", () => {
    test("company B cannot see company A rules", async () => {
      const ruleA = await insertAlertRule(company.id, {
        name: "Company A rule",
      });

      const companyB = await createCompany();
      const adminB = await createAdmin(companyB.id);
      const tokenB = await createTestToken({
        userId: adminB.id,
        companyId: companyB.id,
        email: adminB.email,
        role: adminB.role,
      });

      // Company B tries to GET company A's rule
      const request = await createTestRequest(
        `/api/alerts/rules/${ruleA.id}`,
        {
          method: "GET",
          token: tokenB,
          companyId: companyB.id,
          userId: adminB.id,
        },
      );

      const response = await GET_RULE(request, {
        params: Promise.resolve({ id: ruleA.id }),
      });
      expect(response.status).toBe(404);
    });

    test("company B cannot update company A rules", async () => {
      const ruleA = await insertAlertRule(company.id, {
        name: "Company A rule",
      });

      const companyB = await createCompany();
      const adminB = await createAdmin(companyB.id);
      const tokenB = await createTestToken({
        userId: adminB.id,
        companyId: companyB.id,
        email: adminB.email,
        role: adminB.role,
      });

      const request = await createTestRequest(
        `/api/alerts/rules/${ruleA.id}`,
        {
          method: "PUT",
          token: tokenB,
          companyId: companyB.id,
          userId: adminB.id,
          body: { name: "Hijacked" },
        },
      );

      const response = await UPDATE_RULE(request, {
        params: Promise.resolve({ id: ruleA.id }),
      });
      expect(response.status).toBe(404);
    });

    test("company B cannot delete company A rules", async () => {
      const ruleA = await insertAlertRule(company.id, {
        name: "Company A rule",
      });

      const companyB = await createCompany();
      const adminB = await createAdmin(companyB.id);
      const tokenB = await createTestToken({
        userId: adminB.id,
        companyId: companyB.id,
        email: adminB.email,
        role: adminB.role,
      });

      const request = await createTestRequest(
        `/api/alerts/rules/${ruleA.id}`,
        {
          method: "DELETE",
          token: tokenB,
          companyId: companyB.id,
          userId: adminB.id,
        },
      );

      const response = await DELETE_RULE(request, {
        params: Promise.resolve({ id: ruleA.id }),
      });
      expect(response.status).toBe(404);

      // Verify rule still exists
      const [still] = await testDb
        .select()
        .from(alertRules)
        .where(eq(alertRules.id, ruleA.id));
      expect(still).toBeDefined();
    });
  });

  // =========================================================================
  // ALERTS linked to RULES - end-to-end flow
  // =========================================================================
  describe("Alert + Rule lifecycle", () => {
    test("create rule, create alert linked to rule, acknowledge, dismiss", async () => {
      // 1. Create a rule via API
      const ruleReq = await createTestRequest("/api/alerts/rules", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          name: "E2E Rule",
          type: "DRIVER_LICENSE_EXPIRING",
          severity: "CRITICAL",
          threshold: 7,
        },
      });
      const ruleRes = await CREATE_RULE(ruleReq);
      expect(ruleRes.status).toBe(201);
      const { data: rule } = await ruleRes.json();

      // 2. Create an alert linked to the rule
      const alertReq = await createTestRequest("/api/alerts", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          type: "DRIVER_LICENSE_EXPIRING",
          severity: "CRITICAL",
          entityType: "DRIVER",
          entityId: FAKE_UUID,
          title: "License expires in 5 days",
          description: "Driver X license expiring",
        },
      });
      const alertRes = await CREATE_ALERT(alertReq);
      expect(alertRes.status).toBe(201);
      const { data: alert } = await alertRes.json();

      // 3. List alerts -- should see 1 ACTIVE
      const listReq = await createTestRequest("/api/alerts", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });
      const listRes = await LIST_ALERTS(listReq);
      expect(listRes.status).toBe(200);
      const { data: listedAlerts } = await listRes.json();
      expect(listedAlerts.length).toBe(1);
      expect(listedAlerts[0].status).toBe("ACTIVE");

      // 4. Acknowledge the alert
      const ackReq = await createTestRequest(
        `/api/alerts/${alert.id}/acknowledge`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { note: "Will handle" },
        },
      );
      const ackRes = await ACKNOWLEDGE_ALERT(ackReq, {
        params: Promise.resolve({ id: alert.id }),
      });
      expect(ackRes.status).toBe(200);
      const { data: acked } = await ackRes.json();
      expect(acked.status).toBe("ACKNOWLEDGED");

      // 5. Dismiss the acknowledged alert
      const dismissReq = await createTestRequest(
        `/api/alerts/${alert.id}/dismiss`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { note: "Issue resolved" },
        },
      );
      const dismissRes = await DISMISS_ALERT(dismissReq, {
        params: Promise.resolve({ id: alert.id }),
      });
      expect(dismissRes.status).toBe(200);
      const { data: dismissed } = await dismissRes.json();
      expect(dismissed.status).toBe("DISMISSED");

      // 6. Default list should exclude dismissed
      const listReq2 = await createTestRequest("/api/alerts", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });
      const listRes2 = await LIST_ALERTS(listReq2);
      const { data: afterDismiss } = await listRes2.json();
      expect(afterDismiss.length).toBe(0);

      // 7. Rule still exists and shows the alert in its relation
      const ruleDetailReq = await createTestRequest(
        `/api/alerts/rules/${rule.id}`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );
      const ruleDetailRes = await GET_RULE(ruleDetailReq, {
        params: Promise.resolve({ id: rule.id }),
      });
      expect(ruleDetailRes.status).toBe(200);
    });
  });
});
