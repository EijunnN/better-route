import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { POST as BROADCAST } from "@/app/api/chat/broadcast/route";
import {
  POST as SEND,
  GET as THREAD,
} from "@/app/api/chat/conversations/[driverId]/messages/route";
import { POST as READ } from "@/app/api/chat/conversations/[driverId]/read/route";
import { GET as INBOX } from "@/app/api/chat/conversations/route";
import { chatConversations, chatMessages } from "@/db/schema";
import { createTestToken } from "../setup/test-auth";
import { createCompany, createDriver, createPlanner } from "../setup/test-data";
import { cleanDatabase, testDb } from "../setup/test-db";
import { createTestRequest } from "../setup/test-request";

/**
 * Issue 009 — dispatcher↔driver chat backend.
 *
 * Exercises the five endpoints against the real DB: send, thread with
 * keyset cursor, mark-read, broadcast fan-out, plus the scope rules
 * (tenant isolation, driver self-only, dispatch-only inbox).
 */

interface TestUser {
  id: string;
  companyId: string | null;
  email: string;
  role: string;
}

function tokenFor(user: TestUser): Promise<string> {
  return createTestToken({
    userId: user.id,
    companyId: user.companyId,
    email: user.email,
    role: user.role,
  });
}

describe("Chat API (issue 009)", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let planner: Awaited<ReturnType<typeof createPlanner>>;
  let plannerToken: string;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    planner = await createPlanner(company.id);
    plannerToken = await tokenFor(planner);
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // --- helpers --------------------------------------------------------------

  async function send(
    token: string,
    companyId: string,
    driverId: string,
    body: Record<string, unknown>,
  ) {
    const req = await createTestRequest(
      `/api/chat/conversations/${driverId}/messages`,
      { method: "POST", body, token, companyId },
    );
    return SEND(req, { params: Promise.resolve({ driverId }) });
  }

  async function thread(
    token: string,
    companyId: string,
    driverId: string,
    searchParams?: Record<string, string>,
  ) {
    const req = await createTestRequest(
      `/api/chat/conversations/${driverId}/messages`,
      { method: "GET", token, companyId, searchParams },
    );
    return THREAD(req, { params: Promise.resolve({ driverId }) });
  }

  async function markRead(token: string, companyId: string, driverId: string) {
    const req = await createTestRequest(
      `/api/chat/conversations/${driverId}/read`,
      { method: "POST", token, companyId },
    );
    return READ(req, { params: Promise.resolve({ driverId }) });
  }

  async function inbox(token: string, companyId: string) {
    const req = await createTestRequest("/api/chat/conversations", {
      method: "GET",
      token,
      companyId,
    });
    return INBOX(req);
  }

  // --- send -----------------------------------------------------------------

  test("a dispatcher message is stored TO_DRIVER and adds no unread", async () => {
    const driver = await createDriver(company.id);

    const res = await send(plannerToken, company.id, driver.id, {
      body: "Llamá al cliente de la parada 3",
    });
    expect(res.status).toBe(201);

    const msgs = await testDb
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.driverId, driver.id));
    expect(msgs).toHaveLength(1);
    expect(msgs[0].direction).toBe("TO_DRIVER");
    expect(msgs[0].kind).toBe("TEXT");
    expect(msgs[0].senderId).toBe(planner.id);

    const [conv] = await testDb
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.driverId, driver.id));
    expect(conv.unreadForDispatch).toBe(0);
    expect(conv.lastMessagePreview).toBe("Llamá al cliente de la parada 3");
  });

  test("a driver reply is stored TO_DISPATCH and increments unread", async () => {
    const driver = await createDriver(company.id);
    const driverToken = await tokenFor(driver);

    const res = await send(driverToken, company.id, driver.id, {
      body: "Voy en camino",
    });
    expect(res.status).toBe(201);

    const [msg] = await testDb
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.driverId, driver.id));
    expect(msg.direction).toBe("TO_DISPATCH");
    expect(msg.senderId).toBe(driver.id);

    const [conv] = await testDb
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.driverId, driver.id));
    expect(conv.unreadForDispatch).toBe(1);
  });

  test("a quick-reply is stored with kind TEMPLATE + templateCode", async () => {
    const driver = await createDriver(company.id);
    const driverToken = await tokenFor(driver);

    const res = await send(driverToken, company.id, driver.id, {
      body: "Cliente ausente",
      templateCode: "CUSTOMER_ABSENT",
    });
    expect(res.status).toBe(201);

    const [msg] = await testDb
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.driverId, driver.id));
    expect(msg.kind).toBe("TEMPLATE");
    expect(msg.templateCode).toBe("CUSTOMER_ABSENT");
  });

  test("an unknown templateCode is rejected with 400", async () => {
    const driver = await createDriver(company.id);
    const driverToken = await tokenFor(driver);
    const res = await send(driverToken, company.id, driver.id, {
      body: "x",
      templateCode: "NOT_A_REAL_CODE",
    });
    expect(res.status).toBe(400);
  });

  test("an empty message body is rejected with 400", async () => {
    const driver = await createDriver(company.id);
    const res = await send(plannerToken, company.id, driver.id, {
      body: "   ",
    });
    expect(res.status).toBe(400);
  });

  // --- thread + cursor ------------------------------------------------------

  test("the thread returns messages oldest-first; the id cursor returns only newer", async () => {
    const driver = await createDriver(company.id);

    const firstRes = await send(plannerToken, company.id, driver.id, {
      body: "primero",
    });
    const firstBody = (await firstRes.json()) as { data: { id: string } };
    await new Promise((r) => setTimeout(r, 10));
    await send(plannerToken, company.id, driver.id, { body: "segundo" });

    const fullRes = await thread(plannerToken, company.id, driver.id);
    const full = (await fullRes.json()) as { data: { body: string }[] };
    expect(full.data.map((m) => m.body)).toEqual(["primero", "segundo"]);

    const afterRes = await thread(plannerToken, company.id, driver.id, {
      after: firstBody.data.id,
    });
    expect(afterRes.status).toBe(200);
    const after = (await afterRes.json()) as { data: { body: string }[] };
    expect(after.data.map((m) => m.body)).toEqual(["segundo"]);
  });

  test("an unknown cursor id is rejected with 400", async () => {
    const driver = await createDriver(company.id);
    await send(plannerToken, company.id, driver.id, { body: "hola" });
    const res = await thread(plannerToken, company.id, driver.id, {
      after: "00000000-0000-0000-0000-000000000000",
    });
    expect(res.status).toBe(400);
  });

  // --- read -----------------------------------------------------------------

  test("marking a conversation read clears unread and stamps readAt", async () => {
    const driver = await createDriver(company.id);
    const driverToken = await tokenFor(driver);
    await send(driverToken, company.id, driver.id, { body: "necesito ayuda" });

    const res = await markRead(plannerToken, company.id, driver.id);
    expect(res.status).toBe(200);

    const [conv] = await testDb
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.driverId, driver.id));
    expect(conv.unreadForDispatch).toBe(0);

    const [msg] = await testDb
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.driverId, driver.id));
    expect(msg.readAt).not.toBeNull();
  });

  // --- broadcast ------------------------------------------------------------

  test("a broadcast fans out one BROADCAST row per driver of the tenant", async () => {
    // Own company so the driver count is deterministic.
    const bcCompany = await createCompany();
    const bcPlanner = await createPlanner(bcCompany.id);
    const bcToken = await tokenFor(bcPlanner);
    const d1 = await createDriver(bcCompany.id);
    const d2 = await createDriver(bcCompany.id);
    const d3 = await createDriver(bcCompany.id);

    const req = await createTestRequest("/api/chat/broadcast", {
      method: "POST",
      body: { body: "Regresen a base — operación suspendida" },
      token: bcToken,
      companyId: bcCompany.id,
    });
    const res = await BROADCAST(req);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { reached: number }).reached).toBe(3);

    const msgs = await testDb
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.companyId, bcCompany.id));
    expect(msgs).toHaveLength(3);
    expect(msgs.every((m) => m.kind === "BROADCAST")).toBe(true);
    expect(new Set(msgs.map((m) => m.driverId))).toEqual(
      new Set([d1.id, d2.id, d3.id]),
    );
  });

  // --- scope: driver self-only ----------------------------------------------

  test("a driver cannot send into another driver's thread (403)", async () => {
    const driverA = await createDriver(company.id);
    const driverB = await createDriver(company.id);
    const tokenA = await tokenFor(driverA);

    const res = await send(tokenA, company.id, driverB.id, { body: "hola" });
    expect(res.status).toBe(403);
  });

  test("a driver cannot read another driver's thread (403)", async () => {
    const driverA = await createDriver(company.id);
    const driverB = await createDriver(company.id);
    const tokenA = await tokenFor(driverA);

    const res = await thread(tokenA, company.id, driverB.id);
    expect(res.status).toBe(403);
  });

  test("a driver reading their own thread is allowed (200)", async () => {
    const driver = await createDriver(company.id);
    const driverToken = await tokenFor(driver);
    const res = await thread(driverToken, company.id, driver.id);
    expect(res.status).toBe(200);
  });

  // --- scope: tenant isolation ----------------------------------------------

  test("a dispatcher cannot reach a driver of another tenant (404)", async () => {
    const driver = await createDriver(company.id);

    const otherCompany = await createCompany();
    const otherPlanner = await createPlanner(otherCompany.id);
    const otherToken = await tokenFor(otherPlanner);

    const readRes = await thread(otherToken, otherCompany.id, driver.id);
    expect(readRes.status).toBe(404);

    const sendRes = await send(otherToken, otherCompany.id, driver.id, {
      body: "cross-tenant",
    });
    expect(sendRes.status).toBe(404);
  });

  // --- scope: dispatch-only inbox -------------------------------------------

  test("the inbox is dispatch-only — a driver gets 403", async () => {
    const driver = await createDriver(company.id);
    const driverToken = await tokenFor(driver);
    const res = await inbox(driverToken, company.id);
    expect(res.status).toBe(403);
  });

  test("the inbox lists the dispatcher's tenant conversations", async () => {
    const driver = await createDriver(company.id);
    await send(plannerToken, company.id, driver.id, {
      body: "para la bandeja",
    });

    const res = await inbox(plannerToken, company.id);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { driverId: string }[] };
    expect(json.data.some((c) => c.driverId === driver.id)).toBe(true);
  });
});
