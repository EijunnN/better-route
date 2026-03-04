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
  createPlanner,
  createWorkflowState,
  createWorkflowTransition,
} from "../setup/test-data";
import {
  companyWorkflowStates,
  companyWorkflowTransitions,
} from "@/db/schema";

// ---- Workflow states route handlers ----
import {
  GET as LIST_STATES,
  POST as CREATE_STATE,
} from "@/app/api/companies/[id]/workflow-states/route";
import {
  GET as GET_STATE,
  PATCH as PATCH_STATE,
  DELETE as DELETE_STATE,
} from "@/app/api/companies/[id]/workflow-states/[stateId]/route";

// ---- Workflow transitions route handlers ----
import {
  GET as LIST_TRANSITIONS,
  POST as CREATE_TRANSITION,
  DELETE as DELETE_TRANSITION_BY_PAIR,
} from "@/app/api/companies/[id]/workflow-transitions/route";
import { DELETE as DELETE_TRANSITION_BY_ID } from "@/app/api/companies/[id]/workflow-transitions/[transitionId]/route";

describe("Company Workflow States & Transitions", () => {
  let company: Awaited<ReturnType<typeof createCompany>>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let token: string;

  beforeAll(async () => {
    await cleanDatabase();
    company = await createCompany({
      legalName: "Workflow Test Co",
      commercialName: "WTC",
    });
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

  // Clean workflow data before each test so tests are isolated
  beforeEach(async () => {
    await testDb
      .delete(companyWorkflowTransitions)
      .where(eq(companyWorkflowTransitions.companyId, company.id));
    await testDb
      .delete(companyWorkflowStates)
      .where(eq(companyWorkflowStates.companyId, company.id));
  });

  // =========================================================================
  // WORKFLOW STATES
  // =========================================================================
  describe("Workflow States", () => {
    // -----------------------------------------------------------------------
    // LIST (GET /api/companies/:id/workflow-states)
    // -----------------------------------------------------------------------
    describe("GET /api/companies/:id/workflow-states", () => {
      test("returns empty array when no states exist", async () => {
        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states`,
          { method: "GET", token, companyId: company.id, userId: admin.id },
        );

        const response = await LIST_STATES(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(200);

        const { data } = await response.json();
        expect(data).toHaveLength(0);
      });

      test("returns active states ordered by position", async () => {
        await createWorkflowState({
          companyId: company.id,
          code: "POS_3",
          label: "Third",
          systemState: "COMPLETED",
          position: 3,
        });
        await createWorkflowState({
          companyId: company.id,
          code: "POS_1",
          label: "First",
          systemState: "PENDING",
          position: 1,
        });
        await createWorkflowState({
          companyId: company.id,
          code: "POS_2",
          label: "Second",
          systemState: "IN_PROGRESS",
          position: 2,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states`,
          { method: "GET", token, companyId: company.id, userId: admin.id },
        );

        const response = await LIST_STATES(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(200);

        const { data } = await response.json();
        expect(data).toHaveLength(3);
        expect(data[0].code).toBe("POS_1");
        expect(data[1].code).toBe("POS_2");
        expect(data[2].code).toBe("POS_3");
      });

      test("excludes inactive states from listing", async () => {
        await createWorkflowState({
          companyId: company.id,
          code: "ACTIVE_STATE",
          label: "Active",
          systemState: "PENDING",
          active: true,
        });
        await createWorkflowState({
          companyId: company.id,
          code: "INACTIVE_STATE",
          label: "Inactive",
          systemState: "CANCELLED",
          active: false,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states`,
          { method: "GET", token, companyId: company.id, userId: admin.id },
        );

        const response = await LIST_STATES(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(200);

        const { data } = await response.json();
        expect(data).toHaveLength(1);
        expect(data[0].code).toBe("ACTIVE_STATE");
      });

      test("includes transitionsFrom relation with toState details", async () => {
        const stateA = await createWorkflowState({
          companyId: company.id,
          code: "FROM_STATE",
          label: "From",
          systemState: "PENDING",
        });
        const stateB = await createWorkflowState({
          companyId: company.id,
          code: "TO_STATE",
          label: "To",
          systemState: "IN_PROGRESS",
        });
        await createWorkflowTransition({
          companyId: company.id,
          fromStateId: stateA.id,
          toStateId: stateB.id,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states`,
          { method: "GET", token, companyId: company.id, userId: admin.id },
        );

        const response = await LIST_STATES(request, {
          params: Promise.resolve({ id: company.id }),
        });
        const { data } = await response.json();

        const fromState = data.find(
          (s: { code: string }) => s.code === "FROM_STATE",
        );
        expect(fromState.transitionsFrom).toBeDefined();
        expect(fromState.transitionsFrom).toHaveLength(1);
        expect(fromState.transitionsFrom[0].toState.code).toBe("TO_STATE");
      });

      test("returns 401 for unauthenticated request", async () => {
        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states`,
          { method: "GET" },
        );

        const response = await LIST_STATES(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(401);
      });
    });

    // -----------------------------------------------------------------------
    // CREATE (POST /api/companies/:id/workflow-states)
    // -----------------------------------------------------------------------
    describe("POST /api/companies/:id/workflow-states", () => {
      test("creates workflow state with all fields (201)", async () => {
        const body = {
          code: "DELIVERED",
          label: "Entregado",
          systemState: "COMPLETED",
          color: "#22C55E",
          icon: "check-circle",
          position: 5,
          requiresReason: false,
          requiresPhoto: true,
          requiresSignature: true,
          requiresNotes: true,
          reasonOptions: ["Late", "Damaged"],
          isTerminal: true,
          isDefault: false,
        };

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states`,
          { method: "POST", token, companyId: company.id, userId: admin.id, body },
        );

        const response = await CREATE_STATE(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(201);

        const { data } = await response.json();
        expect(data.code).toBe("DELIVERED");
        expect(data.label).toBe("Entregado");
        expect(data.systemState).toBe("COMPLETED");
        expect(data.color).toBe("#22C55E");
        expect(data.icon).toBe("check-circle");
        expect(data.position).toBe(5);
        expect(data.requiresPhoto).toBe(true);
        expect(data.requiresSignature).toBe(true);
        expect(data.requiresNotes).toBe(true);
        expect(data.isTerminal).toBe(true);
        expect(data.isDefault).toBe(false);
        expect(data.companyId).toBe(company.id);
        expect(data.active).toBe(true);
      });

      test("creates state with only required fields, defaults applied", async () => {
        const body = {
          code: "MINIMAL",
          label: "Minimal State",
          systemState: "PENDING",
        };

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states`,
          { method: "POST", token, companyId: company.id, userId: admin.id, body },
        );

        const response = await CREATE_STATE(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(201);

        const { data } = await response.json();
        expect(data.code).toBe("MINIMAL");
        expect(data.color).toBe("#6B7280"); // default
        expect(data.icon).toBeNull(); // default
        expect(data.position).toBe(0); // default
        expect(data.requiresReason).toBe(false);
        expect(data.requiresPhoto).toBe(false);
        expect(data.requiresSignature).toBe(false);
        expect(data.requiresNotes).toBe(false);
        expect(data.isTerminal).toBe(false);
        expect(data.isDefault).toBe(false);
      });

      test("returns 400 when code is missing", async () => {
        const body = { label: "No Code", systemState: "PENDING" };

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states`,
          { method: "POST", token, companyId: company.id, userId: admin.id, body },
        );

        const response = await CREATE_STATE(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toContain("required");
      });

      test("returns 400 when label is missing", async () => {
        const body = { code: "NO_LABEL", systemState: "PENDING" };

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states`,
          { method: "POST", token, companyId: company.id, userId: admin.id, body },
        );

        const response = await CREATE_STATE(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toContain("required");
      });

      test("returns 400 when systemState is missing", async () => {
        const body = { code: "NO_SYS", label: "No System State" };

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states`,
          { method: "POST", token, companyId: company.id, userId: admin.id, body },
        );

        const response = await CREATE_STATE(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toContain("required");
      });

      test("returns 400 for invalid systemState", async () => {
        const body = {
          code: "INVALID_SYS",
          label: "Invalid System",
          systemState: "DOES_NOT_EXIST",
        };

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states`,
          { method: "POST", token, companyId: company.id, userId: admin.id, body },
        );

        const response = await CREATE_STATE(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toContain("Invalid systemState");
        expect(json.validValues).toBeDefined();
        expect(json.validValues).toContain("PENDING");
        expect(json.validValues).toContain("COMPLETED");
        expect(json.validValues).toContain("IN_PROGRESS");
        expect(json.validValues).toContain("FAILED");
        expect(json.validValues).toContain("CANCELLED");
      });

      test("returns 401 for unauthenticated request", async () => {
        const body = {
          code: "UNAUTH",
          label: "Unauth",
          systemState: "PENDING",
        };

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states`,
          { method: "POST", body },
        );

        const response = await CREATE_STATE(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(401);
      });

      test("persists record in database", async () => {
        const body = {
          code: "DB_CHECK",
          label: "DB Check",
          systemState: "FAILED",
        };

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states`,
          { method: "POST", token, companyId: company.id, userId: admin.id, body },
        );

        const response = await CREATE_STATE(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(201);

        const { data } = await response.json();
        const [dbRecord] = await testDb
          .select()
          .from(companyWorkflowStates)
          .where(eq(companyWorkflowStates.id, data.id));
        expect(dbRecord).toBeDefined();
        expect(dbRecord.code).toBe("DB_CHECK");
        expect(dbRecord.systemState).toBe("FAILED");
        expect(dbRecord.companyId).toBe(company.id);
      });
    });

    // -----------------------------------------------------------------------
    // GET SINGLE (GET /api/companies/:id/workflow-states/:stateId)
    // -----------------------------------------------------------------------
    describe("GET /api/companies/:id/workflow-states/:stateId", () => {
      test("returns a single workflow state with transitions", async () => {
        const state = await createWorkflowState({
          companyId: company.id,
          code: "GET_SINGLE",
          label: "Get Single",
          systemState: "IN_PROGRESS",
          color: "#3B82F6",
          icon: "truck",
        });
        const targetState = await createWorkflowState({
          companyId: company.id,
          code: "NEXT",
          label: "Next",
          systemState: "COMPLETED",
        });
        await createWorkflowTransition({
          companyId: company.id,
          fromStateId: state.id,
          toStateId: targetState.id,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${state.id}`,
          { method: "GET", token, companyId: company.id, userId: admin.id },
        );

        const response = await GET_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: state.id }),
        });
        expect(response.status).toBe(200);

        const { data } = await response.json();
        expect(data.id).toBe(state.id);
        expect(data.code).toBe("GET_SINGLE");
        expect(data.label).toBe("Get Single");
        expect(data.color).toBe("#3B82F6");
        expect(data.icon).toBe("truck");
        expect(data.transitionsFrom).toHaveLength(1);
        expect(data.transitionsFrom[0].toState.code).toBe("NEXT");
        expect(data.transitionsFrom[0].toState.id).toBe(targetState.id);
      });

      test("returns 404 for non-existent state ID", async () => {
        const fakeId = "00000000-0000-0000-0000-000000000000";

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${fakeId}`,
          { method: "GET", token, companyId: company.id, userId: admin.id },
        );

        const response = await GET_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: fakeId }),
        });
        expect(response.status).toBe(404);
      });

      test("returns 404 for inactive state", async () => {
        const state = await createWorkflowState({
          companyId: company.id,
          code: "INACTIVE_GET",
          label: "Inactive",
          systemState: "CANCELLED",
          active: false,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${state.id}`,
          { method: "GET", token, companyId: company.id, userId: admin.id },
        );

        const response = await GET_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: state.id }),
        });
        expect(response.status).toBe(404);
      });

      test("returns 404 when state belongs to different company", async () => {
        const otherCompany = await createCompany({
          legalName: "Other Co",
          commercialName: "OC",
        });
        const otherState = await createWorkflowState({
          companyId: otherCompany.id,
          code: "OTHER_COMPANY",
          label: "Other Company State",
          systemState: "PENDING",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${otherState.id}`,
          { method: "GET", token, companyId: company.id, userId: admin.id },
        );

        const response = await GET_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: otherState.id }),
        });
        expect(response.status).toBe(404);
      });

      test("returns 401 for unauthenticated request", async () => {
        const state = await createWorkflowState({
          companyId: company.id,
          code: "UNAUTH_GET",
          label: "Unauth",
          systemState: "PENDING",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${state.id}`,
          { method: "GET" },
        );

        const response = await GET_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: state.id }),
        });
        expect(response.status).toBe(401);
      });
    });

    // -----------------------------------------------------------------------
    // UPDATE (PATCH /api/companies/:id/workflow-states/:stateId)
    // -----------------------------------------------------------------------
    describe("PATCH /api/companies/:id/workflow-states/:stateId", () => {
      test("updates label and color", async () => {
        const state = await createWorkflowState({
          companyId: company.id,
          code: "UPDATE_ME",
          label: "Before",
          systemState: "PENDING",
          color: "#000000",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${state.id}`,
          {
            method: "PATCH",
            token,
            companyId: company.id,
            userId: admin.id,
            body: { label: "After", color: "#FF0000" },
          },
        );

        const response = await PATCH_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: state.id }),
        });
        expect(response.status).toBe(200);

        const { data } = await response.json();
        expect(data.label).toBe("After");
        expect(data.color).toBe("#FF0000");
        expect(data.code).toBe("UPDATE_ME"); // unchanged
      });

      test("updates systemState to a valid value", async () => {
        const state = await createWorkflowState({
          companyId: company.id,
          code: "SYS_UPDATE",
          label: "Sys Update",
          systemState: "PENDING",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${state.id}`,
          {
            method: "PATCH",
            token,
            companyId: company.id,
            userId: admin.id,
            body: { systemState: "IN_PROGRESS" },
          },
        );

        const response = await PATCH_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: state.id }),
        });
        expect(response.status).toBe(200);

        const { data } = await response.json();
        expect(data.systemState).toBe("IN_PROGRESS");
      });

      test("returns 400 for invalid systemState", async () => {
        const state = await createWorkflowState({
          companyId: company.id,
          code: "BAD_SYS",
          label: "Bad Sys",
          systemState: "PENDING",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${state.id}`,
          {
            method: "PATCH",
            token,
            companyId: company.id,
            userId: admin.id,
            body: { systemState: "NONEXISTENT" },
          },
        );

        const response = await PATCH_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: state.id }),
        });
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toContain("Invalid systemState");
        expect(json.validValues).toBeDefined();
      });

      test("updates boolean fields (requiresPhoto, isTerminal, etc.)", async () => {
        const state = await createWorkflowState({
          companyId: company.id,
          code: "BOOL_UPDATE",
          label: "Bool Update",
          systemState: "PENDING",
          requiresPhoto: false,
          requiresSignature: false,
          requiresNotes: false,
          requiresReason: false,
          isTerminal: false,
          isDefault: false,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${state.id}`,
          {
            method: "PATCH",
            token,
            companyId: company.id,
            userId: admin.id,
            body: {
              requiresPhoto: true,
              requiresSignature: true,
              requiresNotes: true,
              requiresReason: true,
              isTerminal: true,
              isDefault: true,
            },
          },
        );

        const response = await PATCH_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: state.id }),
        });
        expect(response.status).toBe(200);

        const { data } = await response.json();
        expect(data.requiresPhoto).toBe(true);
        expect(data.requiresSignature).toBe(true);
        expect(data.requiresNotes).toBe(true);
        expect(data.requiresReason).toBe(true);
        expect(data.isTerminal).toBe(true);
        expect(data.isDefault).toBe(true);
      });

      test("updates position and icon", async () => {
        const state = await createWorkflowState({
          companyId: company.id,
          code: "POS_ICON",
          label: "Position Icon",
          systemState: "PENDING",
          position: 0,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${state.id}`,
          {
            method: "PATCH",
            token,
            companyId: company.id,
            userId: admin.id,
            body: { position: 10, icon: "star" },
          },
        );

        const response = await PATCH_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: state.id }),
        });
        expect(response.status).toBe(200);

        const { data } = await response.json();
        expect(data.position).toBe(10);
        expect(data.icon).toBe("star");
      });

      test("sets updatedAt timestamp on update", async () => {
        const state = await createWorkflowState({
          companyId: company.id,
          code: "TIMESTAMP_CHECK",
          label: "Timestamp",
          systemState: "PENDING",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${state.id}`,
          {
            method: "PATCH",
            token,
            companyId: company.id,
            userId: admin.id,
            body: { label: "Updated Label" },
          },
        );

        const response = await PATCH_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: state.id }),
        });
        expect(response.status).toBe(200);

        const { data } = await response.json();
        expect(data.updatedAt).toBeDefined();
      });

      test("returns 404 for non-existent state ID", async () => {
        const fakeId = "00000000-0000-0000-0000-000000000000";

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${fakeId}`,
          {
            method: "PATCH",
            token,
            companyId: company.id,
            userId: admin.id,
            body: { label: "Nope" },
          },
        );

        const response = await PATCH_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: fakeId }),
        });
        expect(response.status).toBe(404);
      });

      test("returns 404 when state belongs to a different company", async () => {
        const otherCompany = await createCompany({
          legalName: "Other Patch Co",
        });
        const otherState = await createWorkflowState({
          companyId: otherCompany.id,
          code: "OTHER_PATCH",
          label: "Other Patch",
          systemState: "PENDING",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${otherState.id}`,
          {
            method: "PATCH",
            token,
            companyId: company.id,
            userId: admin.id,
            body: { label: "Should Fail" },
          },
        );

        const response = await PATCH_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: otherState.id }),
        });
        expect(response.status).toBe(404);
      });

      test("returns 401 for unauthenticated request", async () => {
        const state = await createWorkflowState({
          companyId: company.id,
          code: "UNAUTH_PATCH",
          label: "Unauth Patch",
          systemState: "PENDING",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${state.id}`,
          { method: "PATCH", body: { label: "Nope" } },
        );

        const response = await PATCH_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: state.id }),
        });
        expect(response.status).toBe(401);
      });
    });

    // -----------------------------------------------------------------------
    // DELETE (DELETE /api/companies/:id/workflow-states/:stateId)
    // -----------------------------------------------------------------------
    describe("DELETE /api/companies/:id/workflow-states/:stateId", () => {
      test("soft-deletes a workflow state", async () => {
        const state = await createWorkflowState({
          companyId: company.id,
          code: "TO_DELETE",
          label: "Delete Me",
          systemState: "PENDING",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${state.id}`,
          {
            method: "DELETE",
            token,
            companyId: company.id,
            userId: admin.id,
          },
        );

        const response = await DELETE_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: state.id }),
        });
        expect(response.status).toBe(200);

        const json = await response.json();
        expect(json.success).toBe(true);

        // Verify soft-deleted in DB
        const [dbRecord] = await testDb
          .select()
          .from(companyWorkflowStates)
          .where(eq(companyWorkflowStates.id, state.id));
        expect(dbRecord.active).toBe(false);
      });

      test("soft-deleted state no longer appears in list", async () => {
        const state = await createWorkflowState({
          companyId: company.id,
          code: "WILL_VANISH",
          label: "Will Vanish",
          systemState: "PENDING",
        });

        // Delete it
        const deleteReq = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${state.id}`,
          {
            method: "DELETE",
            token,
            companyId: company.id,
            userId: admin.id,
          },
        );
        await DELETE_STATE(deleteReq, {
          params: Promise.resolve({ id: company.id, stateId: state.id }),
        });

        // List should be empty
        const listReq = await createTestRequest(
          `/api/companies/${company.id}/workflow-states`,
          { method: "GET", token, companyId: company.id, userId: admin.id },
        );
        const listRes = await LIST_STATES(listReq, {
          params: Promise.resolve({ id: company.id }),
        });
        const { data } = await listRes.json();
        expect(data).toHaveLength(0);
      });

      test("returns 404 for non-existent state ID", async () => {
        const fakeId = "00000000-0000-0000-0000-000000000000";

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${fakeId}`,
          {
            method: "DELETE",
            token,
            companyId: company.id,
            userId: admin.id,
          },
        );

        const response = await DELETE_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: fakeId }),
        });
        expect(response.status).toBe(404);
      });

      test("returns 404 when state belongs to a different company", async () => {
        const otherCompany = await createCompany({
          legalName: "Other Delete Co",
        });
        const otherState = await createWorkflowState({
          companyId: otherCompany.id,
          code: "OTHER_DELETE",
          label: "Other Delete",
          systemState: "PENDING",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${otherState.id}`,
          {
            method: "DELETE",
            token,
            companyId: company.id,
            userId: admin.id,
          },
        );

        const response = await DELETE_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: otherState.id }),
        });
        expect(response.status).toBe(404);
      });

      test("returns 401 for unauthenticated request", async () => {
        const state = await createWorkflowState({
          companyId: company.id,
          code: "UNAUTH_DEL",
          label: "Unauth Delete",
          systemState: "PENDING",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-states/${state.id}`,
          { method: "DELETE" },
        );

        const response = await DELETE_STATE(request, {
          params: Promise.resolve({ id: company.id, stateId: state.id }),
        });
        expect(response.status).toBe(401);
      });
    });
  });

  // =========================================================================
  // WORKFLOW TRANSITIONS
  // =========================================================================
  describe("Workflow Transitions", () => {
    // -----------------------------------------------------------------------
    // LIST (GET /api/companies/:id/workflow-transitions)
    // -----------------------------------------------------------------------
    describe("GET /api/companies/:id/workflow-transitions", () => {
      test("returns empty array when no transitions exist", async () => {
        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          { method: "GET", token, companyId: company.id, userId: admin.id },
        );

        const response = await LIST_TRANSITIONS(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(200);

        const { data } = await response.json();
        expect(data).toHaveLength(0);
      });

      test("returns transitions with fromState and toState details", async () => {
        const stateA = await createWorkflowState({
          companyId: company.id,
          code: "T_FROM",
          label: "From",
          systemState: "PENDING",
        });
        const stateB = await createWorkflowState({
          companyId: company.id,
          code: "T_TO",
          label: "To",
          systemState: "IN_PROGRESS",
        });
        await createWorkflowTransition({
          companyId: company.id,
          fromStateId: stateA.id,
          toStateId: stateB.id,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          { method: "GET", token, companyId: company.id, userId: admin.id },
        );

        const response = await LIST_TRANSITIONS(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(200);

        const { data } = await response.json();
        expect(data).toHaveLength(1);
        expect(data[0].fromState).toBeDefined();
        expect(data[0].fromState.code).toBe("T_FROM");
        expect(data[0].fromState.id).toBe(stateA.id);
        expect(data[0].toState).toBeDefined();
        expect(data[0].toState.code).toBe("T_TO");
        expect(data[0].toState.id).toBe(stateB.id);
      });

      test("excludes inactive transitions from listing", async () => {
        const stateA = await createWorkflowState({
          companyId: company.id,
          code: "EXCL_FROM",
          label: "Excl From",
          systemState: "PENDING",
        });
        const stateB = await createWorkflowState({
          companyId: company.id,
          code: "EXCL_TO",
          label: "Excl To",
          systemState: "IN_PROGRESS",
        });
        await createWorkflowTransition({
          companyId: company.id,
          fromStateId: stateA.id,
          toStateId: stateB.id,
          active: false,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          { method: "GET", token, companyId: company.id, userId: admin.id },
        );

        const response = await LIST_TRANSITIONS(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(200);

        const { data } = await response.json();
        expect(data).toHaveLength(0);
      });

      test("returns multiple transitions", async () => {
        const stateA = await createWorkflowState({
          companyId: company.id,
          code: "MULTI_A",
          label: "A",
          systemState: "PENDING",
        });
        const stateB = await createWorkflowState({
          companyId: company.id,
          code: "MULTI_B",
          label: "B",
          systemState: "IN_PROGRESS",
        });
        const stateC = await createWorkflowState({
          companyId: company.id,
          code: "MULTI_C",
          label: "C",
          systemState: "COMPLETED",
        });

        await createWorkflowTransition({
          companyId: company.id,
          fromStateId: stateA.id,
          toStateId: stateB.id,
        });
        await createWorkflowTransition({
          companyId: company.id,
          fromStateId: stateB.id,
          toStateId: stateC.id,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          { method: "GET", token, companyId: company.id, userId: admin.id },
        );

        const response = await LIST_TRANSITIONS(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(200);

        const { data } = await response.json();
        expect(data).toHaveLength(2);
      });

      test("returns 401 for unauthenticated request", async () => {
        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          { method: "GET" },
        );

        const response = await LIST_TRANSITIONS(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(401);
      });
    });

    // -----------------------------------------------------------------------
    // CREATE (POST /api/companies/:id/workflow-transitions)
    // -----------------------------------------------------------------------
    describe("POST /api/companies/:id/workflow-transitions", () => {
      test("creates transition between two states (201)", async () => {
        const stateA = await createWorkflowState({
          companyId: company.id,
          code: "CR_FROM",
          label: "Create From",
          systemState: "PENDING",
        });
        const stateB = await createWorkflowState({
          companyId: company.id,
          code: "CR_TO",
          label: "Create To",
          systemState: "IN_PROGRESS",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "POST",
            token,
            companyId: company.id,
            userId: admin.id,
            body: { fromStateId: stateA.id, toStateId: stateB.id },
          },
        );

        const response = await CREATE_TRANSITION(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(201);

        const { data } = await response.json();
        expect(data.fromStateId).toBe(stateA.id);
        expect(data.toStateId).toBe(stateB.id);
        expect(data.companyId).toBe(company.id);
        expect(data.active).toBe(true);
      });

      test("persists transition in database", async () => {
        const stateA = await createWorkflowState({
          companyId: company.id,
          code: "DB_FROM",
          label: "DB From",
          systemState: "PENDING",
        });
        const stateB = await createWorkflowState({
          companyId: company.id,
          code: "DB_TO",
          label: "DB To",
          systemState: "COMPLETED",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "POST",
            token,
            companyId: company.id,
            userId: admin.id,
            body: { fromStateId: stateA.id, toStateId: stateB.id },
          },
        );

        const response = await CREATE_TRANSITION(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(201);

        const { data } = await response.json();
        const [dbRecord] = await testDb
          .select()
          .from(companyWorkflowTransitions)
          .where(eq(companyWorkflowTransitions.id, data.id));
        expect(dbRecord).toBeDefined();
        expect(dbRecord.fromStateId).toBe(stateA.id);
        expect(dbRecord.toStateId).toBe(stateB.id);
        expect(dbRecord.active).toBe(true);
      });

      test("returns 400 when fromStateId is missing", async () => {
        const stateB = await createWorkflowState({
          companyId: company.id,
          code: "NO_FROM",
          label: "No From",
          systemState: "IN_PROGRESS",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "POST",
            token,
            companyId: company.id,
            userId: admin.id,
            body: { toStateId: stateB.id },
          },
        );

        const response = await CREATE_TRANSITION(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toContain("required");
      });

      test("returns 400 when toStateId is missing", async () => {
        const stateA = await createWorkflowState({
          companyId: company.id,
          code: "NO_TO",
          label: "No To",
          systemState: "PENDING",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "POST",
            token,
            companyId: company.id,
            userId: admin.id,
            body: { fromStateId: stateA.id },
          },
        );

        const response = await CREATE_TRANSITION(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toContain("required");
      });

      test("returns 400 when both fromStateId and toStateId are missing", async () => {
        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "POST",
            token,
            companyId: company.id,
            userId: admin.id,
            body: {},
          },
        );

        const response = await CREATE_TRANSITION(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toContain("required");
      });

      test("returns 400 when fromStateId does not exist", async () => {
        const fakeId = "00000000-0000-0000-0000-000000000000";
        const stateB = await createWorkflowState({
          companyId: company.id,
          code: "VALID_TO",
          label: "Valid To",
          systemState: "IN_PROGRESS",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "POST",
            token,
            companyId: company.id,
            userId: admin.id,
            body: { fromStateId: fakeId, toStateId: stateB.id },
          },
        );

        const response = await CREATE_TRANSITION(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toContain("fromState not found");
      });

      test("returns 400 when toStateId does not exist", async () => {
        const fakeId = "00000000-0000-0000-0000-000000000000";
        const stateA = await createWorkflowState({
          companyId: company.id,
          code: "VALID_FROM",
          label: "Valid From",
          systemState: "PENDING",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "POST",
            token,
            companyId: company.id,
            userId: admin.id,
            body: { fromStateId: stateA.id, toStateId: fakeId },
          },
        );

        const response = await CREATE_TRANSITION(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toContain("toState not found");
      });

      test("returns 400 when fromState belongs to a different company", async () => {
        const otherCompany = await createCompany({
          legalName: "Cross Co From",
        });
        const otherState = await createWorkflowState({
          companyId: otherCompany.id,
          code: "CROSS_FROM",
          label: "Cross From",
          systemState: "PENDING",
        });
        const localState = await createWorkflowState({
          companyId: company.id,
          code: "LOCAL_TO",
          label: "Local To",
          systemState: "IN_PROGRESS",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "POST",
            token,
            companyId: company.id,
            userId: admin.id,
            body: { fromStateId: otherState.id, toStateId: localState.id },
          },
        );

        const response = await CREATE_TRANSITION(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toContain("fromState not found");
      });

      test("returns 400 when toState belongs to a different company", async () => {
        const otherCompany = await createCompany({
          legalName: "Cross Co To",
        });
        const localState = await createWorkflowState({
          companyId: company.id,
          code: "LOCAL_FROM",
          label: "Local From",
          systemState: "PENDING",
        });
        const otherState = await createWorkflowState({
          companyId: otherCompany.id,
          code: "CROSS_TO",
          label: "Cross To",
          systemState: "IN_PROGRESS",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "POST",
            token,
            companyId: company.id,
            userId: admin.id,
            body: { fromStateId: localState.id, toStateId: otherState.id },
          },
        );

        const response = await CREATE_TRANSITION(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toContain("toState not found");
      });

      test("returns 401 for unauthenticated request", async () => {
        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "POST",
            body: {
              fromStateId: "00000000-0000-0000-0000-000000000001",
              toStateId: "00000000-0000-0000-0000-000000000002",
            },
          },
        );

        const response = await CREATE_TRANSITION(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(401);
      });
    });

    // -----------------------------------------------------------------------
    // DELETE by pair (DELETE /api/companies/:id/workflow-transitions?fromStateId=&toStateId=)
    // -----------------------------------------------------------------------
    describe("DELETE /api/companies/:id/workflow-transitions (by pair)", () => {
      test("soft-deletes transition by fromStateId + toStateId query params", async () => {
        const stateA = await createWorkflowState({
          companyId: company.id,
          code: "DEL_PAIR_A",
          label: "Del Pair A",
          systemState: "PENDING",
        });
        const stateB = await createWorkflowState({
          companyId: company.id,
          code: "DEL_PAIR_B",
          label: "Del Pair B",
          systemState: "IN_PROGRESS",
        });
        const transition = await createWorkflowTransition({
          companyId: company.id,
          fromStateId: stateA.id,
          toStateId: stateB.id,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "DELETE",
            token,
            companyId: company.id,
            userId: admin.id,
            searchParams: {
              fromStateId: stateA.id,
              toStateId: stateB.id,
            },
          },
        );

        const response = await DELETE_TRANSITION_BY_PAIR(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(200);

        const json = await response.json();
        expect(json.success).toBe(true);

        // Verify soft-deleted in DB
        const [dbRecord] = await testDb
          .select()
          .from(companyWorkflowTransitions)
          .where(eq(companyWorkflowTransitions.id, transition.id));
        expect(dbRecord.active).toBe(false);
      });

      test("returns 400 when fromStateId query param is missing", async () => {
        const stateB = await createWorkflowState({
          companyId: company.id,
          code: "DEL_MISS_B",
          label: "Del Miss B",
          systemState: "IN_PROGRESS",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "DELETE",
            token,
            companyId: company.id,
            userId: admin.id,
            searchParams: { toStateId: stateB.id },
          },
        );

        const response = await DELETE_TRANSITION_BY_PAIR(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toContain("required");
      });

      test("returns 400 when toStateId query param is missing", async () => {
        const stateA = await createWorkflowState({
          companyId: company.id,
          code: "DEL_MISS_A",
          label: "Del Miss A",
          systemState: "PENDING",
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "DELETE",
            token,
            companyId: company.id,
            userId: admin.id,
            searchParams: { fromStateId: stateA.id },
          },
        );

        const response = await DELETE_TRANSITION_BY_PAIR(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json.error).toContain("required");
      });

      test("returns 404 when transition does not exist", async () => {
        const fakeFromId = "00000000-0000-0000-0000-000000000001";
        const fakeToId = "00000000-0000-0000-0000-000000000002";

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "DELETE",
            token,
            companyId: company.id,
            userId: admin.id,
            searchParams: {
              fromStateId: fakeFromId,
              toStateId: fakeToId,
            },
          },
        );

        const response = await DELETE_TRANSITION_BY_PAIR(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(404);

        const json = await response.json();
        expect(json.error).toContain("not found");
      });

      test("returns 404 when transition is already inactive", async () => {
        const stateA = await createWorkflowState({
          companyId: company.id,
          code: "ALREADY_DEAD_A",
          label: "Already Dead A",
          systemState: "PENDING",
        });
        const stateB = await createWorkflowState({
          companyId: company.id,
          code: "ALREADY_DEAD_B",
          label: "Already Dead B",
          systemState: "IN_PROGRESS",
        });
        await createWorkflowTransition({
          companyId: company.id,
          fromStateId: stateA.id,
          toStateId: stateB.id,
          active: false,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "DELETE",
            token,
            companyId: company.id,
            userId: admin.id,
            searchParams: {
              fromStateId: stateA.id,
              toStateId: stateB.id,
            },
          },
        );

        const response = await DELETE_TRANSITION_BY_PAIR(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(404);
      });

      test("returns 401 for unauthenticated request", async () => {
        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions`,
          {
            method: "DELETE",
            searchParams: {
              fromStateId: "00000000-0000-0000-0000-000000000001",
              toStateId: "00000000-0000-0000-0000-000000000002",
            },
          },
        );

        const response = await DELETE_TRANSITION_BY_PAIR(request, {
          params: Promise.resolve({ id: company.id }),
        });
        expect(response.status).toBe(401);
      });
    });

    // -----------------------------------------------------------------------
    // DELETE by ID (DELETE /api/companies/:id/workflow-transitions/:transitionId)
    // -----------------------------------------------------------------------
    describe("DELETE /api/companies/:id/workflow-transitions/:transitionId", () => {
      test("soft-deletes transition by ID", async () => {
        const stateA = await createWorkflowState({
          companyId: company.id,
          code: "DEL_ID_A",
          label: "Del ID A",
          systemState: "PENDING",
        });
        const stateB = await createWorkflowState({
          companyId: company.id,
          code: "DEL_ID_B",
          label: "Del ID B",
          systemState: "IN_PROGRESS",
        });
        const transition = await createWorkflowTransition({
          companyId: company.id,
          fromStateId: stateA.id,
          toStateId: stateB.id,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions/${transition.id}`,
          {
            method: "DELETE",
            token,
            companyId: company.id,
            userId: admin.id,
          },
        );

        const response = await DELETE_TRANSITION_BY_ID(request, {
          params: Promise.resolve({
            id: company.id,
            transitionId: transition.id,
          }),
        });
        expect(response.status).toBe(200);

        const json = await response.json();
        expect(json.success).toBe(true);

        // Verify soft-deleted in DB
        const [dbRecord] = await testDb
          .select()
          .from(companyWorkflowTransitions)
          .where(eq(companyWorkflowTransitions.id, transition.id));
        expect(dbRecord.active).toBe(false);
      });

      test("returns 404 for non-existent transition ID", async () => {
        const fakeId = "00000000-0000-0000-0000-000000000000";

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions/${fakeId}`,
          {
            method: "DELETE",
            token,
            companyId: company.id,
            userId: admin.id,
          },
        );

        const response = await DELETE_TRANSITION_BY_ID(request, {
          params: Promise.resolve({
            id: company.id,
            transitionId: fakeId,
          }),
        });
        expect(response.status).toBe(404);

        const json = await response.json();
        expect(json.error).toContain("not found");
      });

      test("returns 404 when transition belongs to a different company", async () => {
        const otherCompany = await createCompany({
          legalName: "Other Trans Co",
        });
        const otherStateA = await createWorkflowState({
          companyId: otherCompany.id,
          code: "O_TRANS_A",
          label: "Other A",
          systemState: "PENDING",
        });
        const otherStateB = await createWorkflowState({
          companyId: otherCompany.id,
          code: "O_TRANS_B",
          label: "Other B",
          systemState: "IN_PROGRESS",
        });
        const otherTransition = await createWorkflowTransition({
          companyId: otherCompany.id,
          fromStateId: otherStateA.id,
          toStateId: otherStateB.id,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions/${otherTransition.id}`,
          {
            method: "DELETE",
            token,
            companyId: company.id,
            userId: admin.id,
          },
        );

        const response = await DELETE_TRANSITION_BY_ID(request, {
          params: Promise.resolve({
            id: company.id,
            transitionId: otherTransition.id,
          }),
        });
        expect(response.status).toBe(404);
      });

      test("returns 404 when transition is already inactive", async () => {
        const stateA = await createWorkflowState({
          companyId: company.id,
          code: "DEAD_ID_A",
          label: "Dead ID A",
          systemState: "PENDING",
        });
        const stateB = await createWorkflowState({
          companyId: company.id,
          code: "DEAD_ID_B",
          label: "Dead ID B",
          systemState: "IN_PROGRESS",
        });
        const transition = await createWorkflowTransition({
          companyId: company.id,
          fromStateId: stateA.id,
          toStateId: stateB.id,
          active: false,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions/${transition.id}`,
          {
            method: "DELETE",
            token,
            companyId: company.id,
            userId: admin.id,
          },
        );

        const response = await DELETE_TRANSITION_BY_ID(request, {
          params: Promise.resolve({
            id: company.id,
            transitionId: transition.id,
          }),
        });
        expect(response.status).toBe(404);
      });

      test("returns 401 for unauthenticated request", async () => {
        const stateA = await createWorkflowState({
          companyId: company.id,
          code: "UNAUTH_ID_A",
          label: "Unauth A",
          systemState: "PENDING",
        });
        const stateB = await createWorkflowState({
          companyId: company.id,
          code: "UNAUTH_ID_B",
          label: "Unauth B",
          systemState: "IN_PROGRESS",
        });
        const transition = await createWorkflowTransition({
          companyId: company.id,
          fromStateId: stateA.id,
          toStateId: stateB.id,
        });

        const request = await createTestRequest(
          `/api/companies/${company.id}/workflow-transitions/${transition.id}`,
          { method: "DELETE" },
        );

        const response = await DELETE_TRANSITION_BY_ID(request, {
          params: Promise.resolve({
            id: company.id,
            transitionId: transition.id,
          }),
        });
        expect(response.status).toBe(401);
      });
    });
  });

  // =========================================================================
  // TENANT ISOLATION
  // =========================================================================
  describe("Tenant Isolation", () => {
    test("company B cannot see company A workflow states", async () => {
      // Create state for company A
      await createWorkflowState({
        companyId: company.id,
        code: "COMPANY_A_ONLY",
        label: "Company A Only",
        systemState: "PENDING",
      });

      // Create company B with its own admin and token
      const companyB = await createCompany({
        legalName: "Tenant B",
        commercialName: "TB",
      });
      const adminB = await createAdmin(companyB.id);
      const tokenB = await createTestToken({
        userId: adminB.id,
        companyId: companyB.id,
        email: adminB.email,
        role: adminB.role,
      });

      // List company B's states -- should be empty
      const request = await createTestRequest(
        `/api/companies/${companyB.id}/workflow-states`,
        { method: "GET", token: tokenB, companyId: companyB.id, userId: adminB.id },
      );

      const response = await LIST_STATES(request, {
        params: Promise.resolve({ id: companyB.id }),
      });
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data).toHaveLength(0);
    });

    test("company B cannot see company A workflow transitions", async () => {
      const stateA = await createWorkflowState({
        companyId: company.id,
        code: "ISO_FROM",
        label: "Iso From",
        systemState: "PENDING",
      });
      const stateB = await createWorkflowState({
        companyId: company.id,
        code: "ISO_TO",
        label: "Iso To",
        systemState: "IN_PROGRESS",
      });
      await createWorkflowTransition({
        companyId: company.id,
        fromStateId: stateA.id,
        toStateId: stateB.id,
      });

      // Create company B
      const companyB = await createCompany({
        legalName: "Tenant B Trans",
        commercialName: "TBT",
      });
      const adminB = await createAdmin(companyB.id);
      const tokenB = await createTestToken({
        userId: adminB.id,
        companyId: companyB.id,
        email: adminB.email,
        role: adminB.role,
      });

      // List company B's transitions -- should be empty
      const request = await createTestRequest(
        `/api/companies/${companyB.id}/workflow-transitions`,
        { method: "GET", token: tokenB, companyId: companyB.id, userId: adminB.id },
      );

      const response = await LIST_TRANSITIONS(request, {
        params: Promise.resolve({ id: companyB.id }),
      });
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data).toHaveLength(0);
    });

    test("non-admin user of same company can access workflow states", async () => {
      await createWorkflowState({
        companyId: company.id,
        code: "PLANNER_VISIBLE",
        label: "Planner Visible",
        systemState: "PENDING",
      });

      const planner = await createPlanner(company.id);
      const plannerToken = await createTestToken({
        userId: planner.id,
        companyId: company.id,
        email: planner.email,
        role: planner.role,
      });

      const request = await createTestRequest(
        `/api/companies/${company.id}/workflow-states`,
        { method: "GET", token: plannerToken, companyId: company.id, userId: planner.id },
      );

      const response = await LIST_STATES(request, {
        params: Promise.resolve({ id: company.id }),
      });
      expect(response.status).toBe(200);

      const { data } = await response.json();
      expect(data.length).toBeGreaterThanOrEqual(1);
      const codes = data.map((s: { code: string }) => s.code);
      expect(codes).toContain("PLANNER_VISIBLE");
    });
  });
});
