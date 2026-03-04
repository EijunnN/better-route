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
  createVehicle,
  createVehicleSkill,
  createVehicleSkillAssignment,
} from "../setup/test-data";
import { vehicleSkillAssignments, vehicleSkills, vehicles } from "@/db/schema";
import {
  GET as GET_SKILLS,
  PUT as PUT_SKILLS,
} from "@/app/api/vehicles/[id]/skills/route";

describe("Vehicle Detail — Skills", () => {
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
    // Clean skill-related tables between tests
    await testDb
      .delete(vehicleSkillAssignments)
      .where(eq(vehicleSkillAssignments.companyId, company.id));
    await testDb
      .delete(vehicleSkills)
      .where(eq(vehicleSkills.companyId, company.id));
    await testDb
      .delete(vehicles)
      .where(eq(vehicles.companyId, company.id));
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // =========================================================================
  // GET /api/vehicles/[id]/skills
  // =========================================================================

  describe("GET /api/vehicles/[id]/skills", () => {
    // -------------------------------------------------------------------
    // 1. Returns assigned skills for a vehicle
    // -------------------------------------------------------------------
    test("returns skills assigned to a vehicle", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "SK-001",
      });
      const skill1 = await createVehicleSkill({
        companyId: company.id,
        name: "Refrigeration",
        code: "REFRIG",
        category: "EQUIPMENT",
      });
      const skill2 = await createVehicleSkill({
        companyId: company.id,
        name: "Lifting",
        code: "LIFT",
        category: "EQUIPMENT",
      });

      await createVehicleSkillAssignment({
        companyId: company.id,
        vehicleId: vehicle.id,
        skillId: skill1.id,
      });
      await createVehicleSkillAssignment({
        companyId: company.id,
        vehicleId: vehicle.id,
        skillId: skill2.id,
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

      const response = await GET_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data).toBeDefined();
      expect(body.data.length).toBe(2);
      expect(body.skillIds).toBeDefined();
      expect(body.skillIds.length).toBe(2);
      expect(body.skillIds).toContain(skill1.id);
      expect(body.skillIds).toContain(skill2.id);

      // Verify skill details are included
      const skillNames = body.data.map((a: any) => a.skill.name);
      expect(skillNames).toContain("Refrigeration");
      expect(skillNames).toContain("Lifting");
    });

    // -------------------------------------------------------------------
    // 2. Returns empty array when no skills assigned
    // -------------------------------------------------------------------
    test("returns empty data when vehicle has no skills", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "SK-002",
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

      const response = await GET_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data).toEqual([]);
      expect(body.skillIds).toEqual([]);
    });

    // -------------------------------------------------------------------
    // 3. Only returns active assignments
    // -------------------------------------------------------------------
    test("only returns active skill assignments", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "SK-003",
      });
      const activeSkill = await createVehicleSkill({
        companyId: company.id,
        name: "Active Skill",
        code: "ACTIVE",
      });
      const inactiveSkill = await createVehicleSkill({
        companyId: company.id,
        name: "Inactive Skill",
        code: "INACTIVE",
      });

      await createVehicleSkillAssignment({
        companyId: company.id,
        vehicleId: vehicle.id,
        skillId: activeSkill.id,
        active: true,
      });
      await createVehicleSkillAssignment({
        companyId: company.id,
        vehicleId: vehicle.id,
        skillId: inactiveSkill.id,
        active: false,
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

      const response = await GET_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBe(1);
      expect(body.skillIds).toContain(activeSkill.id);
      expect(body.skillIds).not.toContain(inactiveSkill.id);
    });

    // -------------------------------------------------------------------
    // 4. Returns 404 for non-existent vehicle
    // -------------------------------------------------------------------
    test("returns 404 for non-existent vehicle", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";

      const request = await createTestRequest(
        `/api/vehicles/${fakeId}/skills`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const response = await GET_SKILLS(request, {
        params: Promise.resolve({ id: fakeId }),
      });
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe("Vehicle not found");
    });

    // -------------------------------------------------------------------
    // 5. Includes skill details (code, name, category, description)
    // -------------------------------------------------------------------
    test("includes full skill details in response", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "SK-004",
      });
      const skill = await createVehicleSkill({
        companyId: company.id,
        name: "Heavy Lifting",
        code: "HEAVY_LIFT",
        category: "EQUIPMENT",
        description: "Can lift heavy loads",
      });

      await createVehicleSkillAssignment({
        companyId: company.id,
        vehicleId: vehicle.id,
        skillId: skill.id,
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

      const response = await GET_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBe(1);

      const assignment = body.data[0];
      expect(assignment.skill.id).toBe(skill.id);
      expect(assignment.skill.code).toBe("HEAVY_LIFT");
      expect(assignment.skill.name).toBe("Heavy Lifting");
      expect(assignment.skill.category).toBe("EQUIPMENT");
      expect(assignment.skill.description).toBe("Can lift heavy loads");
      expect(assignment.skillId).toBe(skill.id);
      expect(assignment.active).toBe(true);
    });
  });

  // =========================================================================
  // PUT /api/vehicles/[id]/skills — Replace all skill assignments
  // =========================================================================

  describe("PUT /api/vehicles/[id]/skills", () => {
    // -------------------------------------------------------------------
    // 6. Assigns skills to a vehicle
    // -------------------------------------------------------------------
    test("assigns skills to a vehicle", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "PUT-001",
      });
      const skill1 = await createVehicleSkill({
        companyId: company.id,
        name: "GPS Tracking",
        code: "GPS",
      });
      const skill2 = await createVehicleSkill({
        companyId: company.id,
        name: "Temperature Control",
        code: "TEMP",
      });

      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/skills`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { skillIds: [skill1.id, skill2.id] },
        },
      );

      const response = await PUT_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBe(2);
      expect(body.skillIds).toContain(skill1.id);
      expect(body.skillIds).toContain(skill2.id);

      // Verify in DB
      const dbAssignments = await testDb
        .select()
        .from(vehicleSkillAssignments)
        .where(
          and(
            eq(vehicleSkillAssignments.vehicleId, vehicle.id),
            eq(vehicleSkillAssignments.companyId, company.id),
            eq(vehicleSkillAssignments.active, true),
          ),
        );
      expect(dbAssignments.length).toBe(2);
    });

    // -------------------------------------------------------------------
    // 7. Replaces existing assignments with new set
    // -------------------------------------------------------------------
    test("replaces existing skill assignments with new set", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "PUT-002",
      });
      const oldSkill = await createVehicleSkill({
        companyId: company.id,
        name: "Old Skill",
        code: "OLD",
      });
      const newSkill = await createVehicleSkill({
        companyId: company.id,
        name: "New Skill",
        code: "NEW",
      });

      // First assign the old skill
      await createVehicleSkillAssignment({
        companyId: company.id,
        vehicleId: vehicle.id,
        skillId: oldSkill.id,
      });

      // Replace with new skill
      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/skills`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { skillIds: [newSkill.id] },
        },
      );

      const response = await PUT_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data.length).toBe(1);
      expect(body.skillIds).toContain(newSkill.id);
      expect(body.skillIds).not.toContain(oldSkill.id);

      // Verify old assignment is deactivated in DB
      const oldAssignments = await testDb
        .select()
        .from(vehicleSkillAssignments)
        .where(
          and(
            eq(vehicleSkillAssignments.vehicleId, vehicle.id),
            eq(vehicleSkillAssignments.skillId, oldSkill.id),
            eq(vehicleSkillAssignments.active, true),
          ),
        );
      expect(oldAssignments.length).toBe(0);
    });

    // -------------------------------------------------------------------
    // 8. Clears all skills with empty array
    // -------------------------------------------------------------------
    test("clears all skills when given empty skillIds array", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "PUT-003",
      });
      const skill = await createVehicleSkill({
        companyId: company.id,
        name: "To Remove",
        code: "REMOVE",
      });

      await createVehicleSkillAssignment({
        companyId: company.id,
        vehicleId: vehicle.id,
        skillId: skill.id,
      });

      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/skills`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { skillIds: [] },
        },
      );

      const response = await PUT_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data).toEqual([]);
      expect(body.skillIds).toEqual([]);

      // Verify all assignments are deactivated
      const activeAssignments = await testDb
        .select()
        .from(vehicleSkillAssignments)
        .where(
          and(
            eq(vehicleSkillAssignments.vehicleId, vehicle.id),
            eq(vehicleSkillAssignments.companyId, company.id),
            eq(vehicleSkillAssignments.active, true),
          ),
        );
      expect(activeAssignments.length).toBe(0);
    });

    // -------------------------------------------------------------------
    // 9. Returns 404 for non-existent vehicle
    // -------------------------------------------------------------------
    test("returns 404 for non-existent vehicle", async () => {
      const fakeId = "00000000-0000-0000-0000-000000000000";
      const skill = await createVehicleSkill({
        companyId: company.id,
        name: "Any Skill",
        code: "ANY",
      });

      const request = await createTestRequest(
        `/api/vehicles/${fakeId}/skills`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { skillIds: [skill.id] },
        },
      );

      const response = await PUT_SKILLS(request, {
        params: Promise.resolve({ id: fakeId }),
      });
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe("Vehicle not found");
    });

    // -------------------------------------------------------------------
    // 10. Returns 400 for non-existent skill IDs
    // -------------------------------------------------------------------
    test("returns 400 when skill IDs do not exist", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "PUT-004",
      });
      const fakeSkillId = "a0000000-0000-4000-a000-000000000001";

      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/skills`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { skillIds: [fakeSkillId] },
        },
      );

      const response = await PUT_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("One or more skills not found or inactive");
    });

    // -------------------------------------------------------------------
    // 11. Returns 400 for inactive skills
    // -------------------------------------------------------------------
    test("returns 400 when skill is inactive", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "PUT-005",
      });
      const inactiveSkill = await createVehicleSkill({
        companyId: company.id,
        name: "Deactivated Skill",
        code: "DEACT",
        active: false,
      });

      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/skills`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { skillIds: [inactiveSkill.id] },
        },
      );

      const response = await PUT_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("One or more skills not found or inactive");
    });

    // -------------------------------------------------------------------
    // 12. Returns 400 for invalid input (missing skillIds)
    // -------------------------------------------------------------------
    test("returns 400 for invalid input format", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "PUT-006",
      });

      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/skills`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { skillIds: "not-an-array" },
        },
      );

      const response = await PUT_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("Invalid input");
    });

    // -------------------------------------------------------------------
    // 13. Skill from another company is rejected
    // -------------------------------------------------------------------
    test("rejects skills belonging to another company", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "PUT-007",
      });

      // Create a skill in company B
      const companyB = await createCompany();
      const otherSkill = await createVehicleSkill({
        companyId: companyB.id,
        name: "Other Company Skill",
        code: "OTHER",
      });

      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/skills`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { skillIds: [otherSkill.id] },
        },
      );

      const response = await PUT_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("One or more skills not found or inactive");
    });
  });

  // =========================================================================
  // Tenant isolation for skills
  // =========================================================================

  describe("Tenant isolation — skills", () => {
    // -------------------------------------------------------------------
    // 14. Company B cannot see company A's vehicle skills
    // -------------------------------------------------------------------
    test("company B cannot see company A vehicle skills", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "ISO-SK-001",
      });
      const skill = await createVehicleSkill({
        companyId: company.id,
        name: "Isolated Skill",
        code: "ISO",
      });
      await createVehicleSkillAssignment({
        companyId: company.id,
        vehicleId: vehicle.id,
        skillId: skill.id,
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

      // Company B tries to GET company A's vehicle skills
      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/skills`,
        {
          method: "GET",
          token: tokenB,
          companyId: companyB.id,
          userId: adminB.id,
        },
      );

      const response = await GET_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      // Vehicle not found because it belongs to company A
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe("Vehicle not found");
    });

    // -------------------------------------------------------------------
    // 15. Company B cannot modify company A's vehicle skills
    // -------------------------------------------------------------------
    test("company B cannot modify company A vehicle skills", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "ISO-SK-002",
      });

      // Create company B with its own skill
      const companyB = await createCompany();
      const adminB = await createAdmin(companyB.id);
      const tokenB = await createTestToken({
        userId: adminB.id,
        companyId: companyB.id,
        email: adminB.email,
        role: adminB.role,
      });
      const skillB = await createVehicleSkill({
        companyId: companyB.id,
        name: "CompanyB Skill",
        code: "B_SKILL",
      });

      // Company B tries to PUT skills on company A's vehicle
      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/skills`,
        {
          method: "PUT",
          token: tokenB,
          companyId: companyB.id,
          userId: adminB.id,
          body: { skillIds: [skillB.id] },
        },
      );

      const response = await PUT_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe("Vehicle not found");
    });
  });

  // =========================================================================
  // Auth — skills endpoints
  // =========================================================================

  describe("Auth — skills endpoints", () => {
    // -------------------------------------------------------------------
    // 16. GET skills returns 401 without auth
    // -------------------------------------------------------------------
    test("GET /api/vehicles/[id]/skills returns 401 without auth", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "AUTH-SK-001",
      });

      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/skills`,
        {
          method: "GET",
          // No token, companyId, or userId
        },
      );

      const response = await GET_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(401);
    });

    // -------------------------------------------------------------------
    // 17. PUT skills returns 401 without auth
    // -------------------------------------------------------------------
    test("PUT /api/vehicles/[id]/skills returns 401 without auth", async () => {
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "AUTH-SK-002",
      });

      const request = await createTestRequest(
        `/api/vehicles/${vehicle.id}/skills`,
        {
          method: "PUT",
          body: { skillIds: [] },
          // No token, companyId, or userId
        },
      );

      const response = await PUT_SKILLS(request, {
        params: Promise.resolve({ id: vehicle.id }),
      });
      expect(response.status).toBe(401);
    });
  });
});
