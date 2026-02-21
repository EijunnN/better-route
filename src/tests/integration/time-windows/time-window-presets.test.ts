import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createPlanner,
  createTimeWindowPreset,
} from "../setup/test-data";
import { timeWindowPresets } from "@/db/schema";
import { GET, POST } from "@/app/api/time-window-presets/route";
import {
  GET as GET_ONE,
  PATCH,
  DELETE,
} from "@/app/api/time-window-presets/[id]/route";

describe("Time Window Presets", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let token: string;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    admin = await createAdmin(null);
    token = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: admin.role,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // 1. Create SHIFT preset with start/end
  test("POST creates SHIFT preset with start and end time", async () => {
    const body = {
      name: "Morning Shift",
      type: "SHIFT",
      startTime: "08:00",
      endTime: "18:00",
    };

    const request = await createTestRequest("/api/time-window-presets", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.name).toBe("Morning Shift");
    expect(data.type).toBe("SHIFT");
    expect(data.startTime).toBe("08:00:00");
    expect(data.endTime).toBe("18:00:00");
    expect(data.strictness).toBe("HARD");
    expect(data.active).toBe(true);
    expect(data.companyId).toBe(company.id);

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(timeWindowPresets)
      .where(eq(timeWindowPresets.id, data.id));
    expect(dbRecord).toBeDefined();
    expect(dbRecord.name).toBe("Morning Shift");
  });

  // 2. Create RANGE preset
  test("POST creates RANGE preset with start and end time", async () => {
    const body = {
      name: "Morning Range",
      type: "RANGE",
      startTime: "09:00",
      endTime: "12:00",
    };

    const request = await createTestRequest("/api/time-window-presets", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.name).toBe("Morning Range");
    expect(data.type).toBe("RANGE");
    expect(data.startTime).toBe("09:00:00");
    expect(data.endTime).toBe("12:00:00");
    expect(data.strictness).toBe("HARD");
  });

  // 3. Create EXACT preset
  test("POST creates EXACT preset with exactTime and tolerance", async () => {
    const body = {
      name: "Exact Delivery",
      type: "EXACT",
      exactTime: "14:00",
      toleranceMinutes: 30,
    };

    const request = await createTestRequest("/api/time-window-presets", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.name).toBe("Exact Delivery");
    expect(data.type).toBe("EXACT");
    expect(data.exactTime).toBe("14:00:00");
    expect(data.toleranceMinutes).toBe(30);
    expect(data.strictness).toBe("HARD");
  });

  // 4. Duplicate name returns 409
  test("POST returns 409 for duplicate name in same company", async () => {
    await createTimeWindowPreset({
      companyId: company.id,
      name: "Duplicate Name",
    });

    const request = await createTestRequest("/api/time-window-presets", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Duplicate Name",
        type: "SHIFT",
        startTime: "06:00",
        endTime: "14:00",
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(409);

    const data = await response.json();
    expect(data.error).toContain("already exists");
  });

  // 5. List active presets
  test("GET lists active presets", async () => {
    const request = await createTestRequest("/api/time-window-presets", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const { data, meta } = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((p: { active: boolean }) => p.active === true)).toBe(
      true,
    );
    expect(meta).toBeDefined();
    expect(meta.total).toBeGreaterThan(0);
  });

  // 6. Update name and times
  test("PATCH updates name and times", async () => {
    const preset = await createTimeWindowPreset({
      companyId: company.id,
      name: "To Update",
      type: "SHIFT",
      startTime: "08:00",
      endTime: "18:00",
    });

    const request = await createTestRequest(
      `/api/time-window-presets/${preset.id}`,
      {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          id: preset.id,
          name: "Updated Shift",
          startTime: "07:00",
          endTime: "19:00",
        },
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: preset.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.name).toBe("Updated Shift");
    expect(data.startTime).toBe("07:00:00");
    expect(data.endTime).toBe("19:00:00");

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(timeWindowPresets)
      .where(eq(timeWindowPresets.id, preset.id));
    expect(dbRecord.name).toBe("Updated Shift");
    expect(dbRecord.startTime).toBe("07:00:00");
  });

  // 7. Soft delete sets active=false
  test("DELETE soft deletes preset (active=false)", async () => {
    const preset = await createTimeWindowPreset({
      companyId: company.id,
      name: "To Delete",
    });

    const request = await createTestRequest(
      `/api/time-window-presets/${preset.id}`,
      {
        method: "DELETE",
        token,
        companyId: company.id,
        userId: admin.id,
      },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: preset.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);

    // Verify in DB: active should be false
    const [dbRecord] = await testDb
      .select()
      .from(timeWindowPresets)
      .where(eq(timeWindowPresets.id, preset.id));
    expect(dbRecord.active).toBe(false);
  });

  // 8. Tenant isolation - Company B cannot see Company A's presets
  test("GET enforces tenant isolation between companies", async () => {
    // Ensure company A has at least one preset
    await createTimeWindowPreset({
      companyId: company.id,
      name: "Company A Preset",
    });

    // Create company B with its own planner
    const companyB = await createCompany();
    const plannerB = await createPlanner(companyB.id);
    const tokenB = await createTestToken({
      userId: plannerB.id,
      companyId: companyB.id,
      email: plannerB.email,
      role: plannerB.role,
    });

    const request = await createTestRequest("/api/time-window-presets", {
      method: "GET",
      token: tokenB,
      companyId: companyB.id,
      userId: plannerB.id,
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const { data } = await response.json();
    expect(data).toHaveLength(0);
  });
});
