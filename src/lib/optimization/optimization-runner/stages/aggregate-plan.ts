/**
 * Stage 5 — Aggregate: take the assigned routes and build the AggregatedPlan
 * the verifier consumes. Computes plan-level metrics (utilization rate, time
 * window compliance, etc.), driver/vehicle assignment metrics, and the lists
 * of drivers/vehicles that didn't end up with a route.
 *
 * Almost pure: the only external call is `getAssignmentQualityMetrics`,
 * which aggregates per-route assignment scores.
 */

import {
  type DriverAssignmentResult,
  getAssignmentQualityMetrics,
} from "../../../routing/driver-assignment";
import type {
  AggregatedPlan,
  AssignedSolvedRoute,
  UnassignedOrderRecord,
} from "../../solved-plan";

export interface AggregatePlanArgs {
  routes: AssignedSolvedRoute[];
  unassignedOrders: UnassignedOrderRecord[];
  selectedDrivers: Array<{ id: string; name: string }>;
  /**
   * Origin coordinates of vehicles each driver is assigned to (used to
   * place "drivers without routes" markers on the map).
   */
  driverVehicleOriginMap: Map<string, { latitude: string; longitude: string }>;
  /**
   * Vehicles considered for the run, with their origin (used for "vehicles
   * without routes" lists).
   */
  vehiclesForFallback: Array<{
    id: string;
    plate: string;
    originLatitude?: string | null;
    originLongitude?: string | null;
  }>;
  warnings: string[];
  startTime: number;
  engineUsed: string;
  objective: "DISTANCE" | "TIME" | "BALANCED";
  depot: { latitude: number; longitude: number };
}

export async function aggregatePlan(
  args: AggregatePlanArgs,
): Promise<AggregatedPlan> {
  const { routes, unassignedOrders } = args;

  // Plan-level totals
  const totalDistance = routes.reduce((sum, r) => sum + r.totalDistance, 0);
  const totalDuration = routes.reduce((sum, r) => sum + r.totalDuration, 0);
  const totalStops = routes.reduce((sum, r) => sum + r.stops.length, 0);
  const timeWindowViolations = routes.reduce(
    (sum, r) => sum + r.timeWindowViolations,
    0,
  );
  const utilizationRate =
    routes.length > 0
      ? routes.reduce((sum, r) => sum + r.utilizationPercentage, 0) /
        routes.length
      : 0;
  const timeWindowComplianceRate =
    totalStops > 0
      ? ((totalStops - timeWindowViolations) / totalStops) * 100
      : 100;

  // AssignedSolvedRoute guarantees driverId/driverName/assignmentQuality
  // are present, so no filter needed.
  const assignmentResults: DriverAssignmentResult[] = routes.map((r) => ({
    driverId: r.driverId,
    driverName: r.driverName,
    score: {
      driverId: r.driverId,
      score: r.assignmentQuality.score,
      factors: {
        skillsMatch: 100, // Placeholder - not tracked per route
        availability: 100,
        licenseValid: 100,
        fleetMatch: 100,
        workload: 100,
      },
      warnings: r.assignmentQuality.warnings,
      errors: r.assignmentQuality.errors,
    },
    isManualOverride: false,
  }));
  const assignmentMetrics =
    await getAssignmentQualityMetrics(assignmentResults);

  // Drivers and vehicles that didn't end up on a route
  const assignedDriverIds = new Set(routes.map((r) => r.driverId));
  const driversWithoutRoutes: Array<{
    id: string;
    name: string;
    originLatitude: number | undefined;
    originLongitude: number | undefined;
  }> = [];
  for (const d of args.selectedDrivers) {
    if (assignedDriverIds.has(d.id)) continue;
    const origin = args.driverVehicleOriginMap.get(d.id);
    driversWithoutRoutes.push({
      id: d.id,
      name: d.name,
      originLatitude: origin?.latitude ? parseFloat(origin.latitude) : undefined,
      originLongitude: origin?.longitude
        ? parseFloat(origin.longitude)
        : undefined,
    });
  }

  const assignedVehicleIds = new Set(routes.map((r) => r.vehicleId));
  const vehiclesWithoutRoutes: Array<{
    id: string;
    plate: string;
    originLatitude: number | undefined;
    originLongitude: number | undefined;
  }> = [];
  for (const v of args.vehiclesForFallback) {
    if (assignedVehicleIds.has(v.id)) continue;
    vehiclesWithoutRoutes.push({
      id: v.id,
      plate: v.plate,
      originLatitude: v.originLatitude
        ? parseFloat(v.originLatitude)
        : undefined,
      originLongitude: v.originLongitude
        ? parseFloat(v.originLongitude)
        : undefined,
    });
  }

  return {
    routes,
    unassignedOrders,
    driversWithoutRoutes,
    vehiclesWithoutRoutes,
    metrics: {
      totalDistance,
      totalDuration,
      totalRoutes: routes.length,
      totalStops,
      utilizationRate: Math.round(utilizationRate),
      timeWindowComplianceRate: Math.round(timeWindowComplianceRate),
    },
    assignmentMetrics,
    warnings: args.warnings.length > 0 ? args.warnings : undefined,
    summary: {
      optimizedAt: new Date().toISOString(),
      objective: args.objective,
      processingTimeMs: Date.now() - args.startTime,
      engineUsed: args.engineUsed,
    },
    depot: args.depot,
  };
}
