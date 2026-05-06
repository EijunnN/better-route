import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { eq, and } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createPlanner,
  createOrder,
  createZone,
  createZoneVehicle,
  createVehicle,
} from "../setup/test-data";
import {
  orders,
  trackingTokens,
  companyTrackingSettings,
  zones,
  zoneVehicles,
} from "@/db/schema";

// Route handlers
import {
  GET as GET_ORDER,
  PATCH as PATCH_ORDER,
  DELETE as DELETE_ORDER,
} from "@/app/api/orders/[id]/route";
import { POST as POST_TRACKING_GENERATE } from "@/app/api/tracking/generate/route";
import {
  GET as GET_TRACKING_SETTINGS,
  PUT as PUT_TRACKING_SETTINGS,
} from "@/app/api/tracking/settings/route";
import { GET as GET_PUBLIC_TRACKING } from "@/app/api/public/tracking/[token]/route";
import {
  GET as GET_ZONE,
  PATCH as PATCH_ZONE,
  DELETE as DELETE_ZONE,
} from "@/app/api/zones/[id]/route";
import {
  GET as GET_ZONE_VEHICLES,
  POST as POST_ZONE_VEHICLES,
  DELETE as DELETE_ZONE_VEHICLES,
} from "@/app/api/zones/[id]/vehicles/route";

// ==========================================================================
// Shared test state
// ==========================================================================
let companyA: Awaited<ReturnType<typeof createCompany>>;
let companyB: Awaited<ReturnType<typeof createCompany>>;
let adminA: Awaited<ReturnType<typeof createAdmin>>;
let plannerA: Awaited<ReturnType<typeof createPlanner>>;
let plannerB: Awaited<ReturnType<typeof createPlanner>>;
let tokenAdminA: string;
let tokenPlannerA: string;
let tokenPlannerB: string;

beforeAll(async () => {
  await cleanDatabase();

  companyA = await createCompany({ commercialName: "Company A" });
  companyB = await createCompany({ commercialName: "Company B" });

  adminA = await createAdmin(null);
  plannerA = await createPlanner(companyA.id);
  plannerB = await createPlanner(companyB.id);

  tokenAdminA = await createTestToken({
    userId: adminA.id,
    companyId: companyA.id,
    email: adminA.email,
    role: adminA.role,
  });
  tokenPlannerA = await createTestToken({
    userId: plannerA.id,
    companyId: companyA.id,
    email: plannerA.email,
    role: plannerA.role,
  });
  tokenPlannerB = await createTestToken({
    userId: plannerB.id,
    companyId: companyB.id,
    email: plannerB.email,
    role: plannerB.role,
  });
});

afterAll(async () => {
  await cleanDatabase();
});

// ==========================================================================
// Order Detail (GET /api/orders/[id])
// ==========================================================================
describe("Order Detail - GET /api/orders/[id]", () => {
  beforeEach(async () => {
    await testDb.delete(orders).where(eq(orders.companyId, companyA.id));
    await testDb.delete(orders).where(eq(orders.companyId, companyB.id));
  });

  test("returns order with enriched strictness fields", async () => {
    const order = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-DETAIL-1",
      customerName: "Alice",
      customerPhone: "999111222",
      notes: "Ring doorbell",
    });

    const request = await createTestRequest(`/api/orders/${order.id}`, {
      method: "GET",
      token: tokenPlannerA,
      companyId: companyA.id,
      userId: plannerA.id,
    });

    const response = await GET_ORDER(request, {
      params: Promise.resolve({ id: order.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.id).toBe(order.id);
    expect(data.trackingId).toBe("TRK-DETAIL-1");
    expect(data.customerName).toBe("Alice");
    expect(data.notes).toBe("Ring doorbell");
    // Enriched fields
    expect(data.effectiveStrictness).toBeDefined();
    expect(data.isStrictnessOverridden).toBeDefined();
  });

  test("returns 404 for non-existent order ID", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(`/api/orders/${fakeId}`, {
      method: "GET",
      token: tokenPlannerA,
      companyId: companyA.id,
      userId: plannerA.id,
    });

    const response = await GET_ORDER(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("not found");
  });

  test("tenant isolation: cannot fetch order from another company", async () => {
    const orderA = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-ISO-A",
    });

    // Planner B tries to read order from company A
    const request = await createTestRequest(`/api/orders/${orderA.id}`, {
      method: "GET",
      token: tokenPlannerB,
      companyId: companyB.id,
      userId: plannerB.id,
    });

    const response = await GET_ORDER(request, {
      params: Promise.resolve({ id: orderA.id }),
    });
    expect(response.status).toBe(404);
  });
});

