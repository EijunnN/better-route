/**
 * Bridge between the runner's internal types and the verifier.
 *
 * The runner collects orders/vehicles from DB and produces a rich
 * OptimizationResult shape with stops, unassignedOrders, etc. The verifier
 * operates on the adapter contract (OptimizerOrder / OptimizerVehicle /
 * OptimizerConfig + adapter-style OptimizationResult).
 *
 * This module converts the runner-level artifacts into adapter shapes and
 * runs the verifier. No DB access — pure transformation.
 */

import type {
  OptimizationResult as RunnerResult,
  OptimizationRoute as RunnerRoute,
  OptimizationStop as RunnerStop,
} from "../optimization-runner/types";
import type {
  OptimizerOrder,
  OptimizerVehicle,
  OptimizerConfig,
  OptimizationResult,
  OptimizedRoute,
  OptimizedStop,
} from "../optimizer-interface";
import { verify } from "./verify";
import type { VerifierReport } from "./types";
import { hhmmToSeconds } from "./utils";
import { checkDriverAssignments } from "./check-assignments";

/**
 * Shape of the DB-derived order we need. Matches the subset of fields on
 * drizzle's `orders` table that the verifier cares about, plus the
 * time-window-preset values resolved by the runner.
 */
export interface RunnerOrderInput {
  id: string;
  trackingId: string;
  address: string;
  latitude: string | number;
  longitude: string | number;
  weightRequired?: number | null;
  volumeRequired?: number | null;
  orderValue?: number | null;
  unitsRequired?: number | null;
  orderType?: "NEW" | "RESCHEDULED" | "URGENT" | null;
  priority?: number | null;
  /** Already resolved from preset or direct fields. HH:MM or null. */
  timeWindowStart?: string | null;
  timeWindowEnd?: string | null;
  serviceTime?: number;
  skillsRequired?: string[];
  zoneId?: string | null;
}

/**
 * Shape of DB vehicle the verifier cares about.
 */
export interface RunnerVehicleInput {
  id: string;
  plate: string;
  maxWeight?: number | null;
  maxVolume?: number | null;
  maxValueCapacity?: number | null;
  maxUnitsCapacity?: number | null;
  maxOrders?: number | null;
  originLatitude?: string | number | null;
  originLongitude?: string | number | null;
  skills?: string[];
  /** Workday start/end as HH:MM. */
  workdayStart?: string | null;
  workdayEnd?: string | null;
  hasBreakTime?: boolean | null;
  breakDuration?: number | null;
  breakTimeStart?: string | null;
  breakTimeEnd?: string | null;
}

export interface RunnerConfigInput {
  depot: { latitude: number; longitude: number; timeWindowStart?: string | null; timeWindowEnd?: string | null };
  objective: "DISTANCE" | "TIME" | "BALANCED";
  maxDistanceKm?: number | null;
  maxTravelTimeMinutes?: number | null;
}

function num(x: string | number | null | undefined, fallback = 0): number {
  if (x === null || x === undefined) return fallback;
  const n = typeof x === "string" ? Number.parseFloat(x) : x;
  return Number.isFinite(n) ? n : fallback;
}

function toOptimizerOrder(o: RunnerOrderInput): OptimizerOrder {
  return {
    id: o.id,
    trackingId: o.trackingId,
    address: o.address,
    latitude: num(o.latitude),
    longitude: num(o.longitude),
    weightRequired: num(o.weightRequired),
    volumeRequired: num(o.volumeRequired),
    orderValue: o.orderValue ?? undefined,
    unitsRequired: o.unitsRequired ?? undefined,
    orderType: o.orderType ?? undefined,
    priority: o.priority ?? undefined,
    timeWindowStart: o.timeWindowStart ?? undefined,
    timeWindowEnd: o.timeWindowEnd ?? undefined,
    serviceTime: o.serviceTime ?? 300,
    skillsRequired: o.skillsRequired ?? [],
    zoneId: o.zoneId ?? undefined,
  };
}

function toOptimizerVehicle(v: RunnerVehicleInput): OptimizerVehicle {
  return {
    id: v.id,
    identifier: v.plate,
    maxWeight: num(v.maxWeight),
    maxVolume: num(v.maxVolume),
    maxValueCapacity: v.maxValueCapacity ?? undefined,
    maxUnitsCapacity: v.maxUnitsCapacity ?? undefined,
    maxOrders: v.maxOrders ?? undefined,
    originLatitude: v.originLatitude !== null && v.originLatitude !== undefined ? num(v.originLatitude) : undefined,
    originLongitude: v.originLongitude !== null && v.originLongitude !== undefined ? num(v.originLongitude) : undefined,
    skills: v.skills ?? [],
    timeWindowStart: v.workdayStart ?? undefined,
    timeWindowEnd: v.workdayEnd ?? undefined,
    hasBreakTime: v.hasBreakTime ?? undefined,
    breakDuration: v.breakDuration ?? undefined,
    breakTimeStart: v.breakTimeStart ?? undefined,
    breakTimeEnd: v.breakTimeEnd ?? undefined,
  };
}

