import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { GET as GET_DELIVERY_POLICY } from "@/app/api/mobile/driver/delivery-policy/route";
import { POST as POST_LOCATION } from "@/app/api/mobile/driver/location/route";
import { driverLocations } from "@/db/schema";
import { CHAT_QUICK_REPLIES } from "@/lib/chat";
import { createTestToken } from "../setup/test-auth";
import {
  createCompany,
  createDriver,
  createOptimizationConfig,
  createOptimizationJob,
  createOrder,
  createRouteStop,
  createVehicle,
} from "../setup/test-data";
import { cleanDatabase, testDb } from "../setup/test-db";
import { createTestRequest } from "../setup/test-request";

/**
 * FIX-6, FIX-7 y FIX-9 del contrato móvil (docs/API-CONTRACT-MOBILE.md §11):
 * - FIX-6: valores 0 (accuracy/altitude/speed/heading/batteryLevel) se
 *   persisten como 0, no como null.
 * - FIX-7: routeId/stopSequence/jobId del body ganan; derivación = fallback.
 * - FIX-9: delivery-policy sirve quickReplies [{code,label}].
 */
describe("Mobile driver — location context & delivery-policy DTO", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let otherCompany: Awaited<ReturnType<typeof createCompany>>;
  let driver: Awaited<ReturnType<typeof createDriver>>;
  let driverToken: string;
  let job: Awaited<ReturnType<typeof createOptimizationJob>>;
  let otherCompanyJob: Awaited<ReturnType<typeof createOptimizationJob>>;

  const DERIVED_ROUTE_ID = "route-derived";
  const DERIVED_SEQUENCE = 3;

  async function postLocation(body: Record<string, unknown>) {
    const req = await createTestRequest("/api/mobile/driver/location", {
      method: "POST",
      token: driverToken,
      companyId: company.id,
      userId: driver.id,
      body: {
        latitude: -12.05,
        longitude: -77.04,
        recordedAt: new Date().toISOString(),
        ...body,
      },
    });
    return POST_LOCATION(req);
  }

  async function savedRow(res: Response) {
    const body = await res.json();
    expect(res.status).toBe(201);
    return testDb.query.driverLocations.findFirst({
      where: eq(driverLocations.id, body.locationId),
    });
  }

  beforeAll(async () => {
    await cleanDatabase();

    company = await createCompany();
    otherCompany = await createCompany();
    driver = await createDriver(company.id);
    driverToken = await createTestToken({
      userId: driver.id,
      companyId: company.id,
      email: driver.email,
      role: "CONDUCTOR",
    });

    const vehicle = await createVehicle({ companyId: company.id });
    const config = await createOptimizationConfig({ companyId: company.id });
    job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
    });
    const order = await createOrder({
      companyId: company.id,
      status: "ASSIGNED",
    });
    await createRouteStop({
      companyId: company.id,
      jobId: job.id,
      routeId: DERIVED_ROUTE_ID,
      sequence: DERIVED_SEQUENCE,
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId: order.id,
      status: "IN_PROGRESS",
    });

    const otherConfig = await createOptimizationConfig({
      companyId: otherCompany.id,
    });
    otherCompanyJob = await createOptimizationJob({
      companyId: otherCompany.id,
      configurationId: otherConfig.id,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // -------------------------------------------------------------------------
  // FIX-6: los ceros sobreviven
  // -------------------------------------------------------------------------
  test("zero-valued telemetry fields persist as 0, not null", async () => {
    const res = await postLocation({
      accuracy: 0,
      altitude: 0,
      speed: 0,
      heading: 0,
      batteryLevel: 0,
    });
    const row = await savedRow(res);

    expect(row?.accuracy).toBe(0);
    expect(row?.altitude).toBe(0);
    expect(row?.speed).toBe(0);
    expect(row?.heading).toBe(0);
    expect(row?.batteryLevel).toBe(0);
    // speed=0 → detenido, no "desconocido"
    expect(row?.isMoving).toBe(false);
  });

  test("omitted telemetry fields persist as null", async () => {
    const res = await postLocation({});
    const row = await savedRow(res);

    expect(row?.accuracy).toBeNull();
    expect(row?.altitude).toBeNull();
    expect(row?.speed).toBeNull();
    expect(row?.heading).toBeNull();
    expect(row?.batteryLevel).toBeNull();
  });

  // -------------------------------------------------------------------------
  // FIX-7: contexto del body gana; derivación = fallback
  // -------------------------------------------------------------------------
  test("client routeId/stopSequence/jobId are honored", async () => {
    const res = await postLocation({
      routeId: "route-from-client",
      stopSequence: 9,
      jobId: job.id,
    });
    const row = await savedRow(res);

    expect(row?.routeId).toBe("route-from-client");
    expect(row?.stopSequence).toBe(9);
    expect(row?.jobId).toBe(job.id);
  });

  test("missing context falls back to server derivation", async () => {
    const res = await postLocation({});
    const row = await savedRow(res);

    expect(row?.jobId).toBe(job.id);
    expect(row?.routeId).toBe(DERIVED_ROUTE_ID);
    expect(row?.stopSequence).toBe(DERIVED_SEQUENCE);
  });

  test("jobId from another company is ignored and derived instead", async () => {
    const res = await postLocation({ jobId: otherCompanyJob.id });
    const row = await savedRow(res);

    expect(row?.jobId).toBe(job.id);
  });

  test("malformed context values fall back to derivation without 500", async () => {
    const res = await postLocation({
      routeId: 123,
      stopSequence: "nine",
      jobId: "not-a-uuid",
    });
    const row = await savedRow(res);

    expect(row?.jobId).toBe(job.id);
    expect(row?.routeId).toBe(DERIVED_ROUTE_ID);
    expect(row?.stopSequence).toBe(DERIVED_SEQUENCE);
  });

  // -------------------------------------------------------------------------
  // FIX-9: quickReplies en delivery-policy
  // -------------------------------------------------------------------------
  test("delivery-policy serves the canonical quickReplies list", async () => {
    const req = await createTestRequest("/api/mobile/driver/delivery-policy", {
      token: driverToken,
      companyId: company.id,
      userId: driver.id,
    });
    const res = await GET_DELIVERY_POLICY(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.quickReplies).toEqual(
      CHAT_QUICK_REPLIES.map(({ code, label }) => ({ code, label })),
    );
    for (const reply of body.data.quickReplies) {
      expect(typeof reply.code).toBe("string");
      expect(typeof reply.label).toBe("string");
    }
  });
});
