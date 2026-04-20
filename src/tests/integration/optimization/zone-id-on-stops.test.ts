/**
 * Regression guard for zone persistence on route_stops.
 *
 * Before this change, orders were mapped to zones on-the-fly via point-in-
 * polygon inside the runner, but that information never escaped the runner —
 * route_stops had no `zoneId` column, so monitoring couldn't show the zone
 * name/color next to a stop, and historical plans lost their zone context
 * if the polygon moved.
 *
 * The fix: `route_stops.zone_id` FK (ON DELETE SET NULL) + runner populates
 * `OptimizationRoute.zoneId` for every real zone batch (but not the synthetic
 * "unzoned" bucket). This test covers the runner side of the plumbing — the
 * confirm endpoint then spreads `route.zoneId` into the insert payload,
 * which is a one-liner surfaced by the test failures if it regresses.
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
  createZone,
  createZoneVehicle,
} from "../setup/test-data";
import type {
  OrderForOptimization,
  VehicleForOptimization,
} from "@/lib/optimization/vroom-optimizer";

// The runner wraps whatever the solver returns into `OptimizationRoute`
// objects. For this test we want the wrapped route to carry `zoneId` even
// though the solver itself doesn't know about zones — the runner derives it
// from the batch being processed. So the mock just needs to return a
// well-formed result that lets the runner proceed to the wrapping step.
mock.module("@/lib/optimization/vroom-optimizer", () => ({
  optimizeRoutes: async (
    orders: OrderForOptimization[],
    vehicles: VehicleForOptimization[],
  ) => ({
    routes:
      orders.length > 0 && vehicles.length > 0
        ? [
            {
              routeId: "mock-route",
              vehicleId: vehicles[0].id,
              vehiclePlate: vehicles[0].plate ?? "",
              stops: orders.map((o, i) => ({
                orderId: o.id,
                trackingId: o.trackingId,
                sequence: i + 1,
                address: o.address,
                latitude: String(o.latitude),
                longitude: String(o.longitude),
              })),
              totalDistance: 100,
              totalDuration: 300,
              totalServiceTime: 60,
              totalTravelTime: 240,
              totalWeight: 0,
              totalVolume: 0,
            },
          ]
        : [],
    unassigned: [],
    metrics: {
      totalDistance: 100,
      totalDuration: 300,
      totalRoutes: 1,
      totalStops: orders.length,
      computingTimeMs: 0,
      balanceScore: 0,
    },
    usedVroom: true,
  }),
}));

const { runOptimization } = await import(
  "@/lib/optimization/optimization-runner/run"
);

describe("optimization runner: route.zoneId is populated for real zones", () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(() => {
    // No shared state — each test creates its own company.
  });

  test(
    "order inside a zone polygon → route carries the zone id",
    async () => {
      const company = await createCompany({
        legalName: "Zone Test Co",
        commercialName: "Zone Test",
      });
      await createAdmin(company.id);
      const driver = await createDriver(company.id, {
        email: `d-${Date.now()}@t.co`,
      });
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "Z-01",
        // Inside the default test polygon [-77.05..-77.04, -12.05..-12.04]
        originLatitude: "-12.0464",
        originLongitude: "-77.0428",
      });

      const zone = await createZone({
        companyId: company.id,
        name: "Zona Norte",
        color: "#3b82f6",
      });
      await createZoneVehicle({
        companyId: company.id,
        zoneId: zone.id,
        vehicleId: vehicle.id,
      });

      // Order coordinates fall inside the zone polygon.
      await createOrder({
        companyId: company.id,
        trackingId: "ZONE-ORDER",
        latitude: "-12.0464",
        longitude: "-77.0428",
      });

      const config = await createOptimizationConfig({ companyId: company.id });

      const result = await runOptimization({
        configurationId: config.id,
        companyId: company.id,
        vehicleIds: [vehicle.id],
        driverIds: [driver.id],
      });

      expect(result.routes.length).toBeGreaterThan(0);
      expect(result.routes[0].zoneId).toBe(zone.id);
    },
    30000,
  );

  test(
    "no zones configured → route has no zoneId (no-zones path)",
    async () => {
      const company = await createCompany({
        legalName: "No Zone Co",
        commercialName: "No Zone",
      });
      await createAdmin(company.id);
      const driver = await createDriver(company.id, {
        email: `d-${Date.now()}@t.co`,
      });
      const vehicle = await createVehicle({
        companyId: company.id,
        plate: "NZ-01",
      });
      await createOrder({
        companyId: company.id,
        trackingId: "NO-ZONE-ORDER",
      });
      const config = await createOptimizationConfig({ companyId: company.id });

      const result = await runOptimization({
        configurationId: config.id,
        companyId: company.id,
        vehicleIds: [vehicle.id],
        driverIds: [driver.id],
      });

      expect(result.routes.length).toBeGreaterThan(0);
      expect(result.routes[0].zoneId).toBeUndefined();
    },
    30000,
  );
});
