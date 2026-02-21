import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from "bun:test";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createFieldDefinition,
} from "../setup/test-data";
import { companyFieldDefinitions } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  GET as LIST,
  POST,
} from "@/app/api/companies/[id]/field-definitions/route";
import {
  GET as GET_ONE,
  PATCH,
  DELETE,
} from "@/app/api/companies/[id]/field-definitions/[fieldId]/route";

describe("Field Definitions CRUD", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let token: string;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    admin = await createAdmin(null);
    token = await createTestToken({
      userId: admin.id,
      companyId: null,
      email: admin.email,
      role: admin.role,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // -----------------------------------------------------------------------
  // 1. Create TEXT field with all properties
  // -----------------------------------------------------------------------
  test("POST creates TEXT field with all properties", async () => {
    const body = {
      entity: "orders",
      code: "customer_ref",
      label: "Customer Reference",
      fieldType: "text",
      required: true,
      placeholder: "Enter reference",
      position: 1,
      showInList: true,
      showInMobile: true,
      showInCsv: true,
    };

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { method: "POST", token, companyId: company.id, userId: admin.id, body },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.code).toBe("customer_ref");
    expect(data.label).toBe("Customer Reference");
    expect(data.fieldType).toBe("text");
    expect(data.required).toBe(true);
    expect(data.placeholder).toBe("Enter reference");
    expect(data.position).toBe(1);
    expect(data.showInList).toBe(true);
    expect(data.showInMobile).toBe(true);
    expect(data.showInCsv).toBe(true);
    expect(data.companyId).toBe(company.id);
    expect(data.entity).toBe("orders");
    expect(data.active).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 2. Create NUMBER field with validationRules (min/max)
  // -----------------------------------------------------------------------
  test("POST creates NUMBER field with min/max validationRules", async () => {
    const body = {
      entity: "orders",
      code: "weight_kg",
      label: "Weight (kg)",
      fieldType: "number",
      required: true,
      validationRules: { min: 0, max: 1000 },
    };

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { method: "POST", token, companyId: company.id, userId: admin.id, body },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.fieldType).toBe("number");
    expect(data.validationRules).toEqual({ min: 0, max: 1000 });
  });

  // -----------------------------------------------------------------------
  // 3. Create SELECT field with options array
  // -----------------------------------------------------------------------
  test("POST creates SELECT field with options", async () => {
    const body = {
      entity: "orders",
      code: "priority",
      label: "Priority Level",
      fieldType: "select",
      options: ["low", "medium", "high", "urgent"],
    };

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { method: "POST", token, companyId: company.id, userId: admin.id, body },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.fieldType).toBe("select");
    expect(data.options).toEqual(["low", "medium", "high", "urgent"]);
  });

  // -----------------------------------------------------------------------
  // 4. Create BOOLEAN field with defaultValue
  // -----------------------------------------------------------------------
  test("POST creates BOOLEAN field with defaultValue", async () => {
    const body = {
      entity: "orders",
      code: "is_fragile",
      label: "Fragile?",
      fieldType: "boolean",
      defaultValue: "true",
    };

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { method: "POST", token, companyId: company.id, userId: admin.id, body },
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.fieldType).toBe("boolean");
    expect(data.defaultValue).toBe("true");
  });

  // -----------------------------------------------------------------------
  // 5. Create DATE and CURRENCY fields
  // -----------------------------------------------------------------------
  test("POST creates DATE and CURRENCY fields", async () => {
    const dateBody = {
      entity: "orders",
      code: "delivery_date",
      label: "Delivery Date",
      fieldType: "date",
    };

    const dateReq = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { method: "POST", token, companyId: company.id, userId: admin.id, body: dateBody },
    );
    const dateRes = await POST(dateReq, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(dateRes.status).toBe(201);
    const dateData = await dateRes.json();
    expect(dateData.fieldType).toBe("date");

    const currencyBody = {
      entity: "orders",
      code: "cod_amount",
      label: "COD Amount",
      fieldType: "currency",
    };

    const currReq = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { method: "POST", token, companyId: company.id, userId: admin.id, body: currencyBody },
    );
    const currRes = await POST(currReq, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(currRes.status).toBe(201);
    const currData = await currRes.json();
    expect(currData.fieldType).toBe("currency");
  });

  // -----------------------------------------------------------------------
  // 6. Create PHONE and EMAIL fields
  // -----------------------------------------------------------------------
  test("POST creates PHONE and EMAIL fields", async () => {
    const phoneBody = {
      entity: "orders",
      code: "contact_phone",
      label: "Contact Phone",
      fieldType: "phone",
    };

    const phoneReq = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { method: "POST", token, companyId: company.id, userId: admin.id, body: phoneBody },
    );
    const phoneRes = await POST(phoneReq, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(phoneRes.status).toBe(201);
    const phoneData = await phoneRes.json();
    expect(phoneData.fieldType).toBe("phone");

    const emailBody = {
      entity: "orders",
      code: "contact_email",
      label: "Contact Email",
      fieldType: "email",
    };

    const emailReq = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { method: "POST", token, companyId: company.id, userId: admin.id, body: emailBody },
    );
    const emailRes = await POST(emailReq, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(emailRes.status).toBe(201);
    const emailData = await emailRes.json();
    expect(emailData.fieldType).toBe("email");
  });

  // -----------------------------------------------------------------------
  // 7. Duplicate code within same company+entity returns 409
  // -----------------------------------------------------------------------
  test("POST returns 409 for duplicate code in same company+entity", async () => {
    const body = {
      entity: "route_stops",
      code: "dup_code",
      label: "Duplicate Test",
      fieldType: "text",
    };

    // First creation succeeds
    const req1 = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { method: "POST", token, companyId: company.id, userId: admin.id, body },
    );
    const res1 = await POST(req1, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(res1.status).toBe(201);

    // Second creation with same code+entity returns 409
    const req2 = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      { method: "POST", token, companyId: company.id, userId: admin.id, body },
    );
    const res2 = await POST(req2, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(res2.status).toBe(409);

    const data = await res2.json();
    expect(data.error).toContain("dup_code");
  });

  // -----------------------------------------------------------------------
  // 8. Missing required fields returns 400
  // -----------------------------------------------------------------------
  test("POST returns 400 when required fields are missing", async () => {
    // Missing code
    const req1 = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { label: "No Code", entity: "orders" },
      },
    );
    const res1 = await POST(req1, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(res1.status).toBe(400);
    const data1 = await res1.json();
    expect(data1.error).toContain("code");

    // Missing label
    const req2 = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { code: "no_label", entity: "orders" },
      },
    );
    const res2 = await POST(req2, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(res2.status).toBe(400);

    // Missing entity
    const req3 = await createTestRequest(
      `/api/companies/${company.id}/field-definitions`,
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { code: "no_entity", label: "No Entity" },
      },
    );
    const res3 = await POST(req3, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(res3.status).toBe(400);
  });

  // -----------------------------------------------------------------------
  // 9. List active definitions ordered by position
  // -----------------------------------------------------------------------
  test("GET lists definitions ordered by position", async () => {
    // Use a separate company so we control the full dataset
    const listCo = await createCompany();
    await createFieldDefinition({
      companyId: listCo.id,
      code: "z_last",
      label: "Last",
      position: 10,
    });
    await createFieldDefinition({
      companyId: listCo.id,
      code: "a_first",
      label: "First",
      position: 1,
    });
    await createFieldDefinition({
      companyId: listCo.id,
      code: "m_mid",
      label: "Middle",
      position: 5,
    });

    const request = await createTestRequest(
      `/api/companies/${listCo.id}/field-definitions`,
      { method: "GET", token, companyId: listCo.id, userId: admin.id },
    );

    const response = await LIST(request, {
      params: Promise.resolve({ id: listCo.id }),
    });
    expect(response.status).toBe(200);

    const { data } = await response.json();
    expect(data).toHaveLength(3);
    expect(data[0].code).toBe("a_first");
    expect(data[1].code).toBe("m_mid");
    expect(data[2].code).toBe("z_last");
  });

  // -----------------------------------------------------------------------
  // 10. Filter by entity query param
  // -----------------------------------------------------------------------
  test("GET filters by entity query param", async () => {
    const filterCo = await createCompany();
    await createFieldDefinition({
      companyId: filterCo.id,
      code: "order_field",
      entity: "orders",
    });
    await createFieldDefinition({
      companyId: filterCo.id,
      code: "stop_field",
      entity: "route_stops",
    });

    const request = await createTestRequest(
      `/api/companies/${filterCo.id}/field-definitions`,
      {
        method: "GET",
        token,
        companyId: filterCo.id,
        userId: admin.id,
        searchParams: { entity: "orders" },
      },
    );

    const response = await LIST(request, {
      params: Promise.resolve({ id: filterCo.id }),
    });
    expect(response.status).toBe(200);

    const { data } = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0].code).toBe("order_field");
    expect(data[0].entity).toBe("orders");
  });

  // -----------------------------------------------------------------------
  // 11. Get single field by ID; 404 for non-existent
  // -----------------------------------------------------------------------
  test("GET single field by ID and 404 for non-existent", async () => {
    const field = await createFieldDefinition({
      companyId: company.id,
      code: "get_one_test",
      label: "Get One",
    });

    // Existing field
    const req1 = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${field.id}`,
      { method: "GET", token, companyId: company.id, userId: admin.id },
    );
    const res1 = await GET_ONE(req1, {
      params: Promise.resolve({ id: company.id, fieldId: field.id }),
    });
    expect(res1.status).toBe(200);
    const data = await res1.json();
    expect(data.id).toBe(field.id);
    expect(data.code).toBe("get_one_test");

    // Non-existent field
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const req2 = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${fakeId}`,
      { method: "GET", token, companyId: company.id, userId: admin.id },
    );
    const res2 = await GET_ONE(req2, {
      params: Promise.resolve({ id: company.id, fieldId: fakeId }),
    });
    expect(res2.status).toBe(404);
    const errData = await res2.json();
    expect(errData.error).toContain("not found");
  });

  // -----------------------------------------------------------------------
  // 12. Update label, required, options, position via PATCH
  // -----------------------------------------------------------------------
  test("PATCH updates label, required, options, position", async () => {
    const field = await createFieldDefinition({
      companyId: company.id,
      code: "patch_test",
      label: "Original",
      fieldType: "select",
      options: ["a", "b"],
      required: false,
      position: 0,
    });

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${field.id}`,
      {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          label: "Updated Label",
          required: true,
          options: ["a", "b", "c"],
          position: 5,
        },
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: company.id, fieldId: field.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.label).toBe("Updated Label");
    expect(data.required).toBe(true);
    expect(data.options).toEqual(["a", "b", "c"]);
    expect(data.position).toBe(5);
    // code should remain unchanged
    expect(data.code).toBe("patch_test");
  });

  // -----------------------------------------------------------------------
  // 13. Deactivate field via DELETE (soft delete)
  // -----------------------------------------------------------------------
  test("DELETE soft-deletes a field (sets active to false)", async () => {
    const field = await createFieldDefinition({
      companyId: company.id,
      code: "delete_test",
      label: "To Delete",
    });

    const request = await createTestRequest(
      `/api/companies/${company.id}/field-definitions/${field.id}`,
      { method: "DELETE", token, companyId: company.id, userId: admin.id },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ id: company.id, fieldId: field.id }),
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.active).toBe(false);

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(companyFieldDefinitions)
      .where(eq(companyFieldDefinitions.id, field.id));
    expect(dbRecord.active).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 14. Tenant isolation - Company B cannot see Company A's fields
  // -----------------------------------------------------------------------
  test("tenant isolation: Company B cannot see Company A fields", async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();

    await createFieldDefinition({
      companyId: companyA.id,
      code: "isolated_field",
      label: "A Only",
    });

    // Admin queries Company B's fields
    const request = await createTestRequest(
      `/api/companies/${companyB.id}/field-definitions`,
      { method: "GET", token, companyId: companyB.id, userId: admin.id },
    );

    const response = await LIST(request, {
      params: Promise.resolve({ id: companyB.id }),
    });
    expect(response.status).toBe(200);

    const { data } = await response.json();
    const codes = data.map((d: { code: string }) => d.code);
    expect(codes).not.toContain("isolated_field");
  });
});
