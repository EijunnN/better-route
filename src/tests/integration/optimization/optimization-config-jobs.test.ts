import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createDriver,
  createVehicle,
  createOptimizationConfig,
  createOptimizationJob,
  buildOptimizationResult,
} from "../setup/test-data";

// Mock for engines route — @/lib/optimization barrel
mock.module("@/lib/optimization", () => ({
  getAvailableOptimizers: async () => [
    {
      type: "VROOM",
      name: "VROOM",
      displayName: "VROOM",
      description: "Fast routing engine",
      available: true,
      capabilities: {
        supportsTimeWindows: true,
        supportsSkills: true,
        supportsMultiDimensionalCapacity: false,
        supportsPriorities: false,
        supportsBalancing: true,
        maxOrders: 5000,
        maxVehicles: 200,
        typicalSpeed: "fast",
        qualityLevel: "good",
      },
    },
    {
      type: "PYVRP",
      name: "PYVRP",
      displayName: "PyVRP",
      description: "Quality optimization",
      available: false,
      capabilities: {
        supportsTimeWindows: true,
        supportsSkills: true,
        supportsMultiDimensionalCapacity: true,
        supportsPriorities: true,
        supportsBalancing: true,
        maxOrders: -1,
        maxVehicles: -1,
        typicalSpeed: "slow",
        qualityLevel: "excellent",
      },
    },
  ],
}));

