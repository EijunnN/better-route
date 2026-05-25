import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  GET,
  PUT,
} from "@/app/api/companies/[id]/delivery-policy/route";
import { companyDeliveryPolicy } from "@/db/schema";
import { seedDefaultDeliveryPolicy } from "@/lib/workflow/seed-defaults";
import { createTestToken } from "../setup/test-auth";
import { createAdmin, createCompany } from "../setup/test-data";
import { cleanDatabase, testDb } from "../setup/test-db";
import { createTestRequest } from "../setup/test-request";

describe("Delivery Policy endpoint", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let adminToken: string;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    admin = await createAdmin(null);
    adminToken = await createTestToken({
      userId: admin.id,
      companyId: null,
      email: admin.email,
      role: admin.role,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ------------------------------------------------------------------
  // GET — lazy-creates the policy row on first read
  // ------------------------------------------------------------------
  test("GET returns the policy, lazy-inserting it on first call", async () => {
    // Sanity check: no row yet.
    const before = await testDb
      .select()
      .from(companyDeliveryPolicy)
      .where(eq(companyDeliveryPolicy.companyId, company.id));
    expect(before).toHaveLength(0);

    const request = await createTestRequest(
      `/api/companies/${company.id}/delivery-policy`,
      { token: adminToken, companyId: company.id, userId: admin.id },
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.companyId).toBe(company.id);
    // Defaults from the schema's column defaults
    expect(body.data.labelPending).toBe("Pendiente");
    expect(body.data.labelCompleted).toBe("Entregado");
    expect(body.data.completedRequiresPhoto).toBe(true);
    expect(Array.isArray(body.data.failureReasons)).toBe(true);

    // Row was inserted by the lazy path.
    const after = await testDb
      .select()
      .from(companyDeliveryPolicy)
      .where(eq(companyDeliveryPolicy.companyId, company.id));
    expect(after).toHaveLength(1);
  });

  test("GET returns the existing row without re-inserting", async () => {
    // Pre-seed a row so we can detect duplication.
    await seedDefaultDeliveryPolicy(company.id);

    const request = await createTestRequest(
      `/api/companies/${company.id}/delivery-policy`,
      { token: adminToken, companyId: company.id, userId: admin.id },
    );
    await GET(request, { params: Promise.resolve({ id: company.id }) });

    const rows = await testDb
      .select()
      .from(companyDeliveryPolicy)
      .where(eq(companyDeliveryPolicy.companyId, company.id));
    expect(rows).toHaveLength(1);
  });

  // ------------------------------------------------------------------
  // PUT — whitelisted partial updates
  // ------------------------------------------------------------------
  test("PUT updates only whitelisted fields", async () => {
    const request = await createTestRequest(
      `/api/companies/${company.id}/delivery-policy`,
      {
        method: "PUT",
        token: adminToken,
        companyId: company.id,
        userId: admin.id,
        body: {
          labelCompleted: "Entregado con éxito",
          completedRequiresSignature: true,
          // Attempting to set companyId — should be ignored by the
          // whitelist and not error.
          companyId: "00000000-0000-0000-0000-000000000000",
        },
      },
    );
    const response = await PUT(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.labelCompleted).toBe("Entregado con éxito");
    expect(body.data.completedRequiresSignature).toBe(true);
    expect(body.data.companyId).toBe(company.id);
  });

  test("PUT rejects a body without any editable fields", async () => {
    const request = await createTestRequest(
      `/api/companies/${company.id}/delivery-policy`,
      {
        method: "PUT",
        token: adminToken,
        companyId: company.id,
        userId: admin.id,
        body: { irrelevantField: "x" },
      },
    );
    const response = await PUT(request, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(response.status).toBe(400);
  });

  test("PUT rejects non-string failureReasons entries", async () => {
    const request = await createTestRequest(
      `/api/companies/${company.id}/delivery-policy`,
      {
        method: "PUT",
        token: adminToken,
        companyId: company.id,
        userId: admin.id,
        body: { failureReasons: ["ok", 42, null] },
      },
    );
    const response = await PUT(request, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(response.status).toBe(400);
  });

  test("PUT replaces the failureReasons array atomically", async () => {
    const next = ["Sin acceso", "Pedido roto"];
    const request = await createTestRequest(
      `/api/companies/${company.id}/delivery-policy`,
      {
        method: "PUT",
        token: adminToken,
        companyId: company.id,
        userId: admin.id,
        body: { failureReasons: next },
      },
    );
    const response = await PUT(request, {
      params: Promise.resolve({ id: company.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.failureReasons).toEqual(next);
  });
});
