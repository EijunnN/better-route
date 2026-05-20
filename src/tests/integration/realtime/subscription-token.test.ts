import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { jwtVerify } from "jose";
import { GET as TOKEN } from "@/app/api/realtime/subscription-token/route";
import { createTestToken } from "../setup/test-auth";
import { createCompany, createDriver, createPlanner } from "../setup/test-data";
import { cleanDatabase } from "../setup/test-db";
import { createTestRequest } from "../setup/test-request";

/**
 * `/api/realtime/subscription-token` mints a per-channel Centrifugo
 * subscription JWT. Each test exercises a single gate of its
 * authorization chain — RBAC role, channel pattern parser, tenant
 * scope, driver existence — so a future regression points straight
 * at the broken rule rather than a generic "endpoint broke".
 */
describe("subscription-token API", () => {
  const SECRET = "test-centrifugo-hmac-secret";

  let company: Awaited<ReturnType<typeof createCompany>>;
  let planner: Awaited<ReturnType<typeof createPlanner>>;
  let driver: Awaited<ReturnType<typeof createDriver>>;
  let plannerToken: string;

  beforeAll(async () => {
    process.env.CENTRIFUGO_TOKEN_HMAC_SECRET_KEY = SECRET;
    await cleanDatabase();
    company = await createCompany();
    planner = await createPlanner(company.id);
    driver = await createDriver(company.id);
    plannerToken = await createTestToken({
      userId: planner.id,
      companyId: planner.companyId,
      email: planner.email,
      role: planner.role,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  async function call(
    token: string,
    companyId: string | undefined,
    channel?: string,
  ) {
    const req = await createTestRequest("/api/realtime/subscription-token", {
      method: "GET",
      token,
      companyId,
      searchParams: channel ? { channel } : undefined,
    });
    return TOKEN(req);
  }

  test("a dispatcher gets a valid Centrifugo subscription token", async () => {
    const channel = `chat:${company.id}:driver:${driver.id}`;
    const res = await call(plannerToken, company.id, channel);
    expect(res.status).toBe(200);

    const json = (await res.json()) as { token: string };
    expect(json.token).toBeString();

    const { payload } = await jwtVerify(
      json.token,
      new TextEncoder().encode(SECRET),
    );
    expect(payload.sub).toBe(planner.id);
    expect(payload.channel).toBe(channel);
    // 5-minute TTL — matches issueCentrifugoSubscriptionToken.
    expect(Number(payload.exp) - Number(payload.iat)).toBe(5 * 60);
  });

  test("a driver (non-dispatch role) is rejected with 403", async () => {
    const driverToken = await createTestToken({
      userId: driver.id,
      companyId: driver.companyId,
      email: driver.email,
      role: driver.role,
    });
    const channel = `chat:${company.id}:driver:${driver.id}`;
    const res = await call(driverToken, company.id, channel);
    expect(res.status).toBe(403);
  });

  test("a missing 'channel' search param is rejected with 400", async () => {
    const res = await call(plannerToken, company.id);
    expect(res.status).toBe(400);
  });

  test("a channel that is not the per-driver chat pattern is rejected with 400", async () => {
    const res = await call(
      plannerToken,
      company.id,
      `monitoring:${company.id}`,
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code?: string };
    expect(json.code).toBe("UNSUPPORTED_CHANNEL");
  });

  test("a channel that references another tenant's company is rejected with 403", async () => {
    const otherCompany = await createCompany();
    const otherDriver = await createDriver(otherCompany.id);
    const channel = `chat:${otherCompany.id}:driver:${otherDriver.id}`;
    const res = await call(plannerToken, company.id, channel);
    expect(res.status).toBe(403);
  });

  test("a channel that references a non-existent driver is rejected with 404", async () => {
    const channel = `chat:${company.id}:driver:00000000-0000-0000-0000-000000000000`;
    const res = await call(plannerToken, company.id, channel);
    expect(res.status).toBe(404);
  });

  test("a channel where the driverId belongs to a different tenant is rejected with 404", async () => {
    // Driver is real but not under the caller's company — server scopes
    // the lookup by companyId so the row is invisible (404, not 403).
    const otherCompany = await createCompany();
    const otherDriver = await createDriver(otherCompany.id);
    const channel = `chat:${company.id}:driver:${otherDriver.id}`;
    const res = await call(plannerToken, company.id, channel);
    expect(res.status).toBe(404);
  });

  test("an unauthenticated request is rejected with 401", async () => {
    const channel = `chat:${company.id}:driver:${driver.id}`;
    const res = await call("", company.id, channel);
    expect(res.status).toBe(401);
  });
});
