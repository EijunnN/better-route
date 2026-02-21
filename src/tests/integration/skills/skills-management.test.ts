import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { eq } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createDriver,
  createVehicle,
  createVehicleSkill,
  createUserSkillAssignment,
  createVehicleSkillAssignment,
} from "../setup/test-data";
import {
  vehicleSkills,
  userSkills,
  vehicleSkillAssignments,
} from "@/db/schema";

// Route handlers
import {
  GET as LIST_VEHICLE_SKILLS,
  POST as CREATE_VEHICLE_SKILL,
} from "@/app/api/vehicle-skills/route";
import {
  PATCH as PATCH_VEHICLE_SKILL,
  DELETE as DELETE_VEHICLE_SKILL,
} from "@/app/api/vehicle-skills/[id]/route";
import {
  GET as LIST_USER_SKILLS,
  POST as CREATE_USER_SKILL,
} from "@/app/api/user-skills/route";
import {
  GET as GET_USER_SKILL,
  PATCH as PATCH_USER_SKILL,
  DELETE as DELETE_USER_SKILL,
} from "@/app/api/user-skills/[id]/route";
import {
  GET as GET_VEHICLE_SKILLS,
  PUT as PUT_VEHICLE_SKILLS,
} from "@/app/api/vehicles/[id]/skills/route";