// Route handler imports
import {
  GET as listConfigs,
  POST as createConfig,
} from "@/app/api/optimization/configure/route";
import {
  GET as listJobs,
  POST as createJob,
} from "@/app/api/optimization/jobs/route";
import {
  GET as getJob,
  DELETE as cancelJobRoute,
} from "@/app/api/optimization/jobs/[id]/route";
import { GET as validateJob } from "@/app/api/optimization/jobs/[id]/validate/route";
import { GET as listEngines } from "@/app/api/optimization/engines/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeFixtures() {
  const company = await createCompany();
  const admin = await createAdmin(null);
  const token = await createTestToken({
    userId: admin.id,
    companyId: company.id,
    email: admin.email,
    role: admin.role,
  });
  return { company, admin, token };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Optimization Config & Jobs", () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ==========================================================================
  // POST /api/optimization/configure
  // ==========================================================================

  test("POST /configure creates config with vehicle/driver validation (201)", async () => {
    const { company, admin, token } = await makeFixtures();
    const vehicle = await createVehicle({ companyId: company.id, status: "AVAILABLE" });
    const driver = await createDriver(company.id, { driverStatus: "AVAILABLE" });

    const request = await createTestRequest("/api/optimization/configure", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Test Config",
        depotLatitude: "-12.0464",
        depotLongitude: "-77.0428",
        selectedVehicleIds: JSON.stringify([vehicle.id]),
        selectedDriverIds: JSON.stringify([driver.id]),
        workWindowStart: "08:00",
        workWindowEnd: "18:00",
        serviceTimeMinutes: 10,
        status: "CONFIGURED",
      },
    });

    const res = await createConfig(request);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.name).toBe("Test Config");
    expect(body.data.status).toBe("CONFIGURED");
    expect(body.vehicles).toBeDefined();
    expect(body.drivers).toBeDefined();
  });

  test("POST /configure rejects non-AVAILABLE vehicle (400)", async () => {
    const { company, admin, token } = await makeFixtures();
    const vehicle = await createVehicle({ companyId: company.id, status: "IN_MAINTENANCE" });
    const driver = await createDriver(company.id, { driverStatus: "AVAILABLE" });

    const request = await createTestRequest("/api/optimization/configure", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Bad Vehicle Config",
        depotLatitude: "-12.0464",
        depotLongitude: "-77.0428",
        selectedVehicleIds: JSON.stringify([vehicle.id]),
        selectedDriverIds: JSON.stringify([driver.id]),
        workWindowStart: "08:00",
        workWindowEnd: "18:00",
        serviceTimeMinutes: 10,
        status: "CONFIGURED",
      },
    });

    const res = await createConfig(request);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("not available");
  });

  test("POST /configure rejects non-CONDUCTOR driver (400)", async () => {
    const { company, admin, token } = await makeFixtures();
    const vehicle = await createVehicle({ companyId: company.id, status: "AVAILABLE" });
    // Create an ADMIN_SISTEMA user (not a CONDUCTOR)
    const nonDriver = await createAdmin(company.id);

    const request = await createTestRequest("/api/optimization/configure", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: {
        name: "Bad Driver Config",
        depotLatitude: "-12.0464",
        depotLongitude: "-77.0428",
        selectedVehicleIds: JSON.stringify([vehicle.id]),
        selectedDriverIds: JSON.stringify([nonDriver.id]),
        workWindowStart: "08:00",
        workWindowEnd: "18:00",
        serviceTimeMinutes: 10,
        status: "CONFIGURED",
      },
    });

    const res = await createConfig(request);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("drivers not found");
  });

  // ==========================================================================
  // GET /api/optimization/configure
  // ==========================================================================

  test("GET /configure lists configs with status filter", async () => {
    const { company, admin, token } = await makeFixtures();

    await createOptimizationConfig({ companyId: company.id, status: "DRAFT" });
    await createOptimizationConfig({ companyId: company.id, status: "DRAFT" });
    await createOptimizationConfig({ companyId: company.id, status: "CONFIGURED" });

    // List all
    const reqAll = await createTestRequest("/api/optimization/configure", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });
    const resAll = await listConfigs(reqAll);
    expect(resAll.status).toBe(200);
    const bodyAll = await resAll.json();
    expect(bodyAll.data.length).toBeGreaterThanOrEqual(3);
    expect(bodyAll.meta).toBeDefined();
    expect(bodyAll.meta.total).toBeGreaterThanOrEqual(3);

    // Filter by DRAFT
    const reqDraft = await createTestRequest("/api/optimization/configure", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      searchParams: { status: "DRAFT" },
    });
    const resDraft = await listConfigs(reqDraft);
    expect(resDraft.status).toBe(200);
    const bodyDraft = await resDraft.json();
    expect(bodyDraft.data.length).toBeGreaterThanOrEqual(2);
    for (const config of bodyDraft.data) {
      expect(config.status).toBe("DRAFT");
    }
  });

  // ==========================================================================
  // POST /api/optimization/jobs
  // ==========================================================================

  test("POST /jobs creates and starts optimization job (201)", async () => {
    const { company, admin, token } = await makeFixtures();
    const vehicle = await createVehicle({ companyId: company.id });
    const driver = await createDriver(company.id);
    const config = await createOptimizationConfig({ companyId: company.id });

    const request = await createTestRequest("/api/optimization/jobs", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: {
        configurationId: config.id,
        vehicleIds: [vehicle.id],
        driverIds: [driver.id],
      },
    });

    const res = await createJob(request);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBeDefined();
    expect(typeof body.data.id).toBe("string");
    expect(body.data.message).toBeDefined();
  });

  test("POST /jobs with non-existent configId returns 404", async () => {
    const { company, admin, token } = await makeFixtures();
    const vehicle = await createVehicle({ companyId: company.id });
    const driver = await createDriver(company.id);
    const fakeConfigId = "00000000-0000-4000-a000-000000000001";

    const request = await createTestRequest("/api/optimization/jobs", {
      method: "POST",
      token,
      companyId: company.id,
      userId: admin.id,
      body: {
        configurationId: fakeConfigId,
        vehicleIds: [vehicle.id],
        driverIds: [driver.id],
      },
    });

    const res = await createJob(request);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  // ==========================================================================
  // GET /api/optimization/jobs
  // ==========================================================================

  test("GET /jobs lists jobs with status filter and search", async () => {
    const { company, admin, token } = await makeFixtures();
    const config = await createOptimizationConfig({
      companyId: company.id,
      name: "SearchableConfig",
    });

    await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      status: "COMPLETED",
    });
    await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      status: "PENDING",
      progress: 0,
    });

    // List all
    const reqAll = await createTestRequest("/api/optimization/jobs", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });
    const resAll = await listJobs(reqAll);
    expect(resAll.status).toBe(200);
    const bodyAll = await resAll.json();
    expect(bodyAll.data.length).toBeGreaterThanOrEqual(2);
    expect(bodyAll.meta).toBeDefined();

    // Filter by COMPLETED
    const reqCompleted = await createTestRequest("/api/optimization/jobs", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      searchParams: { status: "COMPLETED" },
    });
    const resCompleted = await listJobs(reqCompleted);
    expect(resCompleted.status).toBe(200);
    const bodyCompleted = await resCompleted.json();
    for (const job of bodyCompleted.data) {
      expect(job.status).toBe("COMPLETED");
    }

    // Search by config name
    const reqSearch = await createTestRequest("/api/optimization/jobs", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
      searchParams: { search: "Searchable" },
    });
    const resSearch = await listJobs(reqSearch);
    expect(resSearch.status).toBe(200);
    const bodySearch = await resSearch.json();
    expect(bodySearch.data.length).toBeGreaterThanOrEqual(1);
  });

  // ==========================================================================
  // GET /api/optimization/jobs/[id]
  // ==========================================================================

  test("GET /jobs/[id] returns job status and parsed result", async () => {
    const { company, admin, token } = await makeFixtures();
    const config = await createOptimizationConfig({ companyId: company.id });
    const vehicle = await createVehicle({ companyId: company.id });
    const driver = await createDriver(company.id);

    const result = buildOptimizationResult([
      {
        routeId: "route-1",
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        driverId: driver.id,
        stops: [],
        totalDistance: 5000,
        totalDuration: 1800,
        totalWeight: 100,
        totalVolume: 10,
        utilizationPercentage: 50,
        timeWindowViolations: 0,
      },
    ]);

    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as any,
    });

    const request = await createTestRequest(`/api/optimization/jobs/${job.id}`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const res = await getJob(request, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBe(job.id);
    expect(body.data.status).toBe("COMPLETED");
    expect(body.data.configurationId).toBe(config.id);
    expect(body.data.result).toBeDefined();
    expect(body.data.createdAt).toBeDefined();
  });

  test("GET /jobs/[id] for non-existent job returns 404", async () => {
    const { company, admin, token } = await makeFixtures();
    const fakeId = "00000000-0000-4000-a000-000000000099";

    const request = await createTestRequest(`/api/optimization/jobs/${fakeId}`, {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const res = await getJob(request, {
      params: Promise.resolve({ id: fakeId }),
    });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  // ==========================================================================
  // DELETE /api/optimization/jobs/[id]
  // ==========================================================================

  test("DELETE /jobs/[id] cancels PENDING job", async () => {
    const { company, admin, token } = await makeFixtures();
    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      status: "PENDING",
      progress: 0,
    });

    const request = await createTestRequest(`/api/optimization/jobs/${job.id}`, {
      method: "DELETE",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const res = await cancelJobRoute(request, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.status).toBe("CANCELLED");
    expect(body.data.message).toContain("cancelled");
  });

  test("DELETE /jobs/[id] on COMPLETED job returns 400", async () => {
    const { company, admin, token } = await makeFixtures();
    const config = await createOptimizationConfig({ companyId: company.id });
    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      status: "COMPLETED",
    });

    const request = await createTestRequest(`/api/optimization/jobs/${job.id}`, {
      method: "DELETE",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const res = await cancelJobRoute(request, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("cannot be cancelled");
  });

  // ==========================================================================
  // GET /api/optimization/jobs/[id]/validate
  // ==========================================================================

  test("GET /jobs/[id]/validate returns plan validation result", async () => {
    const { company, admin, token } = await makeFixtures();
    const config = await createOptimizationConfig({ companyId: company.id });
    const vehicle = await createVehicle({ companyId: company.id });
    const driver = await createDriver(company.id);

    const result = buildOptimizationResult([
      {
        routeId: "route-1",
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        driverId: driver.id,
        stops: [],
        totalDistance: 5000,
        totalDuration: 1800,
        totalWeight: 100,
        totalVolume: 10,
        utilizationPercentage: 50,
        timeWindowViolations: 0,
      },
    ]);

    const job = await createOptimizationJob({
      companyId: company.id,
      configurationId: config.id,
      result: result as any,
    });

    const request = await createTestRequest(
      `/api/optimization/jobs/${job.id}/validate`,
      {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      },
    );

    const res = await validateJob(request, {
      params: Promise.resolve({ id: job.id }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.isValid).toBe(true);
    expect(body.canConfirm).toBe(true);
    expect(body.jobId).toBe(job.id);
    expect(body.configurationId).toBe(config.id);
    expect(body.summaryText).toBeDefined();
  });

  // ==========================================================================
  // GET /api/optimization/engines
  // ==========================================================================

  test("GET /engines lists available engines with capabilities", async () => {
    const { company, admin, token } = await makeFixtures();

    const request = await createTestRequest("/api/optimization/engines", {
      method: "GET",
      token,
      companyId: company.id,
      userId: admin.id,
    });

    const res = await listEngines(request);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.optimizers).toBeDefined();
    expect(body.data.optimizers.length).toBeGreaterThanOrEqual(1);
    expect(body.data.recommended).toBe("VROOM");

    const vroom = body.data.optimizers.find((o: any) => o.type === "VROOM");
    expect(vroom).toBeDefined();
    expect(vroom.available).toBe(true);
    expect(vroom.capabilities).toBeDefined();
    expect(vroom.capabilities.supportsTimeWindows).toBe(true);
  });

  // ==========================================================================
  // Tenant isolation
  // ==========================================================================

  test("tenant isolation: company A cannot see company B configs or jobs", async () => {
    const companyA = await createCompany();
    const companyB = await createCompany();
    const adminA = await createAdmin(null);
    const adminB = await createAdmin(null);

    const tokenA = await createTestToken({
      userId: adminA.id,
      companyId: companyA.id,
      email: adminA.email,
      role: adminA.role,
    });
    const tokenB = await createTestToken({
      userId: adminB.id,
      companyId: companyB.id,
      email: adminB.email,
      role: adminB.role,
    });

    // Create config and job in company A
    const configA = await createOptimizationConfig({
      companyId: companyA.id,
      name: "Company A Config",
    });
    const jobA = await createOptimizationJob({
      companyId: companyA.id,
      configurationId: configA.id,
    });

    // Create config in company B
    await createOptimizationConfig({
      companyId: companyB.id,
      name: "Company B Config",
    });

    // Company B should not see Company A configs
    const reqB = await createTestRequest("/api/optimization/configure", {
      method: "GET",
      token: tokenB,
      companyId: companyB.id,
      userId: adminB.id,
    });
    const resB = await listConfigs(reqB);
    expect(resB.status).toBe(200);
    const bodyB = await resB.json();
    const configIds = bodyB.data.map((c: any) => c.id);
    expect(configIds).not.toContain(configA.id);

    // Company B should not see Company A jobs
    const reqJobsB = await createTestRequest("/api/optimization/jobs", {
      method: "GET",
      token: tokenB,
      companyId: companyB.id,
      userId: adminB.id,
    });
    const resJobsB = await listJobs(reqJobsB);
    expect(resJobsB.status).toBe(200);
    const bodyJobsB = await resJobsB.json();
    const jobIds = bodyJobsB.data.map((j: any) => j.id);
    expect(jobIds).not.toContain(jobA.id);

    // Company B should get 404 trying to read Company A job by ID
    const reqGetA = await createTestRequest(
      `/api/optimization/jobs/${jobA.id}`,
      {
        method: "GET",
        token: tokenB,
        companyId: companyB.id,
        userId: adminB.id,
      },
    );
    const resGetA = await getJob(reqGetA, {
      params: Promise.resolve({ id: jobA.id }),
    });
    expect(resGetA.status).toBe(404);
  });
});
