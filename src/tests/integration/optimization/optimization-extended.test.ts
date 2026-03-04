import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { eq } from "drizzle-orm";
import { testDb, cleanDatabase } from "../setup/test-db";
import { createTestToken } from "../setup/test-auth";
import { createTestRequest } from "../setup/test-request";
import {
  createCompany,
  createAdmin,
  createVehicle,
  createOptimizationConfig,
  createOptimizationJob,
  createOptimizationPreset,
  createOutputHistory,
  createOrder,
  buildOptimizationResult,
} from "../setup/test-data";
import { optimizationPresets } from "@/db/schema";

// ---------------------------------------------------------------------------
// Mocks — plan-metrics (fully controllable)
// ---------------------------------------------------------------------------

let _planMetricsResults = new Map<string, unknown>();

function getPlanMetricsResult(companyId: string, jobId: string) {
  const key = `${companyId}:${jobId}`;
  if (_planMetricsResults.has(key)) {
    return _planMetricsResults.get(key);
  }
  return {
    id: "metrics-1",
    companyId,
    jobId,
    totalRoutes: 2,
    totalStops: 8,
    totalDistance: 12000,
    totalDuration: 4800,
    averageUtilizationRate: 65,
    timeWindowComplianceRate: 92,
  };
}

mock.module("@/lib/optimization/plan-metrics", () => ({
  calculatePlanMetrics: (
    companyId: string,
    jobId: string,
    configurationId: string,
  ) => ({
    companyId,
    jobId,
    configurationId,
    totalRoutes: 1,
    totalStops: 2,
    totalDistance: 1000,
    totalDuration: 3600,
  }),
  calculateComparisonMetrics: async () => null,
  findPreviousJobForComparison: async () => null,
  savePlanMetrics: async () => "mock-metrics-id",
  getPlanMetrics: async (companyId: string, jobId: string) => {
    return getPlanMetricsResult(companyId, jobId);
  },
  getHistoricalMetrics: async (companyId: string, _limit: number) => {
    return [
      {
        jobId: "hist-job-1",
        companyId,
        totalRoutes: 3,
        totalStops: 10,
        totalDistance: 5000,
        totalDuration: 7200,
        averageUtilizationRate: 60,
        timeWindowComplianceRate: 88,
        createdAt: new Date(),
      },
    ];
  },
  getMetricsSummaryStats: async (companyId: string) => {
    return {
      companyId,
      averageRoutes: 2.5,
      averageStops: 8,
      averageDistance: 4000,
      totalJobs: 5,
    };
  },
}));

// Mock output-generator
let _canGenerateResult: { canGenerate: boolean; reason?: string } | null = null;

mock.module("@/lib/routing/output-generator", () => ({
  canGenerateOutput: async (_companyId: string, _jobId: string) => {
    return _canGenerateResult ?? { canGenerate: true };
  },
  generatePlanOutput: async (
    _companyId: string,
    jobId: string,
    userId: string,
    format: string,
  ) => ({
    outputId: "generated-output-id",
    jobId,
    jobName: "Test Job",
    configurationId: "config-1",
    configurationName: "Test Config",
    generatedAt: new Date().toISOString(),
    generatedBy: userId,
    format,
    driverRoutes: [],
    summary: {
      totalRoutes: 0,
      totalStops: 0,
      pendingStops: 0,
      inProgressStops: 0,
      completedStops: 0,
      failedStops: 0,
      uniqueDrivers: 0,
      uniqueVehicles: 0,
    },
  }),
  convertOutputToCSV: (_output: unknown) => "col1,col2\nval1,val2",
  formatOutputForDisplay: (_output: unknown) => "Formatted output",
  getOutputHistory: async (
    companyId: string,
    options: { jobId?: string; limit?: number; offset?: number },
  ) => {
    const { and, eq: eqOp, desc } = await import("drizzle-orm");
    const { outputHistory, optimizationJobs } = await import("@/db/schema");
    const { jobId, limit = 50, offset = 0 } = options;

    const whereCondition = jobId
      ? and(
          eqOp(outputHistory.companyId, companyId),
          eqOp(outputHistory.jobId, jobId),
        )
      : eqOp(outputHistory.companyId, companyId);

    return await testDb
      .select({
        output: outputHistory,
        job: {
          id: optimizationJobs.id,
          status: optimizationJobs.status,
        },
      })
      .from(outputHistory)
      .leftJoin(
        optimizationJobs,
        eqOp(outputHistory.jobId, optimizationJobs.id),
      )
      .where(whereCondition!)
      .orderBy(desc(outputHistory.createdAt))
      .limit(limit)
      .offset(offset);
  },
  getOutputById: async (companyId: string, outputId: string) => {
    const { and, eq: eqOp } = await import("drizzle-orm");
    const { outputHistory } = await import("@/db/schema");

    const result = await testDb
      .select()
      .from(outputHistory)
      .where(
        and(
          eqOp(outputHistory.id, outputId),
          eqOp(outputHistory.companyId, companyId),
        ),
      )
      .limit(1);

    return result[0] || null;
  },
}));