// ==========================================================================
// Order Update (PATCH /api/orders/[id])
// ==========================================================================
describe("Order Update - PATCH /api/orders/[id]", () => {
  beforeEach(async () => {
    await testDb.delete(orders).where(eq(orders.companyId, companyA.id));
    await testDb.delete(orders).where(eq(orders.companyId, companyB.id));
  });

  test("updates order fields successfully", async () => {
    const order = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-PATCH-1",
    });

    const request = await createTestRequest(`/api/orders/${order.id}`, {
      method: "PATCH",
      token: tokenPlannerA,
      companyId: companyA.id,
      userId: plannerA.id,
      body: {
        customerName: "Updated Customer",
        notes: "Updated notes",
        status: "ASSIGNED",
      },
    });

    const response = await PATCH_ORDER(request, {
      params: Promise.resolve({ id: order.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.customerName).toBe("Updated Customer");
    expect(data.notes).toBe("Updated notes");
    expect(data.status).toBe("ASSIGNED");
  });

  test("returns 404 when updating non-existent order", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(`/api/orders/${fakeId}`, {
      method: "PATCH",
      token: tokenPlannerA,
      companyId: companyA.id,
      userId: plannerA.id,
      body: { customerName: "Nobody" },
    });

    const response = await PATCH_ORDER(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);
  });

  test("returns 409 when updating to duplicate trackingId", async () => {
    const order1 = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-EXISTING",
    });
    const order2 = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-TO-UPDATE",
    });

    const request = await createTestRequest(`/api/orders/${order2.id}`, {
      method: "PATCH",
      token: tokenPlannerA,
      companyId: companyA.id,
      userId: plannerA.id,
      body: { trackingId: "TRK-EXISTING" },
    });

    const response = await PATCH_ORDER(request, {
      params: Promise.resolve({ id: order2.id }),
    });
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toContain("tracking ID already exists");
  });

  test("tenant isolation: cannot update order from another company", async () => {
    const orderA = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-ISO-PATCH",
    });

    const request = await createTestRequest(`/api/orders/${orderA.id}`, {
      method: "PATCH",
      token: tokenPlannerB,
      companyId: companyB.id,
      userId: plannerB.id,
      body: { customerName: "Hacker" },
    });

    const response = await PATCH_ORDER(request, {
      params: Promise.resolve({ id: orderA.id }),
    });
    expect(response.status).toBe(404);
  });
});

// ==========================================================================
// Order Delete (DELETE /api/orders/[id])
// ==========================================================================
describe("Order Delete - DELETE /api/orders/[id]", () => {
  beforeEach(async () => {
    await testDb.delete(orders).where(eq(orders.companyId, companyA.id));
  });

  test("soft deletes order (sets active=false)", async () => {
    const order = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-DEL-1",
    });

    const request = await createTestRequest(`/api/orders/${order.id}`, {
      method: "DELETE",
      token: tokenAdminA,
      companyId: companyA.id,
      userId: adminA.id,
    });

    const response = await DELETE_ORDER(request, {
      params: Promise.resolve({ id: order.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.active).toBe(false);

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(dbRecord.active).toBe(false);
  });

  test("returns 404 when deleting non-existent order", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(`/api/orders/${fakeId}`, {
      method: "DELETE",
      token: tokenAdminA,
      companyId: companyA.id,
      userId: adminA.id,
    });

    const response = await DELETE_ORDER(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);
  });

  test("tenant isolation: cannot delete order from another company", async () => {
    const orderA = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-ISO-DEL",
    });

    // Admin token with company B context
    const adminTokenB = await createTestToken({
      userId: adminA.id,
      companyId: companyB.id,
      email: adminA.email,
      role: adminA.role,
    });

    const request = await createTestRequest(`/api/orders/${orderA.id}`, {
      method: "DELETE",
      token: adminTokenB,
      companyId: companyB.id,
      userId: adminA.id,
    });

    const response = await DELETE_ORDER(request, {
      params: Promise.resolve({ id: orderA.id }),
    });
    expect(response.status).toBe(404);
  });
});

