/**
 * Regression guard for per-config preset selection.
 *
 * Before this change, the runner always loaded the preset marked
 * `isDefault=true` for the company — meaning multi-preset setups ("Normal",
 * "Hora pico", "Fin de semana") were dead letters. Only the default ran.
 *
 * The fix: `optimization_configurations.optimization_preset_id` FK. The
 * runner honors whatever preset the config references; NULL falls back to
 * the company default so legacy configs keep working.
 *
 * This test seeds two presets with distinguishable values and asserts that
 * the preset bound to the config is the one whose settings reach VROOM.
 */

import { describe, test, expect, beforeAll, beforeEach, mock } from "bun:test";
import { cleanDatabase, testDb } from "../setup/test-db";
import {
  createAdmin,
  createCompany,
  createDriver,
  createOptimizationConfig,
  createOptimizationPreset,
  createOrder,
  createVehicle,
} from "../setup/test-data";
import type {
  OptimizationConfig as VroomOptConfig,
  OrderForOptimization,
  VehicleForOptimization,
} from "@/lib/optimization/vroom-optimizer";
import { eq } from "drizzle-orm";
import { optimizationConfigurations } from "@/db/schema";

interface CapturedCall {
  orders: OrderForOptimization[];
  vehicles: VehicleForOptimization[];
  config: VroomOptConfig;
}
const capturedCalls: CapturedCall[] = [];

mock.module("@/lib/optimization/vroom-optimizer", () => ({
  optimizeRoutes: async (
    orders: OrderForOptimization[],
    vehicles: VehicleForOptimization[],
    config: VroomOptConfig,
  ) => {
    capturedCalls.push({ orders, vehicles, config });
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

const { runOptimization } = await import(
  "@/lib/optimization/optimization-runner/run"
);

describe("optimization runner: per-config preset selection", () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(() => {
    capturedCalls.length = 0;
  });

  test(
    "config with explicit presetId uses THAT preset, not the default",
    async () => {
      const company = await createCompany({
        legalName: "Preset Test Co",
        commercialName: "Preset Test",
      });
      await createAdmin(company.id);
      const driver = await createDriver(company.id, {
        email: `d-${Date.now()}@t.co`,
      });
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "PRE-01",
      });
      await createOrder({ companyId: company.id, trackingId: "ORD-PRE" });

      // Default preset with balanceVisits=false.
      await createOptimizationPreset({
        companyId: company.id,
        name: "Default",
        balanceVisits: false,
        minimizeVehicles: false,
        maxDistanceKm: 100,
        trafficFactor: 50,
        isDefault: true,
      });

      // Non-default preset with distinguishable values.
      const peak = await createOptimizationPreset({
        companyId: company.id,
        name: "Peak",
        balanceVisits: true,
        minimizeVehicles: true,
        maxDistanceKm: 300,
        trafficFactor: 80,
        isDefault: false,
      });

      const config = await createOptimizationConfig({ companyId: company.id });
      // Bind the config to the non-default preset — the whole point of the fix.
      await testDb
        .update(optimizationConfigurations)
        .set({ optimizationPresetId: peak.id })
        .where(eq(optimizationConfigurations.id, config.id));

      await runOptimization({
        configurationId: config.id,
        companyId: company.id,
        vehicleIds: [vehicle.id],
        driverIds: [driver.id],
      });

      expect(capturedCalls.length).toBeGreaterThan(0);
      const { config: vroomConfig } = capturedCalls[0];
      // Values come from the "Peak" preset, not "Default".
      expect(vroomConfig.balanceVisits).toBe(true);
      expect(vroomConfig.minimizeVehicles).toBe(true);
      expect(vroomConfig.maxDistanceKm).toBe(300);
      expect(vroomConfig.trafficFactor).toBe(80);
    },
    30000,
  );

  test(
    "config with null presetId falls back to the company's default preset",
    async () => {
      const company = await createCompany({
        legalName: "Fallback Co",
        commercialName: "Fallback",
      });
      await createAdmin(company.id);
      const driver = await createDriver(company.id, {
        email: `d-${Date.now()}@t.co`,
      });
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "FB-01",
      });
      await createOrder({ companyId: company.id, trackingId: "ORD-FB" });

      await createOptimizationPreset({
        companyId: company.id,
        name: "Default",
        balanceVisits: true,
        minimizeVehicles: false,
        maxDistanceKm: 150,
        trafficFactor: 60,
        isDefault: true,
      });

      // Config has no presetId → runner should fall back to default.
      const config = await createOptimizationConfig({ companyId: company.id });

      await runOptimization({
        configurationId: config.id,
        companyId: company.id,
        vehicleIds: [vehicle.id],
        driverIds: [driver.id],
      });

      const { config: vroomConfig } = capturedCalls[0];
      expect(vroomConfig.balanceVisits).toBe(true);
      expect(vroomConfig.maxDistanceKm).toBe(150);
      expect(vroomConfig.trafficFactor).toBe(60);
    },
    30000,
  );
});
