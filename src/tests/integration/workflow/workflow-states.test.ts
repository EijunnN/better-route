import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createDriver,
  createVehicle,
  createOrder,
  createOptimizationConfig,
  createOptimizationJob,
  createRouteStop,
  createWorkflowState,
  createWorkflowTransition,
} from "../setup/test-data";
import {
  companyWorkflowStates,
  companyWorkflowTransitions,
  routeStops,
  orders,
} from "@/db/schema";

// Workflow state handlers
import {
  GET as LIST_STATES,
  POST as CREATE_STATE,
} from "@/app/api/companies/[id]/workflow-states/route";
import {
  GET as GET_STATE,
  PATCH as PATCH_STATE,
  DELETE as DELETE_STATE,
} from "@/app/api/companies/[id]/workflow-states/[stateId]/route";

// Workflow transition handlers
import {
  GET as LIST_TRANSITIONS,
  POST as CREATE_TRANSITION,
  DELETE as DELETE_TRANSITION,
} from "@/app/api/companies/[id]/workflow-transitions/route";

// Route stop handler
import { PATCH as PATCH_STOP } from "@/app/api/route-stops/[id]/route";

describe("Workflow States & Transitions", () => {
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

  // -----------------------------------------------------------------------
  // 1. Create state with all optional fields
  // -----------------------------------------------------------------------
  test("POST creates workflow state with requiresReason, requiresPhoto, color, icon, systemState (201)", async () => {
    const body = {
      code: "DELIVERED",
      label: "Entregado",
      systemState: "COMPLETED",
      color: "#22C55E",
      icon: "check-circle",
      position: 1,
      requiresReason: false,
      requiresPhoto: true,
      requiresSignature: true,
      requiresNotes: false,
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
    expect(data.position).toBe(1);
    expect(data.requiresPhoto).toBe(true);
    expect(data.requiresSignature).toBe(true);
    expect(data.isTerminal).toBe(true);
    expect(data.companyId).toBe(company.id);

    // Verify in DB
    const [dbRecord] = await testDb
      .select()
      .from(companyWorkflowStates)
      .where(eq(companyWorkflowStates.id, data.id));
    expect(dbRecord).toBeDefined();
    expect(dbRecord.code).toBe("DELIVERED");
    expect(dbRecord.requiresPhoto).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 2. Invalid systemState rejected
  // -----------------------------------------------------------------------
  test("POST rejects invalid systemState (400)", async () => {
    const body = {
      code: "BAD_STATE",
      label: "Bad",
      systemState: "NONEXISTENT_STATE",
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
  });

  // -----------------------------------------------------------------------
  // 3. Missing required fields -> 400
  // -----------------------------------------------------------------------
  test("POST returns 400 when required fields are missing", async () => {
    const body = { code: "ONLY_CODE" };

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

  // -----------------------------------------------------------------------
  // 4. List active states ordered by position
  // -----------------------------------------------------------------------
  test("GET lists active states ordered by position", async () => {
    // Clean previous states for this company
    await testDb
      .delete(companyWorkflowTransitions)
      .where(eq(companyWorkflowTransitions.companyId, company.id));
    await testDb
      .delete(companyWorkflowStates)
      .where(eq(companyWorkflowStates.companyId, company.id));

    // Create states with different positions
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
    // Inactive state — should not appear
    await createWorkflowState({
      companyId: company.id,
      code: "INACTIVE",
      label: "Inactive",
      systemState: "CANCELLED",
      position: 0,
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
    expect(data.length).toBe(3);
    expect(data[0].code).toBe("POS_1");
    expect(data[1].code).toBe("POS_2");
    expect(data[2].code).toBe("POS_3");
  });

  // -----------------------------------------------------------------------
  // 5. Create transition between two states
  // -----------------------------------------------------------------------
  test("POST creates transition between two states (201)", async () => {
    // Clean and create fresh states
    await testDb
      .delete(companyWorkflowTransitions)
      .where(eq(companyWorkflowTransitions.companyId, company.id));
    await testDb
      .delete(companyWorkflowStates)
      .where(eq(companyWorkflowStates.companyId, company.id));

    const stateA = await createWorkflowState({
      companyId: company.id,
      code: "PENDING",
      label: "Pendiente",
      systemState: "PENDING",
    });
    const stateB = await createWorkflowState({
      companyId: company.id,
      code: "IN_TRANSIT",
      label: "En Transito",
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

  // -----------------------------------------------------------------------
  // 6. Invalid fromStateId / toStateId rejected
  // -----------------------------------------------------------------------
  test("POST transition rejects invalid fromStateId/toStateId (400)", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const request = await createTestRequest(
      `/api/companies/${company.id}/workflow-transitions`,
      {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { fromStateId: fakeId, toStateId: fakeId },
      },
    );

    const response = await CREATE_TRANSITION(request, {
      params: Promise.resolve({ id: company.id }),
    });
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toContain("not found");
  });

  // -----------------------------------------------------------------------
  // 7. List transitions with state details
  // -----------------------------------------------------------------------
  test("GET lists transitions with fromState and toState details", async () => {
    // Clean and set up
    await testDb
      .delete(companyWorkflowTransitions)
      .where(eq(companyWorkflowTransitions.companyId, company.id));
    await testDb
      .delete(companyWorkflowStates)
      .where(eq(companyWorkflowStates.companyId, company.id));

    const stateA = await createWorkflowState({
      companyId: company.id,
      code: "PICKUP",
      label: "Recogido",
      systemState: "PENDING",
    });
    const stateB = await createWorkflowState({
      companyId: company.id,
      code: "TRANSIT",
      label: "En Camino",
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
    expect(data.length).toBe(1);
    expect(data[0].fromState).toBeDefined();
    expect(data[0].fromState.code).toBe("PICKUP");
    expect(data[0].toState).toBeDefined();
    expect(data[0].toState.code).toBe("TRANSIT");
  });

  // -----------------------------------------------------------------------
  // 8. Delete transition (soft delete)
  // -----------------------------------------------------------------------
  test("DELETE soft-deletes transition", async () => {
    // Clean and set up
    await testDb
      .delete(companyWorkflowTransitions)
      .where(eq(companyWorkflowTransitions.companyId, company.id));
    await testDb
      .delete(companyWorkflowStates)
      .where(eq(companyWorkflowStates.companyId, company.id));

    const stateA = await createWorkflowState({
      companyId: company.id,
      code: "S_DEL_A",
      label: "Del A",
      systemState: "PENDING",
    });
    const stateB = await createWorkflowState({
      companyId: company.id,
      code: "S_DEL_B",
      label: "Del B",
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

    const response = await DELETE_TRANSITION(request, {
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

  // -----------------------------------------------------------------------
  // 9. PATCH route-stop with workflowStateId derives system status
  // -----------------------------------------------------------------------
  test("PATCH route-stop with workflowStateId derives system status from workflow state", async () => {
    // Clean workflow data
    await testDb
      .delete(companyWorkflowTransitions)
      .where(eq(companyWorkflowTransitions.companyId, company.id));
    await testDb
      .delete(companyWorkflowStates)
      .where(eq(companyWorkflowStates.companyId, company.id));

    // Create workflow states
    const pendingState = await createWorkflowState({
      companyId: company.id,
      code: "WF_PENDING",
      label: "Pendiente",
      systemState: "PENDING",
      position: 0,
    });
    const completedState = await createWorkflowState({
      companyId: company.id,
      code: "WF_COMPLETED",
      label: "Completado",
      systemState: "COMPLETED",
      position: 2,
    });

    // Create transition PENDING -> COMPLETED
    await createWorkflowTransition({
      companyId: company.id,
      fromStateId: pendingState.id,
      toStateId: completedState.id,
    });

    // Create supporting entities for route stop
    const driver = await createDriver(company.id);
    const vehicle = await createVehicle({ companyId: company.id });
    const order = await createOrder({ companyId: company.id });
    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
    });

    // Create a route stop with initial workflow state
    const stop = await createRouteStop({
      companyId: company.id,
      jobId: job.id,
      routeId: "route-wf-1",
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId: order.id,
      status: "PENDING",
      workflowStateId: pendingState.id,
    });

    // PATCH with new workflowStateId
    const request = await createTestRequest(`/api/route-stops/${stop.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { workflowStateId: completedState.id },
    });

    const response = await PATCH_STOP(request, {
      params: Promise.resolve({ id: stop.id }),
    });
    expect(response.status).toBe(200);

    const { data } = await response.json();
    expect(data.status).toBe("COMPLETED");
    expect(data.workflowStateId).toBe(completedState.id);
    expect(data.completedAt).toBeDefined();
  }, 15000);

  // -----------------------------------------------------------------------
  // 10. Invalid workflowStateId -> 400
  // -----------------------------------------------------------------------
  test("PATCH route-stop with invalid workflowStateId returns 400", async () => {
    const driver = await createDriver(company.id);
    const vehicle = await createVehicle({ companyId: company.id });
    const order = await createOrder({ companyId: company.id });
    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
    });

    const stop = await createRouteStop({
      companyId: company.id,
      jobId: job.id,
      routeId: "route-inv-1",
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId: order.id,
      status: "PENDING",
    });

    const fakeStateId = "00000000-0000-0000-0000-000000000000";
    const request = await createTestRequest(`/api/route-stops/${stop.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { workflowStateId: fakeStateId },
    });

    const response = await PATCH_STOP(request, {
      params: Promise.resolve({ id: stop.id }),
    });
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toContain("Workflow state not found");
  }, 15000);

  // -----------------------------------------------------------------------
  // 11. Disallowed transition -> 400
  // -----------------------------------------------------------------------
  test("PATCH route-stop rejects disallowed workflow transition (400)", async () => {
    // Clean workflow data
    await testDb
      .delete(companyWorkflowTransitions)
      .where(eq(companyWorkflowTransitions.companyId, company.id));
    await testDb
      .delete(companyWorkflowStates)
      .where(eq(companyWorkflowStates.companyId, company.id));

    const stateA = await createWorkflowState({
      companyId: company.id,
      code: "WF_A",
      label: "State A",
      systemState: "PENDING",
    });
    const stateB = await createWorkflowState({
      companyId: company.id,
      code: "WF_B",
      label: "State B",
      systemState: "IN_PROGRESS",
    });
    const stateC = await createWorkflowState({
      companyId: company.id,
      code: "WF_C",
      label: "State C",
      systemState: "COMPLETED",
    });

    // Only allow A -> B, NOT A -> C
    await createWorkflowTransition({
      companyId: company.id,
      fromStateId: stateA.id,
      toStateId: stateB.id,
    });

    const driver = await createDriver(company.id);
    const vehicle = await createVehicle({ companyId: company.id });
    const order = await createOrder({ companyId: company.id });
    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
    });

    const stop = await createRouteStop({
      companyId: company.id,
      jobId: job.id,
      routeId: "route-disallow-1",
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId: order.id,
      status: "PENDING",
      workflowStateId: stateA.id,
    });

    // Try transition A -> C (not allowed)
    const request = await createTestRequest(`/api/route-stops/${stop.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { workflowStateId: stateC.id },
    });

    const response = await PATCH_STOP(request, {
      params: Promise.resolve({ id: stop.id }),
    });
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toContain("Workflow transition not allowed");
  }, 15000);

  // -----------------------------------------------------------------------
  // 12. Workflow state maps to order status via systemState
  // -----------------------------------------------------------------------
  test("Workflow state systemState syncs order status", async () => {
    // Clean workflow data
    await testDb
      .delete(companyWorkflowTransitions)
      .where(eq(companyWorkflowTransitions.companyId, company.id));
    await testDb
      .delete(companyWorkflowStates)
      .where(eq(companyWorkflowStates.companyId, company.id));

    const pendingWf = await createWorkflowState({
      companyId: company.id,
      code: "ORDER_PENDING",
      label: "Pedido Pendiente",
      systemState: "PENDING",
    });
    const completedWf = await createWorkflowState({
      companyId: company.id,
      code: "ORDER_DONE",
      label: "Pedido Entregado",
      systemState: "COMPLETED",
    });
    await createWorkflowTransition({
      companyId: company.id,
      fromStateId: pendingWf.id,
      toStateId: completedWf.id,
    });

    const driver = await createDriver(company.id);
    const vehicle = await createVehicle({ companyId: company.id });
    const order = await createOrder({
      companyId: company.id,
      status: "ASSIGNED",
    });
    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
    });

    const stop = await createRouteStop({
      companyId: company.id,
      jobId: job.id,
      routeId: "route-order-sync-1",
      userId: driver.id,
      vehicleId: vehicle.id,
      orderId: order.id,
      status: "PENDING",
      workflowStateId: pendingWf.id,
    });

    // Transition to COMPLETED workflow state
    const request = await createTestRequest(`/api/route-stops/${stop.id}`, {
      method: "PATCH",
      token,
      companyId: company.id,
      userId: admin.id,
      body: { workflowStateId: completedWf.id },
    });

    const response = await PATCH_STOP(request, {
      params: Promise.resolve({ id: stop.id }),
    });
    expect(response.status).toBe(200);

    // Verify order status was synced to COMPLETED
    const [dbOrder] = await testDb
      .select()
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(dbOrder.status).toBe("COMPLETED");
  }, 15000);

  // -----------------------------------------------------------------------
  // 13. Tenant isolation
  // -----------------------------------------------------------------------
  test("Tenant isolation: company B cannot access company A workflow states", async () => {
    // Clean company A workflow data
    await testDb
      .delete(companyWorkflowTransitions)
      .where(eq(companyWorkflowTransitions.companyId, company.id));
    await testDb
      .delete(companyWorkflowStates)
      .where(eq(companyWorkflowStates.companyId, company.id));

    await createWorkflowState({
      companyId: company.id,
      code: "COMPANY_A_STATE",
      label: "Company A State",
      systemState: "PENDING",
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

    // Company B lists its own states — should be empty (company A's states are not visible)
    const listReq = await createTestRequest(
      `/api/companies/${companyB.id}/workflow-states`,
      { method: "GET", token: tokenB, companyId: companyB.id, userId: adminB.id },
    );

    const listRes = await LIST_STATES(listReq, {
      params: Promise.resolve({ id: companyB.id }),
    });
    expect(listRes.status).toBe(200);

    const listData = await listRes.json();
    expect(listData.data).toHaveLength(0);
  }, 15000);

  // -----------------------------------------------------------------------
  // 14. Get single state by ID
  // -----------------------------------------------------------------------
  test("GET returns single workflow state by ID with transitions", async () => {
    // Clean
    await testDb
      .delete(companyWorkflowTransitions)
      .where(eq(companyWorkflowTransitions.companyId, company.id));
    await testDb
      .delete(companyWorkflowStates)
      .where(eq(companyWorkflowStates.companyId, company.id));

    const state = await createWorkflowState({
      companyId: company.id,
      code: "SINGLE_GET",
      label: "Single Get State",
      systemState: "IN_PROGRESS",
      color: "#3B82F6",
      icon: "truck",
    });
    const targetState = await createWorkflowState({
      companyId: company.id,
      code: "NEXT_STATE",
      label: "Next State",
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
    expect(data.code).toBe("SINGLE_GET");
    expect(data.label).toBe("Single Get State");
    expect(data.color).toBe("#3B82F6");
    expect(data.icon).toBe("truck");
    expect(data.transitionsFrom).toBeDefined();
    expect(data.transitionsFrom.length).toBe(1);
    expect(data.transitionsFrom[0].toState.code).toBe("NEXT_STATE");
  });
});