function toOptimizerConfig(c: RunnerConfigInput): OptimizerConfig {
  return {
    depot: {
      latitude: c.depot.latitude,
      longitude: c.depot.longitude,
      timeWindowStart: c.depot.timeWindowStart ?? undefined,
      timeWindowEnd: c.depot.timeWindowEnd ?? undefined,
    },
    objective: c.objective,
    maxDistanceKm: c.maxDistanceKm ?? undefined,
    maxTravelTimeMinutes: c.maxTravelTimeMinutes ?? undefined,
  };
}

function parseHhmmsToSeconds(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  // Accept "HH:MM" directly
  if (/^\d{1,2}:\d{2}/.test(iso)) {
    const v = hhmmToSeconds(iso);
    return v ?? undefined;
  }
  return undefined;
}

function toOptimizerStop(s: RunnerStop): OptimizedStop {
  return {
    orderId: s.orderId,
    trackingId: s.trackingId,
    address: s.address,
    latitude: num(s.latitude),
    longitude: num(s.longitude),
    sequence: s.sequence,
    arrivalTime: parseHhmmsToSeconds(s.estimatedArrival),
    serviceTime: undefined,
    waitingTime: s.waitingTimeMinutes !== undefined ? s.waitingTimeMinutes * 60 : undefined,
  };
}

function toOptimizerRoute(r: RunnerRoute): OptimizedRoute {
  return {
    vehicleId: r.vehicleId,
    vehicleIdentifier: r.vehiclePlate,
    stops: r.stops.map(toOptimizerStop),
    totalDistance: r.totalDistance,
    totalDuration: r.totalDuration,
    totalServiceTime: r.totalServiceTime,
    totalTravelTime: r.totalTravelTime,
    totalWeight: r.totalWeight,
    totalVolume: r.totalVolume,
    geometry: r.geometry,
  };
}

function toOptimizerResult(result: RunnerResult, optimizer: string): OptimizationResult {
  return {
    routes: result.routes.map(toOptimizerRoute),
    unassigned: result.unassignedOrders.map((u) => ({
      orderId: u.orderId,
      trackingId: u.trackingId,
      reason: u.reason,
    })),
    metrics: {
      totalDistance: result.metrics.totalDistance,
      totalDuration: result.metrics.totalDuration,
      totalRoutes: result.metrics.totalRoutes,
      totalStops: result.metrics.totalStops,
      computingTimeMs: result.summary.processingTimeMs,
    },
    optimizer,
  };
}

/**
 * Verify a runner-shape optimization output against the runner-shape input.
 * Pure function: no DB, no throws.
 */
export function verifyRunnerResult(args: {
  orders: RunnerOrderInput[];
  vehicles: RunnerVehicleInput[];
  config: RunnerConfigInput;
  result: RunnerResult;
}): VerifierReport {
  const adapterOrders = args.orders.map(toOptimizerOrder);
  const adapterVehicles = args.vehicles.map(toOptimizerVehicle);
  const adapterConfig = toOptimizerConfig(args.config);
  const adapterResult = toOptimizerResult(args.result, args.result.summary.engineUsed || "UNKNOWN");

  // Solver-level verification (time windows, capacity, skills, etc.).
  const base = verify({
    orders: adapterOrders,
    vehicles: adapterVehicles,
    config: adapterConfig,
    result: adapterResult,
  });

  // Driver-assignment layer: hoist per-route assignmentQuality errors/warnings
  // (produced by assignDriversToRoutes + validateDriverAssignment in the
  // runner) into the same Violation[] feed so the UI + CI treat them uniformly.
  const assignmentViolations = checkDriverAssignments(
    args.result.routes.map((r) => ({
      vehicleId: r.vehicleId,
      vehicleIdentifier: r.vehiclePlate,
      driverId: r.driverId,
      driverName: r.driverName,
      stopCount: r.stops.length,
      assignmentQuality: r.assignmentQuality,
    })),
  );

  const violations = [...base.violations, ...assignmentViolations];
  const summary = { hard: 0, soft: 0, info: 0, byCode: {} as Record<string, number> };
  for (const v of violations) {
    if (v.severity === "HARD") summary.hard++;
    else if (v.severity === "SOFT") summary.soft++;
    else summary.info++;
    summary.byCode[v.code] = (summary.byCode[v.code] ?? 0) + 1;
  }

  return {
    optimizer: base.optimizer,
    violations,
    summary,
    totals: base.totals,
  };
}