// ==========================================================================
// Tracking Generate (POST /api/tracking/generate)
// ==========================================================================
describe("Tracking Generate - POST /api/tracking/generate", () => {
  beforeEach(async () => {
    await testDb.delete(trackingTokens);
    await testDb.delete(orders).where(eq(orders.companyId, companyA.id));
    await testDb.delete(orders).where(eq(orders.companyId, companyB.id));
  });

  test("generates tracking token for order by orderIds", async () => {
    const order = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-GEN-1",
    });

    const request = await createTestRequest("/api/tracking/generate", {
      method: "POST",
      token: tokenPlannerA,
      companyId: companyA.id,
      userId: plannerA.id,
      body: { orderIds: [order.id] },
    });

    const response = await POST_TRACKING_GENERATE(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].trackingId).toBe("TRK-GEN-1");
    expect(json.data[0].token).toBeDefined();
    expect(json.data[0].url).toContain("/tracking/");
  });

  test("generates tracking tokens for multiple orders", async () => {
    const order1 = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-MULTI-1",
    });
    const order2 = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-MULTI-2",
    });

    const request = await createTestRequest("/api/tracking/generate", {
      method: "POST",
      token: tokenPlannerA,
      companyId: companyA.id,
      userId: plannerA.id,
      body: { orderIds: [order1.id, order2.id] },
    });

    const response = await POST_TRACKING_GENERATE(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data).toHaveLength(2);
    const trackingIds = json.data.map((d: { trackingId: string }) => d.trackingId);
    expect(trackingIds).toContain("TRK-MULTI-1");
    expect(trackingIds).toContain("TRK-MULTI-2");
  });

  test("resolves orders by trackingIds", async () => {
    await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-BY-TID",
    });

    const request = await createTestRequest("/api/tracking/generate", {
      method: "POST",
      token: tokenPlannerA,
      companyId: companyA.id,
      userId: plannerA.id,
      body: { trackingIds: ["TRK-BY-TID"] },
    });

    const response = await POST_TRACKING_GENERATE(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].trackingId).toBe("TRK-BY-TID");
  });

  test("returns existing active token if not expired", async () => {
    const order = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-REUSE",
    });

    // First generation
    const req1 = await createTestRequest("/api/tracking/generate", {
      method: "POST",
      token: tokenPlannerA,
      companyId: companyA.id,
      userId: plannerA.id,
      body: { orderIds: [order.id] },
    });
    const res1 = await POST_TRACKING_GENERATE(req1);
    const json1 = await res1.json();
    const firstToken = json1.data[0].token;

    // Second generation should reuse the same token
    const req2 = await createTestRequest("/api/tracking/generate", {
      method: "POST",
      token: tokenPlannerA,
      companyId: companyA.id,
      userId: plannerA.id,
      body: { orderIds: [order.id] },
    });
    const res2 = await POST_TRACKING_GENERATE(req2);
    const json2 = await res2.json();

    expect(json2.data[0].token).toBe(firstToken);
  });

  test("returns 400 when neither orderIds nor trackingIds provided", async () => {
    const request = await createTestRequest("/api/tracking/generate", {
      method: "POST",
      token: tokenPlannerA,
      companyId: companyA.id,
      userId: plannerA.id,
      body: {},
    });

    const response = await POST_TRACKING_GENERATE(request);
    expect(response.status).toBe(400);
  });

  test("returns 404 when no valid orders found", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest("/api/tracking/generate", {
      method: "POST",
      token: tokenPlannerA,
      companyId: companyA.id,
      userId: plannerA.id,
      body: { orderIds: [fakeId] },
    });

    const response = await POST_TRACKING_GENERATE(request);
    expect(response.status).toBe(404);
  });

  test("tenant isolation: cannot generate tokens for another company orders", async () => {
    const orderA = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-ISO-GEN",
    });

    const request = await createTestRequest("/api/tracking/generate", {
      method: "POST",
      token: tokenPlannerB,
      companyId: companyB.id,
      userId: plannerB.id,
      body: { orderIds: [orderA.id] },
    });

    const response = await POST_TRACKING_GENERATE(request);
    // Should not find the order since tenant filter is applied
    expect(response.status).toBe(404);
  });
});

// ==========================================================================
// Tracking Settings (GET/PUT /api/tracking/settings)
// ==========================================================================
describe("Tracking Settings - GET/PUT /api/tracking/settings", () => {
  beforeEach(async () => {
    await testDb.delete(companyTrackingSettings);
  });

  test("GET returns defaults when no settings exist", async () => {
    const request = await createTestRequest("/api/tracking/settings", {
      method: "GET",
      token: tokenAdminA,
      companyId: companyA.id,
      userId: adminA.id,
    });

    const response = await GET_TRACKING_SETTINGS(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data.trackingEnabled).toBe(false);
    expect(json.data.showMap).toBe(true);
    expect(json.data.showDriverLocation).toBe(true);
    expect(json.data.showDriverName).toBe(false);
    expect(json.data.showDriverPhoto).toBe(false);
    expect(json.data.showEvidence).toBe(true);
    expect(json.data.showEta).toBe(true);
    expect(json.data.showTimeline).toBe(true);
    expect(json.data.brandColor).toBe("#3B82F6");
    expect(json.data.logoUrl).toBeNull();
    expect(json.data.customMessage).toBeNull();
    expect(json.data.tokenExpiryHours).toBe(48);
    expect(json.data.autoGenerateTokens).toBe(false);
  });

  test("PUT creates settings when none exist", async () => {
    const request = await createTestRequest("/api/tracking/settings", {
      method: "PUT",
      token: tokenAdminA,
      companyId: companyA.id,
      userId: adminA.id,
      body: {
        trackingEnabled: true,
        brandColor: "#FF0000",
        tokenExpiryHours: 24,
        showDriverName: true,
      },
    });

    const response = await PUT_TRACKING_SETTINGS(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data.trackingEnabled).toBe(true);
    expect(json.data.brandColor).toBe("#FF0000");
    expect(json.data.tokenExpiryHours).toBe(24);
    expect(json.data.showDriverName).toBe(true);
    // Defaults remain for unset fields
    expect(json.data.showMap).toBe(true);
  });

  test("PUT updates existing settings", async () => {
    // Create initial settings
    await testDb.insert(companyTrackingSettings).values({
      companyId: companyA.id,
      trackingEnabled: false,
      brandColor: "#000000",
    });

    const request = await createTestRequest("/api/tracking/settings", {
      method: "PUT",
      token: tokenAdminA,
      companyId: companyA.id,
      userId: adminA.id,
      body: {
        trackingEnabled: true,
        customMessage: "Track your delivery!",
      },
    });

    const response = await PUT_TRACKING_SETTINGS(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data.trackingEnabled).toBe(true);
    expect(json.data.customMessage).toBe("Track your delivery!");
    // Existing field should remain
    expect(json.data.brandColor).toBe("#000000");
  });

  test("GET returns persisted settings after PUT", async () => {
    // PUT first
    const putReq = await createTestRequest("/api/tracking/settings", {
      method: "PUT",
      token: tokenAdminA,
      companyId: companyA.id,
      userId: adminA.id,
      body: { trackingEnabled: true, autoGenerateTokens: true },
    });
    await PUT_TRACKING_SETTINGS(putReq);

    // GET and verify
    const getReq = await createTestRequest("/api/tracking/settings", {
      method: "GET",
      token: tokenAdminA,
      companyId: companyA.id,
      userId: adminA.id,
    });
    const response = await GET_TRACKING_SETTINGS(getReq);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data.trackingEnabled).toBe(true);
    expect(json.data.autoGenerateTokens).toBe(true);
  });
});