// ---------------------------------------------------------------------------
// Route handler imports
// ---------------------------------------------------------------------------

import {
  GET as getPresetById,
  PUT as updatePreset,
  DELETE as deletePreset,
} from "@/app/api/optimization-presets/[id]/route";
import {
  GET as listPresets,
} from "@/app/api/optimization-presets/route";
import { GET as getJobMetrics } from "@/app/api/optimization/jobs/[id]/metrics/route";
import { POST as swapVehicles } from "@/app/api/optimization/jobs/[id]/swap-vehicles/route";
import {
  DELETE as deleteJob,
} from "@/app/api/optimization/jobs/[id]/route";
import {
  GET as listOutputs,
  POST as createOutput,
} from "@/app/api/output/route";
import { GET as getOutputByIdRoute } from "@/app/api/output/[outputId]/route";

import { setTenantContext } from "@/lib/infra/tenant";

// ---------------------------------------------------------------------------
// Per-test fixture factory — avoids Neon FK race conditions
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

describe("Optimization Extended — Presets, Metrics, Swap-Vehicles, Output", () => {
  beforeAll(async () => {
    await cleanDatabase();
    // Reset controllable mocks
    _planMetricsResults.clear();
    _canGenerateResult = null;
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ==========================================================================
  // GET /api/optimization-presets/[id]
  // ==========================================================================

  describe("GET /api/optimization-presets/[id]", () => {
    test("returns a single preset by ID (200)", async () => {
      const { company, admin, token } = await makeFixtures();
      const preset = await createOptimizationPreset({
        companyId: company.id,
        name: "Fetch Me Preset",
        trafficFactor: 60,
      });

      const request = await createTestRequest(
        `/api/optimization-presets/${preset.id}`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const res = await getPresetById(request, {
        params: Promise.resolve({ id: preset.id }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe(preset.id);
      expect(body.data.name).toBe("Fetch Me Preset");
      expect(body.data.trafficFactor).toBe(60);
      expect(body.data.companyId).toBe(company.id);
    });

    test("returns 404 for non-existent preset", async () => {
      const { company, admin, token } = await makeFixtures();
      const fakeId = "00000000-0000-4000-a000-000000000001";

      const request = await createTestRequest(
        `/api/optimization-presets/${fakeId}`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const res = await getPresetById(request, {
        params: Promise.resolve({ id: fakeId }),
      });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });
  });

  // ==========================================================================
  // PUT /api/optimization-presets/[id] — extended tests
  // ==========================================================================

  describe("PUT /api/optimization-presets/[id] extended", () => {
    test("returns 404 when updating non-existent preset", async () => {
      const { company, admin, token } = await makeFixtures();
      const fakeId = "00000000-0000-4000-a000-000000000002";

      const request = await createTestRequest(
        `/api/optimization-presets/${fakeId}`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { name: "Ghost Preset" },
        },
      );

      const res = await updatePreset(request, {
        params: Promise.resolve({ id: fakeId }),
      });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    test("setting isDefault unsets other defaults in transaction", async () => {
      const { company, admin, token } = await makeFixtures();

      const oldDefault = await createOptimizationPreset({
        companyId: company.id,
        name: "Old Default",
        isDefault: true,
      });

      const targetPreset = await createOptimizationPreset({
        companyId: company.id,
        name: "Soon Default",
        isDefault: false,
      });

      const request = await createTestRequest(
        `/api/optimization-presets/${targetPreset.id}`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { isDefault: true },
        },
      );

      const res = await updatePreset(request, {
        params: Promise.resolve({ id: targetPreset.id }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.isDefault).toBe(true);

      const [oldRec] = await testDb
        .select()
        .from(optimizationPresets)
        .where(eq(optimizationPresets.id, oldDefault.id));
      expect(oldRec.isDefault).toBe(false);
    });

    test("partial update preserves unmodified fields", async () => {
      const { company, admin, token } = await makeFixtures();

      const preset = await createOptimizationPreset({
        companyId: company.id,
        name: "Partial Update",
        trafficFactor: 40,
        balanceVisits: true,
        minimizeVehicles: false,
      });

      const request = await createTestRequest(
        `/api/optimization-presets/${preset.id}`,
        {
          method: "PUT",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { name: "Renamed" },
        },
      );

      const res = await updatePreset(request, {
        params: Promise.resolve({ id: preset.id }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.name).toBe("Renamed");
      expect(body.data.trafficFactor).toBe(40);
      expect(body.data.balanceVisits).toBe(true);
      expect(body.data.minimizeVehicles).toBe(false);
    });
  });

  // ==========================================================================
  // DELETE /api/optimization-presets/[id] — 404 and list check
  // ==========================================================================

  describe("DELETE /api/optimization-presets/[id] extended", () => {
    test("returns 404 when deleting non-existent preset", async () => {
      const { company, admin, token } = await makeFixtures();
      const fakeId = "00000000-0000-4000-a000-000000000003";

      const request = await createTestRequest(
        `/api/optimization-presets/${fakeId}`,
        {
          method: "DELETE",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const res = await deletePreset(request, {
        params: Promise.resolve({ id: fakeId }),
      });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    test("soft-deleted preset no longer appears in list", async () => {
      const { company, admin, token } = await makeFixtures();

      const preset = await createOptimizationPreset({
        companyId: company.id,
        name: "Will Disappear",
      });

      const delReq = await createTestRequest(
        `/api/optimization-presets/${preset.id}`,
        {
          method: "DELETE",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );
      const delRes = await deletePreset(delReq, {
        params: Promise.resolve({ id: preset.id }),
      });
      expect(delRes.status).toBe(200);

      const listReq = await createTestRequest("/api/optimization-presets", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });
      const listRes = await listPresets(listReq);
      expect(listRes.status).toBe(200);

      const body = await listRes.json();
      const ids = body.data.map((p: { id: string }) => p.id);
      expect(ids).not.toContain(preset.id);
    });
  });

  // ==========================================================================
  // GET /api/optimization/jobs/[id]/metrics
  // ==========================================================================

  describe("GET /api/optimization/jobs/[id]/metrics", () => {
    test("returns plan metrics for a job (200)", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        status: "COMPLETED",
      });

      setTenantContext({ companyId: company.id, userId: admin.id });

      const request = await createTestRequest(
        `/api/optimization/jobs/${job.id}/metrics`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const res = await getJobMetrics(request, {
        params: Promise.resolve({ id: job.id }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.metrics).toBeDefined();
      expect(body.metrics.totalRoutes).toBe(2);
      expect(body.metrics.totalStops).toBe(8);
      expect(body.metrics.totalDistance).toBe(12000);
    });

    test("returns 404 when no metrics exist for the job", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        status: "COMPLETED",
      });

      _planMetricsResults.set(`${company.id}:${job.id}`, null);

      setTenantContext({ companyId: company.id, userId: admin.id });

      const request = await createTestRequest(
        `/api/optimization/jobs/${job.id}/metrics`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const res = await getJobMetrics(request, {
        params: Promise.resolve({ id: job.id }),
      });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");

      // Clean up controllable mock
      _planMetricsResults.delete(`${company.id}:${job.id}`);
    });

    test("includes historical metrics when requested", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        status: "COMPLETED",
      });

      setTenantContext({ companyId: company.id, userId: admin.id });

      const request = await createTestRequest(
        `/api/optimization/jobs/${job.id}/metrics`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
          searchParams: { includeHistorical: "true", historicalLimit: "5" },
        },
      );

      const res = await getJobMetrics(request, {
        params: Promise.resolve({ id: job.id }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.metrics).toBeDefined();
      expect(body.historical).toBeDefined();
      expect(Array.isArray(body.historical)).toBe(true);
      expect(body.historical.length).toBeGreaterThan(0);
    });

    test("includes summary stats when requested", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        status: "COMPLETED",
      });

      setTenantContext({ companyId: company.id, userId: admin.id });

      const request = await createTestRequest(
        `/api/optimization/jobs/${job.id}/metrics`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
          searchParams: { includeSummary: "true" },
        },
      );

      const res = await getJobMetrics(request, {
        params: Promise.resolve({ id: job.id }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.metrics).toBeDefined();
      expect(body.summary).toBeDefined();
      expect(body.summary.totalJobs).toBe(5);
    });

    test("includes both historical and summary when both requested", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        status: "COMPLETED",
      });

      setTenantContext({ companyId: company.id, userId: admin.id });

      const request = await createTestRequest(
        `/api/optimization/jobs/${job.id}/metrics`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
          searchParams: { includeHistorical: "true", includeSummary: "true" },
        },
      );

      const res = await getJobMetrics(request, {
        params: Promise.resolve({ id: job.id }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.metrics).toBeDefined();
      expect(body.historical).toBeDefined();
      expect(body.summary).toBeDefined();
    });
  });

  // ==========================================================================
  // POST /api/optimization/jobs/[id]/swap-vehicles
  // ==========================================================================

  describe("POST /api/optimization/jobs/[id]/swap-vehicles", () => {
    test("returns 400 when vehicleAId or vehicleBId is missing", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        status: "COMPLETED",
      });

      const request = await createTestRequest(
        `/api/optimization/jobs/${job.id}/swap-vehicles`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { vehicleAId: "some-id" },
        },
      );

      const res = await swapVehicles(request, {
        params: Promise.resolve({ id: job.id }),
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("required");
    });

    test("returns 400 when swapping a vehicle with itself", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        status: "COMPLETED",
      });

      const request = await createTestRequest(
        `/api/optimization/jobs/${job.id}/swap-vehicles`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { vehicleAId: "vehicle-1", vehicleBId: "vehicle-1" },
        },
      );

      const res = await swapVehicles(request, {
        params: Promise.resolve({ id: job.id }),
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("itself");
    });

    test("returns 404 when job does not exist", async () => {
      const { company, admin, token } = await makeFixtures();
      const fakeJobId = "00000000-0000-4000-a000-000000000010";

      const request = await createTestRequest(
        `/api/optimization/jobs/${fakeJobId}/swap-vehicles`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { vehicleAId: "v-a", vehicleBId: "v-b" },
        },
      );

      const res = await swapVehicles(request, {
        params: Promise.resolve({ id: fakeJobId }),
      });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    test("returns 400 when job has no result", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        status: "COMPLETED",
        result: null as any,
      });

      const request = await createTestRequest(
        `/api/optimization/jobs/${job.id}/swap-vehicles`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { vehicleAId: "v-a", vehicleBId: "v-b" },
        },
      );

      const res = await swapVehicles(request, {
        params: Promise.resolve({ id: job.id }),
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("no results");
    });

    test("returns 404 when vehicle A not found in routes", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const vehicleA = await createVehicle({ companyId: company.id });
      const vehicleB = await createVehicle({ companyId: company.id });

      const result = buildOptimizationResult([
        {
          routeId: "route-1",
          vehicleId: vehicleB.id,
          vehiclePlate: vehicleB.plate,
          stops: [
            {
              orderId: "order-1",
              trackingId: "TRK-1",
              sequence: 1,
              address: "Av. Test 1",
              latitude: "-12.04",
              longitude: "-77.04",
            },
          ],
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
        status: "COMPLETED",
      });

      const request = await createTestRequest(
        `/api/optimization/jobs/${job.id}/swap-vehicles`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { vehicleAId: vehicleA.id, vehicleBId: vehicleB.id },
        },
      );

      const res = await swapVehicles(request, {
        params: Promise.resolve({ id: job.id }),
      });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("Vehicle A not found");
    });

    test("returns 404 when vehicle B not found in routes", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const vehicleA = await createVehicle({ companyId: company.id });
      const vehicleB = await createVehicle({ companyId: company.id });

      const result = buildOptimizationResult([
        {
          routeId: "route-1",
          vehicleId: vehicleA.id,
          vehiclePlate: vehicleA.plate,
          stops: [
            {
              orderId: "order-1",
              trackingId: "TRK-1",
              sequence: 1,
              address: "Av. Test 1",
              latitude: "-12.04",
              longitude: "-77.04",
            },
          ],
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
        status: "COMPLETED",
      });

      const request = await createTestRequest(
        `/api/optimization/jobs/${job.id}/swap-vehicles`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { vehicleAId: vehicleA.id, vehicleBId: vehicleB.id },
        },
      );

      const res = await swapVehicles(request, {
        params: Promise.resolve({ id: job.id }),
      });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("Vehicle B not found");
    });

    test("swaps stops between two vehicles successfully", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const vehicleA = await createVehicle({ companyId: company.id });
      const vehicleB = await createVehicle({ companyId: company.id });
      const orderA = await createOrder({ companyId: company.id });
      const orderB = await createOrder({ companyId: company.id });

      const result = buildOptimizationResult([
        {
          routeId: "route-a",
          vehicleId: vehicleA.id,
          vehiclePlate: vehicleA.plate,
          stops: [
            {
              orderId: orderA.id,
              trackingId: orderA.trackingId,
              sequence: 1,
              address: "Av. Route A Stop",
              latitude: "-12.04",
              longitude: "-77.04",
            },
          ],
          totalDistance: 3000,
          totalDuration: 900,
          totalWeight: 50,
          totalVolume: 5,
          utilizationPercentage: 40,
          timeWindowViolations: 0,
        },
        {
          routeId: "route-b",
          vehicleId: vehicleB.id,
          vehiclePlate: vehicleB.plate,
          stops: [
            {
              orderId: orderB.id,
              trackingId: orderB.trackingId,
              sequence: 1,
              address: "Av. Route B Stop",
              latitude: "-12.05",
              longitude: "-77.05",
            },
          ],
          totalDistance: 4000,
          totalDuration: 1200,
          totalWeight: 60,
          totalVolume: 6,
          utilizationPercentage: 45,
          timeWindowViolations: 0,
        },
      ]);

      (result as any).depot = { latitude: -12.0464, longitude: -77.0428 };

      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        result: result as any,
        status: "COMPLETED",
      });

      const request = await createTestRequest(
        `/api/optimization/jobs/${job.id}/swap-vehicles`,
        {
          method: "POST",
          token,
          companyId: company.id,
          userId: admin.id,
          body: { vehicleAId: vehicleA.id, vehicleBId: vehicleB.id },
        },
      );

      const res = await swapVehicles(request, {
        params: Promise.resolve({ id: job.id }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.routes).toBeDefined();
      expect(body.metrics).toBeDefined();
      expect(body.summary).toBeDefined();
      expect(body.summary.optimizedAt).toBeDefined();
    });
  });

  // ==========================================================================
  // DELETE /api/optimization/jobs/[id] — soft-delete completed/failed jobs
  // ==========================================================================

  describe("DELETE /api/optimization/jobs/[id] — soft-delete", () => {
    test("soft-deletes COMPLETED job and releases lock (200)", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        status: "COMPLETED",
      });

      const request = await createTestRequest(
        `/api/optimization/jobs/${job.id}`,
        {
          method: "DELETE",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const res = await deleteJob(request, {
        params: Promise.resolve({ id: job.id }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.status).toBe("CANCELLED");
      expect(body.data.message).toContain("deleted");
    });

    test("soft-deletes FAILED job and releases lock (200)", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        status: "FAILED",
        progress: 0,
        error: "Some error occurred",
      });

      const request = await createTestRequest(
        `/api/optimization/jobs/${job.id}`,
        {
          method: "DELETE",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const res = await deleteJob(request, {
        params: Promise.resolve({ id: job.id }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.status).toBe("CANCELLED");
      expect(body.data.message).toContain("deleted");
    });

    test("returns 404 for non-existent job", async () => {
      const { company, admin, token } = await makeFixtures();
      const fakeId = "00000000-0000-4000-a000-000000000020";

      const request = await createTestRequest(
        `/api/optimization/jobs/${fakeId}`,
        {
          method: "DELETE",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const res = await deleteJob(request, {
        params: Promise.resolve({ id: fakeId }),
      });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });
  });

  // ==========================================================================
  // GET /api/output — List output history
  // ==========================================================================

  describe("GET /api/output", () => {
    test("lists output history for the company (200)", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        status: "COMPLETED",
      });

      await createOutputHistory({
        companyId: company.id,
        jobId: job.id,
        generatedBy: admin.id,
        format: "JSON",
        status: "GENERATED",
      });
      await createOutputHistory({
        companyId: company.id,
        jobId: job.id,
        generatedBy: admin.id,
        format: "CSV",
        status: "GENERATED",
      });

      setTenantContext({ companyId: company.id, userId: admin.id });

      const request = await createTestRequest("/api/output", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
      });

      const res = await listOutputs(request);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.outputs).toBeDefined();
      expect(Array.isArray(body.outputs)).toBe(true);
      expect(body.outputs.length).toBeGreaterThanOrEqual(2);
      expect(body.pagination).toBeDefined();
    });

    test("filters output history by jobId", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const job1 = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        status: "COMPLETED",
      });
      const job2 = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        status: "COMPLETED",
      });

      await createOutputHistory({
        companyId: company.id,
        jobId: job1.id,
        generatedBy: admin.id,
      });
      await createOutputHistory({
        companyId: company.id,
        jobId: job2.id,
        generatedBy: admin.id,
      });

      setTenantContext({ companyId: company.id, userId: admin.id });

      const request = await createTestRequest("/api/output", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { jobId: job1.id },
      });

      const res = await listOutputs(request);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      for (const entry of body.outputs) {
        expect(entry.output.jobId).toBe(job1.id);
      }
    });

    test("respects limit and offset pagination", async () => {
      const { company, admin, token } = await makeFixtures();
      const config = await createOptimizationConfig({ companyId: company.id });
      const job = await createOptimizationJob({
        companyId: company.id,
        configurationId: config.id,
        status: "COMPLETED",
      });

      for (let i = 0; i < 3; i++) {
        await createOutputHistory({
          companyId: company.id,
          jobId: job.id,
          generatedBy: admin.id,
        });
      }

      setTenantContext({ companyId: company.id, userId: admin.id });

      const request = await createTestRequest("/api/output", {
        method: "GET",
        token,
        companyId: company.id,
        userId: admin.id,
        searchParams: { limit: "2", offset: "0" },
      });

      const res = await listOutputs(request);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.outputs.length).toBeLessThanOrEqual(2);
      expect(body.pagination.limit).toBe(2);
      expect(body.pagination.offset).toBe(0);
    });
  });

  // ==========================================================================
  // POST /api/output — Generate output
  // ==========================================================================

  describe("POST /api/output", () => {
    test("generates JSON output successfully (200)", async () => {
      const { company, admin, token } = await makeFixtures();
      _canGenerateResult = { canGenerate: true };

      setTenantContext({ companyId: company.id, userId: admin.id });

      const request = await createTestRequest("/api/output", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { jobId: "some-job-id", format: "JSON" },
      });

      const res = await createOutput(request);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.outputId).toBe("generated-output-id");
      expect(body.format).toBe("JSON");
      expect(body.data).toBeDefined();

      _canGenerateResult = null;
    });

    test("generates CSV output successfully (200)", async () => {
      const { company, admin, token } = await makeFixtures();
      _canGenerateResult = { canGenerate: true };

      setTenantContext({ companyId: company.id, userId: admin.id });

      const request = await createTestRequest("/api/output", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { jobId: "some-job-id", format: "CSV" },
      });

      const res = await createOutput(request);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.format).toBe("CSV");
      expect(body.data).toBeDefined();
      expect(typeof body.data).toBe("string");

      _canGenerateResult = null;
    });

    test("returns 400 when jobId is missing", async () => {
      const { company, admin, token } = await makeFixtures();
      setTenantContext({ companyId: company.id, userId: admin.id });

      const request = await createTestRequest("/api/output", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { format: "JSON" },
      });

      const res = await createOutput(request);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("jobId");
    });

    test("returns 400 for invalid format", async () => {
      const { company, admin, token } = await makeFixtures();
      setTenantContext({ companyId: company.id, userId: admin.id });

      const request = await createTestRequest("/api/output", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { jobId: "some-id", format: "XML" },
      });

      const res = await createOutput(request);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("format");
    });

    test("returns 400 when canGenerateOutput fails", async () => {
      const { company, admin, token } = await makeFixtures();
      _canGenerateResult = {
        canGenerate: false,
        reason: "Job status is PENDING, must be COMPLETED to generate output",
      };

      setTenantContext({ companyId: company.id, userId: admin.id });

      const request = await createTestRequest("/api/output", {
        method: "POST",
        token,
        companyId: company.id,
        userId: admin.id,
        body: { jobId: "some-job-id", format: "JSON" },
      });

      const res = await createOutput(request);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("Cannot generate output");
      expect(body.details).toContain("PENDING");

      _canGenerateResult = null;
    });
  });

  // ==========================================================================
  // GET /api/output/[outputId]
  // ==========================================================================

  describe("GET /api/output/[outputId]", () => {
    test("returns 404 for non-existent output", async () => {
      const { company, admin, token } = await makeFixtures();
      const fakeOutputId = "00000000-0000-4000-a000-000000000030";

      setTenantContext({ companyId: company.id, userId: admin.id });

      const request = await createTestRequest(
        `/api/output/${fakeOutputId}`,
        {
          method: "GET",
          token,
          companyId: company.id,
          userId: admin.id,
        },
      );

      const res = await getOutputByIdRoute(request, {
        params: Promise.resolve({ outputId: fakeOutputId }),
      });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });
  });

  // ==========================================================================
  // Tenant isolation — presets
  // ==========================================================================

  describe("Tenant isolation for presets (extended)", () => {
    test("cannot update another company's preset", async () => {
      const fixturesA = await makeFixtures();
      const fixturesB = await makeFixtures();

      const presetB = await createOptimizationPreset({
        companyId: fixturesB.company.id,
        name: "Company B Preset",
      });

      const request = await createTestRequest(
        `/api/optimization-presets/${presetB.id}`,
        {
          method: "PUT",
          token: fixturesA.token,
          companyId: fixturesA.company.id,
          userId: fixturesA.admin.id,
          body: { name: "Hijacked Preset" },
        },
      );

      const res = await updatePreset(request, {
        params: Promise.resolve({ id: presetB.id }),
      });
      expect(res.status).toBe(404);
    });

    test("cannot delete another company's preset", async () => {
      const fixturesA = await makeFixtures();
      const fixturesB = await makeFixtures();

      const presetB = await createOptimizationPreset({
        companyId: fixturesB.company.id,
        name: "Company B Untouchable",
      });

      const request = await createTestRequest(
        `/api/optimization-presets/${presetB.id}`,
        {
          method: "DELETE",
          token: fixturesA.token,
          companyId: fixturesA.company.id,
          userId: fixturesA.admin.id,
        },
      );

      const res = await deletePreset(request, {
        params: Promise.resolve({ id: presetB.id }),
      });
      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // Tenant isolation — job operations
  // ==========================================================================

  describe("Tenant isolation for job operations", () => {
    test("cannot fetch metrics for another company's job", async () => {
      const fixturesA = await makeFixtures();
      const fixturesB = await makeFixtures();

      const configB = await createOptimizationConfig({
        companyId: fixturesB.company.id,
      });
      const jobB = await createOptimizationJob({
        companyId: fixturesB.company.id,
        configurationId: configB.id,
        status: "COMPLETED",
      });

      // Ensure metrics return null for company A querying company B's job
      _planMetricsResults.set(`${fixturesA.company.id}:${jobB.id}`, null);

      setTenantContext({ companyId: fixturesA.company.id, userId: fixturesA.admin.id });

      const request = await createTestRequest(
        `/api/optimization/jobs/${jobB.id}/metrics`,
        {
          method: "GET",
          token: fixturesA.token,
          companyId: fixturesA.company.id,
          userId: fixturesA.admin.id,
        },
      );

      const res = await getJobMetrics(request, {
        params: Promise.resolve({ id: jobB.id }),
      });
      expect(res.status).toBe(404);

      _planMetricsResults.delete(`${fixturesA.company.id}:${jobB.id}`);
    });

    test("cannot swap vehicles on another company's job", async () => {
      const fixturesA = await makeFixtures();
      const fixturesB = await makeFixtures();

      const configB = await createOptimizationConfig({
        companyId: fixturesB.company.id,
      });
      const vehicleB1 = await createVehicle({ companyId: fixturesB.company.id });
      const vehicleB2 = await createVehicle({ companyId: fixturesB.company.id });

      const result = buildOptimizationResult([
        {
          routeId: "route-1",
          vehicleId: vehicleB1.id,
          vehiclePlate: vehicleB1.plate,
          stops: [],
          totalDistance: 5000,
          totalDuration: 1800,
          totalWeight: 100,
          totalVolume: 10,
          utilizationPercentage: 50,
          timeWindowViolations: 0,
        },
        {
          routeId: "route-2",
          vehicleId: vehicleB2.id,
          vehiclePlate: vehicleB2.plate,
          stops: [],
          totalDistance: 3000,
          totalDuration: 900,
          totalWeight: 50,
          totalVolume: 5,
          utilizationPercentage: 30,
          timeWindowViolations: 0,
        },
      ]);

      const jobB = await createOptimizationJob({
        companyId: fixturesB.company.id,
        configurationId: configB.id,
        result: result as any,
        status: "COMPLETED",
      });

      const request = await createTestRequest(
        `/api/optimization/jobs/${jobB.id}/swap-vehicles`,
        {
          method: "POST",
          token: fixturesA.token,
          companyId: fixturesA.company.id,
          userId: fixturesA.admin.id,
          body: { vehicleAId: vehicleB1.id, vehicleBId: vehicleB2.id },
        },
      );

      const res = await swapVehicles(request, {
        params: Promise.resolve({ id: jobB.id }),
      });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    test("cannot delete another company's job", async () => {
      const fixturesA = await makeFixtures();
      const fixturesB = await makeFixtures();

      const configB = await createOptimizationConfig({
        companyId: fixturesB.company.id,
      });
      const jobB = await createOptimizationJob({
        companyId: fixturesB.company.id,
        configurationId: configB.id,
        status: "COMPLETED",
      });

      const request = await createTestRequest(
        `/api/optimization/jobs/${jobB.id}`,
        {
          method: "DELETE",
          token: fixturesA.token,
          companyId: fixturesA.company.id,
          userId: fixturesA.admin.id,
        },
      );

      const res = await deleteJob(request, {
        params: Promise.resolve({ id: jobB.id }),
      });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });
  });

  // ==========================================================================
  // Tenant isolation — output history
  // ==========================================================================

  describe("Tenant isolation for output history", () => {
    test("cannot see another company's output history", async () => {
      const fixturesA = await makeFixtures();
      const fixturesB = await makeFixtures();

      const configB = await createOptimizationConfig({
        companyId: fixturesB.company.id,
      });
      const jobB = await createOptimizationJob({
        companyId: fixturesB.company.id,
        configurationId: configB.id,
        status: "COMPLETED",
      });

      await createOutputHistory({
        companyId: fixturesB.company.id,
        jobId: jobB.id,
        generatedBy: fixturesB.admin.id,
      });

      setTenantContext({ companyId: fixturesA.company.id, userId: fixturesA.admin.id });

      const request = await createTestRequest("/api/output", {
        method: "GET",
        token: fixturesA.token,
        companyId: fixturesA.company.id,
        userId: fixturesA.admin.id,
      });

      const res = await listOutputs(request);
      expect(res.status).toBe(200);

      const body = await res.json();
      for (const entry of body.outputs) {
        expect(entry.output.companyId).not.toBe(fixturesB.company.id);
      }
    });

    test("cannot fetch another company's output by ID", async () => {
      const fixturesA = await makeFixtures();
      const fixturesB = await makeFixtures();

      const configB = await createOptimizationConfig({
        companyId: fixturesB.company.id,
      });
      const jobB = await createOptimizationJob({
        companyId: fixturesB.company.id,
        configurationId: configB.id,
        status: "COMPLETED",
      });

      const outputB = await createOutputHistory({
        companyId: fixturesB.company.id,
        jobId: jobB.id,
        generatedBy: fixturesB.admin.id,
      });

      setTenantContext({ companyId: fixturesA.company.id, userId: fixturesA.admin.id });

      const request = await createTestRequest(
        `/api/output/${outputB.id}`,
        {
          method: "GET",
          token: fixturesA.token,
          companyId: fixturesA.company.id,
          userId: fixturesA.admin.id,
        },
      );

      const res = await getOutputByIdRoute(request, {
        params: Promise.resolve({ outputId: outputB.id }),
      });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });
  });
});