describe("Skills Management", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let company2: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let admin2: Awaited<ReturnType<typeof createAdmin>>;
  let token: string;
  let token2: string;
  let driver: Awaited<ReturnType<typeof createDriver>>;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany();
    company2 = await createCompany();
    admin = await createAdmin(company.id);
    admin2 = await createAdmin(company2.id);
    driver = await createDriver(company.id);
    token = await createTestToken({
      userId: admin.id,
      companyId: company.id,
      email: admin.email,
      role: admin.role,
    });
    token2 = await createTestToken({
      userId: admin2.id,
      companyId: company2.id,
      email: admin2.email,
      role: admin2.role,
    });
  });

  beforeEach(async () => {
    // Clean skill-related tables between tests
    await testDb
      .delete(vehicleSkillAssignments)
      .where(eq(vehicleSkillAssignments.companyId, company.id));
    await testDb
      .delete(vehicleSkillAssignments)
      .where(eq(vehicleSkillAssignments.companyId, company2.id));
    await testDb
      .delete(userSkills)
      .where(eq(userSkills.companyId, company.id));
    await testDb
      .delete(userSkills)
      .where(eq(userSkills.companyId, company2.id));
    await testDb
      .delete(vehicleSkills)
      .where(eq(vehicleSkills.companyId, company.id));
    await testDb
      .delete(vehicleSkills)
      .where(eq(vehicleSkills.companyId, company2.id));
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // =========================================================================
  // Vehicle Skills CRUD
  // =========================================================================

  describe("Vehicle Skills", () => {
    // -----------------------------------------------------------------------
    // 1. POST /vehicle-skills creates skill (201)
    // -----------------------------------------------------------------------
    test("POST /api/vehicle-skills creates skill (201)", async () => {
      const body = {
        code: "COLD_CHAIN",
        name: "Cadena de Frio",
        category: "TEMPERATURE",
        description: "Transporte refrigerado",
      };

      const request = await createTestRequest("/api/vehicle-skills", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body,
      });

      const response = await CREATE_VEHICLE_SKILL(request);
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.code).toBe("COLD_CHAIN");
      expect(data.name).toBe("Cadena de Frio");
      expect(data.category).toBe("TEMPERATURE");
      expect(data.description).toBe("Transporte refrigerado");
      expect(data.active).toBe(true);
      expect(data.companyId).toBe(company.id);
      expect(data.id).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // 2. POST /vehicle-skills duplicate code returns 400
    // -----------------------------------------------------------------------
    test("POST /api/vehicle-skills duplicate code returns 400", async () => {
      await createVehicleSkill({
        companyId: company.id,
        code: "CRANE",
        name: "Grua",
        category: "EQUIPMENT",
      });

      const request = await createTestRequest("/api/vehicle-skills", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          code: "CRANE",
          name: "Grua Duplicada",
          category: "EQUIPMENT",
        },
      });

      const response = await CREATE_VEHICLE_SKILL(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe("Ya existe una habilidad con este código");
    });

    // -----------------------------------------------------------------------
    // 3. GET /vehicle-skills lists with category filter + search
    // -----------------------------------------------------------------------
    test("GET /api/vehicle-skills lists with category filter and search", async () => {
      await createVehicleSkill({
        companyId: company.id,
        code: "REFRIGERADO",
        name: "Transporte Refrigerado",
        category: "TEMPERATURE",
      });
      await createVehicleSkill({
        companyId: company.id,
        code: "CRANE_A",
        name: "Grua Articulada",
        category: "EQUIPMENT",
      });
      await createVehicleSkill({
        companyId: company.id,
        code: "CRANE_B",
        name: "Grua Telescopica",
        category: "EQUIPMENT",
      });

      // List all
      const reqAll = await createTestRequest("/api/vehicle-skills", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });
      const resAll = await LIST_VEHICLE_SKILLS(reqAll);
      expect(resAll.status).toBe(200);
      const allData = await resAll.json();
      expect(allData.data.length).toBe(3);
      expect(allData.meta.total).toBe(3);

      // Filter by category
      const reqCat = await createTestRequest("/api/vehicle-skills", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { category: "EQUIPMENT" },
      });
      const resCat = await LIST_VEHICLE_SKILLS(reqCat);
      expect(resCat.status).toBe(200);
      const catData = await resCat.json();
      expect(catData.data.length).toBe(2);
      expect(catData.data.every((s: any) => s.category === "EQUIPMENT")).toBe(true);

      // Search by name
      const reqSearch = await createTestRequest("/api/vehicle-skills", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { search: "Telescopica" },
      });
      const resSearch = await LIST_VEHICLE_SKILLS(reqSearch);
      expect(resSearch.status).toBe(200);
      const searchData = await resSearch.json();
      expect(searchData.data.length).toBe(1);
      expect(searchData.data[0].code).toBe("CRANE_B");
    });

    // -----------------------------------------------------------------------
    // 4. PATCH /vehicle-skills/[id] updates name
    // -----------------------------------------------------------------------
    test("PATCH /api/vehicle-skills/[id] updates name", async () => {
      const skill = await createVehicleSkill({
        companyId: company.id,
        code: "HAZMAT",
        name: "Materiales Peligrosos",
        category: "CERTIFICATIONS",
      });

      const request = await createTestRequest(`/api/vehicle-skills/${skill.id}`, {
        method: "PATCH",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { name: "Manejo de Materiales Peligrosos" },
      });

      const response = await PATCH_VEHICLE_SKILL(request, {
        params: Promise.resolve({ id: skill.id }),
      });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.name).toBe("Manejo de Materiales Peligrosos");
      expect(data.code).toBe("HAZMAT");
    });

    // -----------------------------------------------------------------------
    // 5. DELETE /vehicle-skills/[id] hard deletes
    // -----------------------------------------------------------------------
    test("DELETE /api/vehicle-skills/[id] hard deletes", async () => {
      const skill = await createVehicleSkill({
        companyId: company.id,
        code: "TEMP_SKILL",
        name: "Temporal",
        category: "SPECIAL",
      });

      const request = await createTestRequest(`/api/vehicle-skills/${skill.id}`, {
        method: "DELETE",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await DELETE_VEHICLE_SKILL(request, {
        params: Promise.resolve({ id: skill.id }),
      });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify it's gone from DB
      const remaining = await testDb
        .select()
        .from(vehicleSkills)
        .where(eq(vehicleSkills.id, skill.id));
      expect(remaining.length).toBe(0);
    });

    // -----------------------------------------------------------------------
    // 6. Tenant isolation (vehicle-skills)
    // -----------------------------------------------------------------------
    test("vehicle-skills are isolated by tenant", async () => {
      // Create skill in company1
      const skill1 = await createVehicleSkill({
        companyId: company.id,
        code: "SKILL_CO1",
        name: "Skill Company 1",
        category: "EQUIPMENT",
      });

      // Create skill in company2
      await createVehicleSkill({
        companyId: company2.id,
        code: "SKILL_CO2",
        name: "Skill Company 2",
        category: "EQUIPMENT",
      });

      // Company1 should only see its own skills
      const req1 = await createTestRequest("/api/vehicle-skills", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });
      const res1 = await LIST_VEHICLE_SKILLS(req1);
      const data1 = await res1.json();
      expect(data1.data.length).toBe(1);
      expect(data1.data[0].code).toBe("SKILL_CO1");

      // Company2 should only see its own skills
      const req2 = await createTestRequest("/api/vehicle-skills", {
        method: "GET",
        token: token2,
        companyId: company2.id,
        userId: admin2.id,
      });
      const res2 = await LIST_VEHICLE_SKILLS(req2);
      const data2 = await res2.json();
      expect(data2.data.length).toBe(1);
      expect(data2.data[0].code).toBe("SKILL_CO2");

      // Company2 cannot PATCH company1's skill
      const patchReq = await createTestRequest(
        `/api/vehicle-skills/${skill1.id}`,
        {
          method: "PATCH",
          token: token2,
          companyId: company2.id,
          userId: admin2.id,
          body: { name: "Hacked" },
        },
      );
      const patchRes = await PATCH_VEHICLE_SKILL(patchReq, {
        params: Promise.resolve({ id: skill1.id }),
      });
      expect(patchRes.status).toBe(404);
    });
  });

  // =========================================================================
  // User Skills (driver skill assignments)
  // =========================================================================

  describe("User Skills", () => {
    // -----------------------------------------------------------------------
    // 7. POST /user-skills assigns skill to driver (201)
    // -----------------------------------------------------------------------
    test("POST /api/user-skills assigns skill to driver (201)", async () => {
      const skill = await createVehicleSkill({
        companyId: company.id,
        code: "LICENCE_A",
        name: "Licencia A",
        category: "CERTIFICATIONS",
      });

      const request = await createTestRequest("/api/user-skills", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          userId: driver.id,
          skillId: skill.id,
          obtainedAt: "2025-01-15T00:00:00.000Z",
          expiresAt: "2027-06-15T00:00:00.000Z",
        },
      });

      const response = await CREATE_USER_SKILL(request);
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.userId).toBe(driver.id);
      expect(data.skillId).toBe(skill.id);
      expect(data.active).toBe(true);
      expect(data.user).toBeDefined();
      expect(data.user.id).toBe(driver.id);
      expect(data.skill).toBeDefined();
      expect(data.skill.id).toBe(skill.id);
      expect(data.skill.code).toBe("LICENCE_A");
    });

    // -----------------------------------------------------------------------
    // 8. POST /user-skills duplicate active assignment returns 400
    // -----------------------------------------------------------------------
    test("POST /api/user-skills duplicate active assignment returns 400", async () => {
      const skill = await createVehicleSkill({
        companyId: company.id,
        code: "DUP_SKILL",
        name: "Duplicatable",
        category: "EQUIPMENT",
      });

      // First assignment
      await createUserSkillAssignment({
        companyId: company.id,
        userId: driver.id,
        skillId: skill.id,
        active: true,
      });

      // Second assignment should fail
      const request = await createTestRequest("/api/user-skills", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: {
          userId: driver.id,
          skillId: skill.id,
        },
      });

      const response = await CREATE_USER_SKILL(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe(
        "Este usuario ya tiene esta habilidad asignada y activa",
      );
    });

    // -----------------------------------------------------------------------
    // 9. GET /user-skills lists with expiry status calculation
    // -----------------------------------------------------------------------
    test("GET /api/user-skills lists with expiry status", async () => {
      const skill = await createVehicleSkill({
        companyId: company.id,
        code: "EXPIRY_TEST",
        name: "Expiry Test Skill",
        category: "CERTIFICATIONS",
      });

      // Valid skill (expires far in future)
      await createUserSkillAssignment({
        companyId: company.id,
        userId: driver.id,
        skillId: skill.id,
        obtainedAt: new Date("2025-01-01"),
        expiresAt: new Date("2028-12-31"),
        active: true,
      });

      const request = await createTestRequest("/api/user-skills", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const response = await LIST_USER_SKILLS(request);
      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result.data.length).toBe(1);
      expect(result.data[0].expiryStatus).toBe("valid");
      expect(result.data[0].user).toBeDefined();
      expect(result.data[0].skill).toBeDefined();
      expect(result.meta).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // 10. PATCH /user-skills/[id] updates expiry dates
    // -----------------------------------------------------------------------
    test("PATCH /api/user-skills/[id] updates expiry dates", async () => {
      const skill = await createVehicleSkill({
        companyId: company.id,
        code: "PATCH_SKILL",
        name: "Patchable Skill",
        category: "CERTIFICATIONS",
      });

      const assignment = await createUserSkillAssignment({
        companyId: company.id,
        userId: driver.id,
        skillId: skill.id,
        obtainedAt: new Date("2025-01-01"),
        expiresAt: new Date("2026-12-31"),
        active: true,
      });

      const newExpiry = "2028-06-30T00:00:00.000Z";
      const request = await createTestRequest(
        `/api/user-skills/${assignment.id}`,
        {
          method: "PATCH",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { expiresAt: newExpiry },
        },
      );

      const response = await PATCH_USER_SKILL(request, {
        params: Promise.resolve({ id: assignment.id }),
      });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.expiresAt).toContain("2028-06-30");
      expect(data.expiryStatus).toBe("valid");
      expect(data.user).toBeDefined();
      expect(data.skill).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // 11. DELETE /user-skills/[id] soft deletes
    // -----------------------------------------------------------------------
    test("DELETE /api/user-skills/[id] soft deletes (sets active=false)", async () => {
      const skill = await createVehicleSkill({
        companyId: company.id,
        code: "DEL_SKILL",
        name: "Deletable Skill",
        category: "EQUIPMENT",
      });

      const assignment = await createUserSkillAssignment({
        companyId: company.id,
        userId: driver.id,
        skillId: skill.id,
        active: true,
      });

      const request = await createTestRequest(
        `/api/user-skills/${assignment.id}`,
        {
          method: "DELETE",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await DELETE_USER_SKILL(request, {
        params: Promise.resolve({ id: assignment.id }),
      });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe(
        "Habilidad de usuario desactivada exitosamente",
      );

      // Verify it is soft-deleted (still in DB but active=false)
      const [record] = await testDb
        .select()
        .from(userSkills)
        .where(eq(userSkills.id, assignment.id));
      expect(record).toBeDefined();
      expect(record.active).toBe(false);
    });

    // -----------------------------------------------------------------------
    // 12. GET /user-skills/[id] includes computed expiryStatus
    // -----------------------------------------------------------------------
    test("GET /api/user-skills/[id] includes computed expiryStatus", async () => {
      const skill = await createVehicleSkill({
        companyId: company.id,
        code: "STATUS_SKILL",
        name: "Status Skill",
        category: "CERTIFICATIONS",
      });

      // Create with past expiry date -> should be "expired"
      const assignment = await createUserSkillAssignment({
        companyId: company.id,
        userId: driver.id,
        skillId: skill.id,
        obtainedAt: new Date("2023-01-01"),
        expiresAt: new Date("2024-01-01"),
        active: true,
      });

      const request = await createTestRequest(
        `/api/user-skills/${assignment.id}`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await GET_USER_SKILL(request, {
        params: Promise.resolve({ id: assignment.id }),
      });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.expiryStatus).toBe("expired");
      expect(data.user).toBeDefined();
      expect(data.skill).toBeDefined();
      expect(data.obtainedAt).toBeDefined();
      expect(data.expiresAt).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // 13. Tenant isolation (user-skills)
    // -----------------------------------------------------------------------
    test("user-skills are isolated by tenant", async () => {
      const skill1 = await createVehicleSkill({
        companyId: company.id,
        code: "TENANT_S1",
        name: "Tenant Skill 1",
        category: "EQUIPMENT",
      });

      const driver2 = await createDriver(company2.id);
      const skill2 = await createVehicleSkill({
        companyId: company2.id,
        code: "TENANT_S2",
        name: "Tenant Skill 2",
        category: "EQUIPMENT",
      });

      await createUserSkillAssignment({
        companyId: company.id,
        userId: driver.id,
        skillId: skill1.id,
        active: true,
      });

      await createUserSkillAssignment({
        companyId: company2.id,
        userId: driver2.id,
        skillId: skill2.id,
        active: true,
      });

      // Company1 lists only its own user skills
      const req1 = await createTestRequest("/api/user-skills", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });
      const res1 = await LIST_USER_SKILLS(req1);
      const data1 = await res1.json();
      expect(data1.data.length).toBe(1);
      expect(data1.data[0].skill.code).toBe("TENANT_S1");

      // Company2 lists only its own user skills
      const req2 = await createTestRequest("/api/user-skills", {
        method: "GET",
        token: token2,
        companyId: company2.id,
        userId: admin2.id,
      });
      const res2 = await LIST_USER_SKILLS(req2);
      const data2 = await res2.json();
      expect(data2.data.length).toBe(1);
      expect(data2.data[0].skill.code).toBe("TENANT_S2");
    });
  });

  // =========================================================================
  // Vehicle Skill Assignments (via /vehicles/[id]/skills)
  // =========================================================================

  describe("Vehicle Skill Assignments", () => {
    // -----------------------------------------------------------------------
    // 14. GET /vehicles/[id]/skills returns assigned skills
    // -----------------------------------------------------------------------
    test("GET /api/vehicles/[id]/skills returns assigned skills", async () => {
      const vehicle = await createVehicle({ companyId: company.id });
      const skillA = await createVehicleSkill({
        companyId: company.id,
        code: "ASSIGN_A",
        name: "Assignment A",
        category: "EQUIPMENT",
      });
      const skillB = await createVehicleSkill({
        companyId: company.id,
        code: "ASSIGN_B",
        name: "Assignment B",
        category: "TEMPERATURE",
      });

      await createVehicleSkillAssignment({
        companyId: company.id,
        vehicleId: vehicle.id,
        skillId: skillA.id,
        active: true,
      });
      await createVehicleSkillAssignment({
        companyId: company.id,
        vehicleId: vehicle.id,
        skillId: skillB.id,
        active: true,
      });

      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/skills`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await GET_VEHICLE_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result.data.length).toBe(2);
      expect(result.skillIds.length).toBe(2);
      expect(result.skillIds).toContain(skillA.id);
      expect(result.skillIds).toContain(skillB.id);
      expect(result.data[0].skill).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // 15. PUT /vehicles/[id]/skills replaces all skill assignments
    // -----------------------------------------------------------------------
    test("PUT /api/vehicles/[id]/skills replaces all assignments", async () => {
      const vehicle = await createVehicle({ companyId: company.id });
      const skillA = await createVehicleSkill({
        companyId: company.id,
        code: "REPLACE_A",
        name: "Replace A",
        category: "EQUIPMENT",
      });
      const skillB = await createVehicleSkill({
        companyId: company.id,
        code: "REPLACE_B",
        name: "Replace B",
        category: "TEMPERATURE",
      });
      const skillC = await createVehicleSkill({
        companyId: company.id,
        code: "REPLACE_C",
        name: "Replace C",
        category: "SPECIAL",
      });

      // Initially assign A and B
      await createVehicleSkillAssignment({
        companyId: company.id,
        vehicleId: vehicle.id,
        skillId: skillA.id,
        active: true,
      });
      await createVehicleSkillAssignment({
        companyId: company.id,
        vehicleId: vehicle.id,
        skillId: skillB.id,
        active: true,
      });

      // Replace with C only (non-overlapping to avoid unique constraint on deactivated rows)
      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/skills`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { skillIds: [skillC.id] },
        },
      );

      const response = await PUT_VEHICLE_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(200);

      const result = await response.json();
      expect(result.data.length).toBe(1);
      expect(result.skillIds).toContain(skillC.id);
      expect(result.skillIds).not.toContain(skillA.id);
      expect(result.skillIds).not.toContain(skillB.id);
    });

    // -----------------------------------------------------------------------
    // 16. PUT /vehicles/[id]/skills with non-existent skillId returns 400
    // -----------------------------------------------------------------------
    test("PUT /api/vehicles/[id]/skills with non-existent skillId returns 400", async () => {
      const vehicle = await createVehicle({ companyId: company.id });

      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/skills`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: {
            skillIds: ["00000000-0000-4000-a000-000000000099"],
          },
        },
      );

      const response = await PUT_VEHICLE_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe("One or more skills not found or inactive");
    });
  });
});