// ==========================================================================
// Public Tracking (GET /api/public/tracking/[token])
// ==========================================================================
describe("Public Tracking - GET /api/public/tracking/[token]", () => {
  beforeEach(async () => {
    await testDb.delete(trackingTokens);
    await testDb.delete(companyTrackingSettings);
    await testDb.delete(orders).where(eq(orders.companyId, companyA.id));
  });

  test("returns tracking data for valid token", async () => {
    const order = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-PUBLIC-1",
      customerName: "Public Customer",
      address: "Av. Publica 100",
      status: "PENDING",
    });

    // Insert a tracking token directly
    const tokenValue = "test-token-" + Date.now();
    await testDb.insert(trackingTokens).values({
      companyId: companyA.id,
      orderId: order.id,
      trackingId: "TRK-PUBLIC-1",
      token: tokenValue,
      active: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // +24h
    });

    // Public endpoint does NOT require auth
    const request = await createTestRequest(
      `/api/public/tracking/${tokenValue}`,
      { method: "GET" },
    );

    const response = await GET_PUBLIC_TRACKING(request, {
      params: Promise.resolve({ token: tokenValue }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.order).toBeDefined();
    expect(data.order.trackingId).toBe("TRK-PUBLIC-1");
    expect(data.order.customerName).toBe("Public Customer");
    expect(data.order.address).toBe("Av. Publica 100");
    expect(data.order.status).toBe("PENDING");
    expect(data.company).toBeDefined();
    expect(data.settings).toBeDefined();
    expect(data.timeline).toBeDefined();
    expect(Array.isArray(data.timeline)).toBe(true);
  });

  test("returns 404 for non-existent token", async () => {
    const request = await createTestRequest(
      "/api/public/tracking/nonexistent-token-value",
      { method: "GET" },
    );

    const response = await GET_PUBLIC_TRACKING(request, {
      params: Promise.resolve({ token: "nonexistent-token-value" }),
    });
    expect(response.status).toBe(404);
  });

  test("returns 404 for inactive token", async () => {
    const order = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-INACTIVE",
    });

    const tokenValue = "inactive-token-" + Date.now();
    await testDb.insert(trackingTokens).values({
      companyId: companyA.id,
      orderId: order.id,
      trackingId: "TRK-INACTIVE",
      token: tokenValue,
      active: false, // inactive
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const request = await createTestRequest(
      `/api/public/tracking/${tokenValue}`,
      { method: "GET" },
    );

    const response = await GET_PUBLIC_TRACKING(request, {
      params: Promise.resolve({ token: tokenValue }),
    });
    expect(response.status).toBe(404);
  });

  test("returns 410 for expired token", async () => {
    const order = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-EXPIRED",
    });

    const tokenValue = "expired-token-" + Date.now();
    await testDb.insert(trackingTokens).values({
      companyId: companyA.id,
      orderId: order.id,
      trackingId: "TRK-EXPIRED",
      token: tokenValue,
      active: true,
      expiresAt: new Date(Date.now() - 60 * 60 * 1000), // expired 1 hour ago
    });

    const request = await createTestRequest(
      `/api/public/tracking/${tokenValue}`,
      { method: "GET" },
    );

    const response = await GET_PUBLIC_TRACKING(request, {
      params: Promise.resolve({ token: tokenValue }),
    });
    expect(response.status).toBe(410);
  });

  test("returns 400 for invalid token format (too long)", async () => {
    const longToken = "a".repeat(256);
    const request = await createTestRequest(
      `/api/public/tracking/${longToken}`,
      { method: "GET" },
    );

    const response = await GET_PUBLIC_TRACKING(request, {
      params: Promise.resolve({ token: longToken }),
    });
    expect(response.status).toBe(400);
  });

  test("respects company tracking settings in response", async () => {
    const order = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-SETTINGS",
    });

    // Set up company settings
    await testDb.insert(companyTrackingSettings).values({
      companyId: companyA.id,
      trackingEnabled: true,
      showMap: false,
      showDriverName: true,
      showTimeline: false,
      brandColor: "#FF5500",
      customMessage: "Thanks for ordering!",
    });

    const tokenValue = "settings-token-" + Date.now();
    await testDb.insert(trackingTokens).values({
      companyId: companyA.id,
      orderId: order.id,
      trackingId: "TRK-SETTINGS",
      token: tokenValue,
      active: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const request = await createTestRequest(
      `/api/public/tracking/${tokenValue}`,
      { method: "GET" },
    );

    const response = await GET_PUBLIC_TRACKING(request, {
      params: Promise.resolve({ token: tokenValue }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.settings.showMap).toBe(false);
    expect(data.settings.showDriverName).toBe(true);
    expect(data.settings.showTimeline).toBe(false);
    expect(data.company.brandColor).toBe("#FF5500");
    expect(data.company.customMessage).toBe("Thanks for ordering!");
  });

  test("timeline includes PENDING entry from order creation", async () => {
    const order = await createOrder({
      companyId: companyA.id,
      trackingId: "TRK-TIMELINE",
    });

    const tokenValue = "timeline-token-" + Date.now();
    await testDb.insert(trackingTokens).values({
      companyId: companyA.id,
      orderId: order.id,
      trackingId: "TRK-TIMELINE",
      token: tokenValue,
      active: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const request = await createTestRequest(
      `/api/public/tracking/${tokenValue}`,
      { method: "GET" },
    );

    const response = await GET_PUBLIC_TRACKING(request, {
      params: Promise.resolve({ token: tokenValue }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.timeline.length).toBeGreaterThanOrEqual(1);
    expect(data.timeline[0].status).toBe("PENDING");
    expect(data.timeline[0].label).toBe("Pedido registrado");
  });
});

// ==========================================================================
// Zone Detail (GET /api/zones/[id])
// ==========================================================================
describe("Zone Detail - GET /api/zones/[id]", () => {
  beforeEach(async () => {
    await testDb.delete(zoneVehicles);
    await testDb.delete(zones).where(eq(zones.companyId, companyA.id));
    await testDb.delete(zones).where(eq(zones.companyId, companyB.id));
  });

  test("returns zone with parsed geometry and vehicle list", async () => {
    const zone = await createZone({
      companyId: companyA.id,
      name: "Zone Alpha",
    });

    const request = await createTestRequest(`/api/zones/${zone.id}`, {
      method: "GET",
      token: tokenPlannerA,
      companyId: companyA.id,
      userId: plannerA.id,
    });

    const response = await GET_ZONE(request, {
      params: Promise.resolve({ id: zone.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.id).toBe(zone.id);
    expect(data.name).toBe("Zone Alpha");
    expect(data.vehicles).toBeDefined();
    expect(Array.isArray(data.vehicles)).toBe(true);
    expect(data.vehicleCount).toBe(0);
    expect(data.vehicleIds).toEqual([]);
  });

  test("returns 404 for non-existent zone ID", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(`/api/zones/${fakeId}`, {
      method: "GET",
      token: tokenPlannerA,
      companyId: companyA.id,
      userId: plannerA.id,
    });

    const response = await GET_ZONE(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("not found");
  });

  test("tenant isolation: cannot fetch zone from another company", async () => {
    const zoneA = await createZone({
      companyId: companyA.id,
      name: "Zone A Only",
    });

    const request = await createTestRequest(`/api/zones/${zoneA.id}`, {
      method: "GET",
      token: tokenPlannerB,
      companyId: companyB.id,
      userId: plannerB.id,
    });

    const response = await GET_ZONE(request, {
      params: Promise.resolve({ id: zoneA.id }),
    });
    expect(response.status).toBe(404);
  });

  test("includes related vehicles in response", async () => {
    const zone = await createZone({
      companyId: companyA.id,
      name: "Zone With Vehicles",
    });
    const vehicle = await createVehicle({
      companyId: companyA.id,
      name: "Van 1",
      plate: "ABC-001",
    });
    await createZoneVehicle({
      companyId: companyA.id,
      zoneId: zone.id,
      vehicleId: vehicle.id,
    });

    const request = await createTestRequest(`/api/zones/${zone.id}`, {
      method: "GET",
      token: tokenPlannerA,
      companyId: companyA.id,
      userId: plannerA.id,
    });

    const response = await GET_ZONE(request, {
      params: Promise.resolve({ id: zone.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.vehicleCount).toBe(1);
    expect(data.vehicleIds).toContain(vehicle.id);
    expect(data.vehicles[0].name).toBe("Van 1");
    expect(data.vehicles[0].plate).toBe("ABC-001");
  });
});

// ==========================================================================
// Zone Update (PATCH /api/zones/[id])
// ==========================================================================
describe("Zone Update - PATCH /api/zones/[id]", () => {
  beforeEach(async () => {
    await testDb.delete(zoneVehicles);
    await testDb.delete(zones).where(eq(zones.companyId, companyA.id));
    await testDb.delete(zones).where(eq(zones.companyId, companyB.id));
  });

  test("updates zone name", async () => {
    const zone = await createZone({
      companyId: companyA.id,
      name: "Old Name",
      type: "DELIVERY",
    });

    const request = await createTestRequest(`/api/zones/${zone.id}`, {
      method: "PATCH",
      token: tokenAdminA,
      companyId: companyA.id,
      userId: adminA.id,
      body: { name: "New Name" },
    });

    const response = await PATCH_ZONE(request, {
      params: Promise.resolve({ id: zone.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.name).toBe("New Name");
    expect(data.type).toBe("DELIVERY");
  });

  test("returns 404 when updating non-existent zone", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(`/api/zones/${fakeId}`, {
      method: "PATCH",
      token: tokenAdminA,
      companyId: companyA.id,
      userId: adminA.id,
      body: { name: "Ghost Zone" },
    });

    const response = await PATCH_ZONE(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);
  });

  test("rejects duplicate zone name within same company", async () => {
    await createZone({
      companyId: companyA.id,
      name: "Existing Zone",
    });
    const zone2 = await createZone({
      companyId: companyA.id,
      name: "Zone To Rename",
    });

    const request = await createTestRequest(`/api/zones/${zone2.id}`, {
      method: "PATCH",
      token: tokenAdminA,
      companyId: companyA.id,
      userId: adminA.id,
      body: { name: "Existing Zone" },
    });

    const response = await PATCH_ZONE(request, {
      params: Promise.resolve({ id: zone2.id }),
    });
    expect(response.status).toBe(400);
  });

  test("tenant isolation: cannot update zone from another company", async () => {
    const zoneA = await createZone({
      companyId: companyA.id,
      name: "Zone A",
    });

    const adminTokenB = await createTestToken({
      userId: adminA.id,
      companyId: companyB.id,
      email: adminA.email,
      role: adminA.role,
    });

    const request = await createTestRequest(`/api/zones/${zoneA.id}`, {
      method: "PATCH",
      token: adminTokenB,
      companyId: companyB.id,
      userId: adminA.id,
      body: { name: "Hacked Zone" },
    });

    const response = await PATCH_ZONE(request, {
      params: Promise.resolve({ id: zoneA.id }),
    });
    expect(response.status).toBe(404);
  });

  test("updates zone geometry with valid GeoJSON Polygon", async () => {
    const zone = await createZone({
      companyId: companyA.id,
      name: "Geo Zone",
    });

    const newGeometry = JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [-77.06, -12.03],
          [-77.03, -12.03],
          [-77.03, -12.06],
          [-77.06, -12.06],
          [-77.06, -12.03],
        ],
      ],
    });

    const request = await createTestRequest(`/api/zones/${zone.id}`, {
      method: "PATCH",
      token: tokenAdminA,
      companyId: companyA.id,
      userId: adminA.id,
      body: { geometry: newGeometry },
    });

    const response = await PATCH_ZONE(request, {
      params: Promise.resolve({ id: zone.id }),
    });
    expect(response.status).toBe(200);
  });

  test("updates activeDays", async () => {
    const zone = await createZone({
      companyId: companyA.id,
      name: "Weekday Zone",
    });

    const request = await createTestRequest(`/api/zones/${zone.id}`, {
      method: "PATCH",
      token: tokenAdminA,
      companyId: companyA.id,
      userId: adminA.id,
      body: { activeDays: ["MONDAY", "WEDNESDAY", "FRIDAY"] },
    });

    const response = await PATCH_ZONE(request, {
      params: Promise.resolve({ id: zone.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.activeDays).toEqual(["MONDAY", "WEDNESDAY", "FRIDAY"]);
  });
});

// ==========================================================================
// Zone Delete (DELETE /api/zones/[id])
// ==========================================================================
describe("Zone Delete - DELETE /api/zones/[id]", () => {
  beforeEach(async () => {
    await testDb.delete(zoneVehicles);
    await testDb.delete(zones).where(eq(zones.companyId, companyA.id));
    await testDb.delete(zones).where(eq(zones.companyId, companyB.id));
  });

  test("soft deletes zone and deactivates vehicle assignments", async () => {
    const zone = await createZone({
      companyId: companyA.id,
      name: "Zone To Delete",
    });
    const vehicle = await createVehicle({ companyId: companyA.id });
    await createZoneVehicle({
      companyId: companyA.id,
      zoneId: zone.id,
      vehicleId: vehicle.id,
    });

    const request = await createTestRequest(`/api/zones/${zone.id}`, {
      method: "DELETE",
      token: tokenAdminA,
      companyId: companyA.id,
      userId: adminA.id,
    });

    const response = await DELETE_ZONE(request, {
      params: Promise.resolve({ id: zone.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.deactivatedVehicles).toBe(1);

    // Verify zone is soft deleted
    const [dbZone] = await testDb
      .select()
      .from(zones)
      .where(eq(zones.id, zone.id));
    expect(dbZone.active).toBe(false);
    expect(dbZone.isDefault).toBe(false);
  });

  test("returns 404 when deleting non-existent zone", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(`/api/zones/${fakeId}`, {
      method: "DELETE",
      token: tokenAdminA,
      companyId: companyA.id,
      userId: adminA.id,
    });

    const response = await DELETE_ZONE(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);
  });

  test("tenant isolation: cannot delete zone from another company", async () => {
    const zoneA = await createZone({
      companyId: companyA.id,
      name: "Zone A Protected",
    });

    const adminTokenB = await createTestToken({
      userId: adminA.id,
      companyId: companyB.id,
      email: adminA.email,
      role: adminA.role,
    });

    const request = await createTestRequest(`/api/zones/${zoneA.id}`, {
      method: "DELETE",
      token: adminTokenB,
      companyId: companyB.id,
      userId: adminA.id,
    });

    const response = await DELETE_ZONE(request, {
      params: Promise.resolve({ id: zoneA.id }),
    });
    expect(response.status).toBe(404);
  });
});

// ==========================================================================
// Zone Vehicles (GET/POST/DELETE /api/zones/[id]/vehicles)
// ==========================================================================
describe("Zone Vehicles - /api/zones/[id]/vehicles", () => {
  let zoneA: Awaited<ReturnType<typeof createZone>>;
  let vehicleA1: Awaited<ReturnType<typeof createVehicle>>;
  let vehicleA2: Awaited<ReturnType<typeof createVehicle>>;

  beforeEach(async () => {
    await testDb.delete(zoneVehicles);
    await testDb.delete(zones).where(eq(zones.companyId, companyA.id));
    await testDb.delete(zones).where(eq(zones.companyId, companyB.id));

    zoneA = await createZone({ companyId: companyA.id, name: "ZV Zone" });
    vehicleA1 = await createVehicle({
      companyId: companyA.id,
      name: "Van Alpha",
      plate: "ZV-001",
    });
    vehicleA2 = await createVehicle({
      companyId: companyA.id,
      name: "Van Beta",
      plate: "ZV-002",
    });
  });

  // -- GET --
  test("GET lists vehicles assigned to zone (empty)", async () => {
    const request = await createTestRequest(
      `/api/zones/${zoneA.id}/vehicles`,
      {
        method: "GET",
        token: tokenPlannerA,
        companyId: companyA.id,
        userId: plannerA.id,
      },
    );

    const response = await GET_ZONE_VEHICLES(request, {
      params: Promise.resolve({ id: zoneA.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.zoneId).toBe(zoneA.id);
    expect(data.vehicles).toHaveLength(0);
    expect(data.count).toBe(0);
  });

  test("GET lists vehicles after assignment", async () => {
    await createZoneVehicle({
      companyId: companyA.id,
      zoneId: zoneA.id,
      vehicleId: vehicleA1.id,
    });

    const request = await createTestRequest(
      `/api/zones/${zoneA.id}/vehicles`,
      {
        method: "GET",
        token: tokenPlannerA,
        companyId: companyA.id,
        userId: plannerA.id,
      },
    );

    const response = await GET_ZONE_VEHICLES(request, {
      params: Promise.resolve({ id: zoneA.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.vehicles).toHaveLength(1);
    expect(data.vehicles[0].id).toBe(vehicleA1.id);
    expect(data.count).toBe(1);
  });

  test("GET returns 404 for non-existent zone", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(
      `/api/zones/${fakeId}/vehicles`,
      {
        method: "GET",
        token: tokenPlannerA,
        companyId: companyA.id,
        userId: plannerA.id,
      },
    );

    const response = await GET_ZONE_VEHICLES(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);
  });

  test("GET tenant isolation: cannot list vehicles of another company zone", async () => {
    const request = await createTestRequest(
      `/api/zones/${zoneA.id}/vehicles`,
      {
        method: "GET",
        token: tokenPlannerB,
        companyId: companyB.id,
        userId: plannerB.id,
      },
    );

    const response = await GET_ZONE_VEHICLES(request, {
      params: Promise.resolve({ id: zoneA.id }),
    });
    expect(response.status).toBe(404);
  });

  // -- POST (Bulk assign) --
  test("POST bulk assigns vehicles to zone", async () => {
    const request = await createTestRequest(
      `/api/zones/${zoneA.id}/vehicles`,
      {
        method: "POST",
        token: tokenAdminA,
        companyId: companyA.id,
        userId: adminA.id,
        body: {
          vehicleIds: [vehicleA1.id, vehicleA2.id],
          assignedDays: ["MONDAY", "FRIDAY"],
        },
      },
    );

    const response = await POST_ZONE_VEHICLES(request, {
      params: Promise.resolve({ id: zoneA.id }),
    });
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.zoneId).toBe(zoneA.id);
    expect(data.vehicles).toHaveLength(2);
    expect(data.count).toBe(2);
    const vehicleIds = data.vehicles.map((v: { id: string }) => v.id);
    expect(vehicleIds).toContain(vehicleA1.id);
    expect(vehicleIds).toContain(vehicleA2.id);
  });

  test("POST replaces existing assignments", async () => {
    // First assignment: vehicle 1
    const req1 = await createTestRequest(
      `/api/zones/${zoneA.id}/vehicles`,
      {
        method: "POST",
        token: tokenAdminA,
        companyId: companyA.id,
        userId: adminA.id,
        body: { vehicleIds: [vehicleA1.id] },
      },
    );
    await POST_ZONE_VEHICLES(req1, {
      params: Promise.resolve({ id: zoneA.id }),
    });

    // Second assignment: vehicle 2 only (replaces vehicle 1)
    const req2 = await createTestRequest(
      `/api/zones/${zoneA.id}/vehicles`,
      {
        method: "POST",
        token: tokenAdminA,
        companyId: companyA.id,
        userId: adminA.id,
        body: { vehicleIds: [vehicleA2.id] },
      },
    );
    const response = await POST_ZONE_VEHICLES(req2, {
      params: Promise.resolve({ id: zoneA.id }),
    });
    expect(response.status).toBe(201);

    // GET to verify only vehicle 2 is active
    const getReq = await createTestRequest(
      `/api/zones/${zoneA.id}/vehicles`,
      {
        method: "GET",
        token: tokenAdminA,
        companyId: companyA.id,
        userId: adminA.id,
      },
    );
    const getRes = await GET_ZONE_VEHICLES(getReq, {
      params: Promise.resolve({ id: zoneA.id }),
    });
    const getData = await getRes.json();
    expect(getData.vehicles).toHaveLength(1);
    expect(getData.vehicles[0].id).toBe(vehicleA2.id);
  });

  test("POST returns 404 for non-existent zone", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(
      `/api/zones/${fakeId}/vehicles`,
      {
        method: "POST",
        token: tokenAdminA,
        companyId: companyA.id,
        userId: adminA.id,
        body: { vehicleIds: [vehicleA1.id] },
      },
    );

    const response = await POST_ZONE_VEHICLES(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);
  });

  test("POST returns 400 for non-existent vehicle IDs", async () => {
    const fakeVehicleId = "00000000-0000-4000-a000-000000000099";
    const request = await createTestRequest(
      `/api/zones/${zoneA.id}/vehicles`,
      {
        method: "POST",
        token: tokenAdminA,
        companyId: companyA.id,
        userId: adminA.id,
        body: { vehicleIds: [fakeVehicleId] },
      },
    );

    const response = await POST_ZONE_VEHICLES(request, {
      params: Promise.resolve({ id: zoneA.id }),
    });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.missingIds).toContain(fakeVehicleId);
  });

  test("POST tenant isolation: cannot assign to another company zone", async () => {
    const adminTokenB = await createTestToken({
      userId: adminA.id,
      companyId: companyB.id,
      email: adminA.email,
      role: adminA.role,
    });

    const request = await createTestRequest(
      `/api/zones/${zoneA.id}/vehicles`,
      {
        method: "POST",
        token: adminTokenB,
        companyId: companyB.id,
        userId: adminA.id,
        body: { vehicleIds: [vehicleA1.id] },
      },
    );

    const response = await POST_ZONE_VEHICLES(request, {
      params: Promise.resolve({ id: zoneA.id }),
    });
    expect(response.status).toBe(404);
  });

  // -- DELETE (Remove all assignments) --
  test("DELETE removes all vehicle assignments from zone", async () => {
    // Assign vehicles first
    await createZoneVehicle({
      companyId: companyA.id,
      zoneId: zoneA.id,
      vehicleId: vehicleA1.id,
    });
    await createZoneVehicle({
      companyId: companyA.id,
      zoneId: zoneA.id,
      vehicleId: vehicleA2.id,
    });

    const request = await createTestRequest(
      `/api/zones/${zoneA.id}/vehicles`,
      {
        method: "DELETE",
        token: tokenAdminA,
        companyId: companyA.id,
        userId: adminA.id,
      },
    );

    const response = await DELETE_ZONE_VEHICLES(request, {
      params: Promise.resolve({ id: zoneA.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.zoneId).toBe(zoneA.id);

    // Verify all assignments are deactivated
    const assignments = await testDb
      .select()
      .from(zoneVehicles)
      .where(
        and(
          eq(zoneVehicles.zoneId, zoneA.id),
          eq(zoneVehicles.active, true),
        ),
      );
    expect(assignments).toHaveLength(0);
  });

  test("DELETE returns 404 for non-existent zone", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(
      `/api/zones/${fakeId}/vehicles`,
      {
        method: "DELETE",
        token: tokenAdminA,
        companyId: companyA.id,
        userId: adminA.id,
      },
    );

    const response = await DELETE_ZONE_VEHICLES(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(response.status).toBe(404);
  });

  test("DELETE tenant isolation: cannot remove vehicles from another company zone", async () => {
    const adminTokenB = await createTestToken({
      userId: adminA.id,
      companyId: companyB.id,
      email: adminA.email,
      role: adminA.role,
    });

    const request = await createTestRequest(
      `/api/zones/${zoneA.id}/vehicles`,
      {
        method: "DELETE",
        token: adminTokenB,
        companyId: companyB.id,
        userId: adminA.id,
      },
    );

    const response = await DELETE_ZONE_VEHICLES(request, {
      params: Promise.resolve({ id: zoneA.id }),
    });
    expect(response.status).toBe(404);
  });
});
