/**
 * Regression guard for the plumbing that carries skills from the DB into the
 * VROOM solver through `src/lib/optimization/optimization-runner/run.ts`.
 *
 * Why this test exists
 * ────────────────────────────────────────────────────────────────────────────
 * The golden harness in `src/tests/routing-quality/` exercises the VROOM
 * adapter in isolation — it feeds orders and vehicles with pre-baked skill
 * arrays and asserts that VROOM respects them. That caught bugs in the
 * *adapter* but not in the *pipeline* that builds those arrays from DB rows.
 *
 * A real bug slipped through: `orders.requiredSkills` (a CSV text column) and
 * `vehicleSkillAssignments` (a junction table) existed in the schema, had
 * full CRUD, and were never read by the runner. Plans went out ignoring
 * skills, the verifier flagged violations post-hoc, and by then the conductor
 * was already on the road.
 *
 * This test captures the arguments the runner passes to VROOM and asserts
 * the mapping is correct. Mocking the solver with a capture keeps the test
 * fast (no HTTP, no OSRM) and surgical — we're only interested in the
 * plumbing, not VROOM's decisions.
 */

import { describe, test, expect, beforeAll, beforeEach, mock } from "bun:test";
import { cleanDatabase } from "../setup/test-db";
import {
  createAdmin,
  createCompany,
  createDriver,
  createOptimizationConfig,
  createOrder,
  createVehicle,
  createVehicleSkill,
  createVehicleSkillAssignment,
} from "../setup/test-data";
import type {
  OrderForOptimization,
  VehicleForOptimization,
} from "@/lib/optimization/vroom-optimizer";

// Override the default preload mock to capture VROOM arguments. The preload
// file already mocks this module with a no-op; bun's mock.module lets us
// swap in a new implementation from inside the test file.
interface CapturedCall {
  orders: OrderForOptimization[];
  vehicles: VehicleForOptimization[];
}
const capturedCalls: CapturedCall[] = [];

mock.module("@/lib/optimization/vroom-optimizer", () => ({
  optimizeRoutes: async (
    orders: OrderForOptimization[],
    vehicles: VehicleForOptimization[],
  ) => {
    capturedCalls.push({ orders, vehicles });
    // Shape matches real `optimizeRoutes` return — the runner reads
    // `.unassigned`, `.routes`, `.metrics` (see vroom-optimizer.ts:709).
    return {
      routes: [],
      unassigned: orders.map((o) => ({
        orderId: o.id,
        trackingId: o.trackingId,
        reason: "mocked",
      })),
      metrics: {
        totalDistance: 0,
        totalDuration: 0,
        totalRoutes: 0,
        totalStops: 0,
        computingTimeMs: 0,
        balanceScore: 0,
      },
      usedVroom: true,
    };
  },
}));

// Import AFTER the mock so the runner resolves the mocked module.
const { runOptimization } = await import(
  "@/lib/optimization/optimization-runner/run"
);

describe("optimization runner → VROOM: skills plumbing", () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(() => {
    capturedCalls.length = 0;
  });

  test(
    "passes vehicle skills and order skillsRequired to VROOM (no-zones path)",
    async () => {
    const company = await createCompany({ legalName: "Skills Test Co", commercialName: "Skills Test" });
    await createAdmin(company.id);
    const driver1 = await createDriver(company.id, { email: `d1-${Date.now()}@t.co` });
    const driver2 = await createDriver(company.id, { email: `d2-${Date.now()}@t.co` });

    const refrigerado = await createVehicleSkill({
      companyId: company.id,
      code: "REFRIGERADO",
      name: "Refrigerado",
      category: "TEMPERATURE",
    });

    const cold = await createVehicle({
      companyId: company.id,
      plate: "COLD-01",
      name: "Cold Truck",
    });
    const ambient = await createVehicle({
      companyId: company.id,
      plate: "AMB-01",
      name: "Ambient Truck",
    });

    await createVehicleSkillAssignment({
      companyId: company.id,
      vehicleId: cold.id,
      skillId: refrigerado.id,
    });

    await createOrder({
      companyId: company.id,
      trackingId: "COLD-JOB",
      requiredSkills: "REFRIGERADO",
    });
    await createOrder({
      companyId: company.id,
      trackingId: "NORMAL-JOB",
      requiredSkills: null,
    });

    const config = await createOptimizationConfig({ companyId: company.id });

    await runOptimization({
      configurationId: config.id,
      companyId: company.id,
      vehicleIds: [cold.id, ambient.id],
      driverIds: [driver1.id, driver2.id],
    });

    expect(capturedCalls.length).toBeGreaterThan(0);
    const { orders, vehicles } = capturedCalls[0];

    const coldOrderArg = orders.find((o) => o.trackingId === "COLD-JOB");
    expect(coldOrderArg?.skillsRequired).toEqual(["REFRIGERADO"]);

    const normalOrderArg = orders.find((o) => o.trackingId === "NORMAL-JOB");
    expect(normalOrderArg?.skillsRequired).toBeUndefined();

    const coldVehicleArg = vehicles.find((v) => v.id === cold.id);
    expect(coldVehicleArg?.skills).toEqual(["REFRIGERADO"]);

    const ambientVehicleArg = vehicles.find((v) => v.id === ambient.id);
    expect(ambientVehicleArg?.skills).toBeUndefined();
    },
    30000,
  );

  test(
    "parses CSV with whitespace and ignores blanks",
    async () => {
    const company = await createCompany({ legalName: "Skills CSV Co", commercialName: "Skills CSV" });
    await createAdmin(company.id);
    const driver = await createDriver(company.id, { email: `d-${Date.now()}@t.co` });

    await createVehicleSkill({
      companyId: company.id,
      code: "FRAGIL",
      name: "Frágil",
      category: "EQUIPMENT",
    });
    await createVehicleSkill({
      companyId: company.id,
      code: "URGENTE",
      name: "Urgente",
      category: "SPECIAL",
    });

    const vehicle = await createVehicle({
      companyId: company.id,
      plate: "ANY-01",
    });

    await createOrder({
      companyId: company.id,
      trackingId: "MULTI-SKILL",
      // Intentionally messy formatting — the parser must handle it.
      requiredSkills: "FRAGIL,  URGENTE,   ,",
    });

    const config = await createOptimizationConfig({ companyId: company.id });

    await runOptimization({
      configurationId: config.id,
      companyId: company.id,
      vehicleIds: [vehicle.id],
      driverIds: [driver.id],
    });

    expect(capturedCalls.length).toBeGreaterThan(0);
    const orderArg = capturedCalls[0].orders.find(
      (o) => o.trackingId === "MULTI-SKILL",
    );
    expect(orderArg?.skillsRequired).toEqual(["FRAGIL", "URGENTE"]);
    },
    30000,
  );
});
