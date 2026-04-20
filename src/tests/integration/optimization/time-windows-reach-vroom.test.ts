/**
 * Regression guard for the plumbing that resolves `orders.timeWindowPresetId`
 * to a concrete (start, end) pair before VROOM runs.
 *
 * The bug this test defends against
 * ────────────────────────────────────────────────────────────────────────────
 * The order form in the web UI saves only `timeWindowPresetId` — it does not
 * copy the preset's startTime/endTime onto the order. The runner previously
 * read only the explicit `timeWindowStart/End` columns. So orders created
 * through the form reached VROOM without any time window, and stops got
 * assigned at any hour of the day even though the user picked "Morning 9-12".
 *
 * The fix resolves the preset in `optimization-runner/run.ts` before mapping
 * to VROOM. This test verifies that resolution actually happens, covering
 * RANGE (direct start/end) and EXACT (derived from exactTime ± tolerance).
 */

import { describe, test, expect, beforeAll, beforeEach, mock } from "bun:test";
import { cleanDatabase } from "../setup/test-db";
import {
  createAdmin,
  createCompany,
  createDriver,
  createOptimizationConfig,
  createOrder,
  createTimeWindowPreset,
  createVehicle,
} from "../setup/test-data";
import type {
  OrderForOptimization,
  VehicleForOptimization,
} from "@/lib/optimization/vroom-optimizer";

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

describe("optimization runner → VROOM: time window preset resolution", () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(() => {
    capturedCalls.length = 0;
  });

  test(
    "RANGE preset populates timeWindowStart/End when order has only the id",
    async () => {
      const company = await createCompany({
        legalName: "TW Range Co",
        commercialName: "TW Range",
      });
      await createAdmin(company.id);
      const driver = await createDriver(company.id, {
        email: `d-${Date.now()}@t.co`,
      });

      const preset = await createTimeWindowPreset({
        companyId: company.id,
        name: "Mañana 9-12",
        type: "RANGE",
        startTime: "09:00",
        endTime: "12:00",
      });

      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "V-RANGE",
      });

      // Order references the preset but leaves start/end null — exactly how
      // the web form used to save it before the fix.
      await createOrder({
        companyId: company.id,
        trackingId: "RANGE-ORDER",
        timeWindowPresetId: preset.id,
        timeWindowStart: null,
        timeWindowEnd: null,
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
        (o) => o.trackingId === "RANGE-ORDER",
      );
      expect(orderArg?.timeWindowStart).toBe("09:00");
      expect(orderArg?.timeWindowEnd).toBe("12:00");
    },
    30000,
  );

  test(
    "EXACT preset derives window from exactTime ± toleranceMinutes",
    async () => {
      const company = await createCompany({
        legalName: "TW Exact Co",
        commercialName: "TW Exact",
      });
      await createAdmin(company.id);
      const driver = await createDriver(company.id, {
        email: `d-${Date.now()}@t.co`,
      });

      const preset = await createTimeWindowPreset({
        companyId: company.id,
        name: "Cita exacta 14:30",
        type: "EXACT",
        startTime: null,
        endTime: null,
        exactTime: "14:30",
        toleranceMinutes: 15,
      });

      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "V-EXACT",
      });

      await createOrder({
        companyId: company.id,
        trackingId: "EXACT-ORDER",
        timeWindowPresetId: preset.id,
        timeWindowStart: null,
        timeWindowEnd: null,
      });

      const config = await createOptimizationConfig({ companyId: company.id });

      await runOptimization({
        configurationId: config.id,
        companyId: company.id,
        vehicleIds: [vehicle.id],
        driverIds: [driver.id],
      });

      const orderArg = capturedCalls[0].orders.find(
        (o) => o.trackingId === "EXACT-ORDER",
      );
      expect(orderArg?.timeWindowStart).toBe("14:15");
      expect(orderArg?.timeWindowEnd).toBe("14:45");
    },
    30000,
  );

  test(
    "explicit timeWindowStart/End on the order override any preset",
    async () => {
      const company = await createCompany({
        legalName: "TW Override Co",
        commercialName: "TW Override",
      });
      await createAdmin(company.id);
      const driver = await createDriver(company.id, {
        email: `d-${Date.now()}@t.co`,
      });

      const preset = await createTimeWindowPreset({
        companyId: company.id,
        name: "Mañana 9-12",
        type: "RANGE",
        startTime: "09:00",
        endTime: "12:00",
      });

      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "V-OVERRIDE",
      });

      // Both the preset AND explicit values present — explicit wins.
      await createOrder({
        companyId: company.id,
        trackingId: "OVERRIDE-ORDER",
        timeWindowPresetId: preset.id,
        timeWindowStart: "15:00",
        timeWindowEnd: "17:00",
      });

      const config = await createOptimizationConfig({ companyId: company.id });

      await runOptimization({
        configurationId: config.id,
        companyId: company.id,
        vehicleIds: [vehicle.id],
        driverIds: [driver.id],
      });

      const orderArg = capturedCalls[0].orders.find(
        (o) => o.trackingId === "OVERRIDE-ORDER",
      );
      expect(orderArg?.timeWindowStart).toBe("15:00");
      expect(orderArg?.timeWindowEnd).toBe("17:00");
    },
    30000,
  );
});
