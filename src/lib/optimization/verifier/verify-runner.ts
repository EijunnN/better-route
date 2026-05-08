/**
 * Single verification gate for an AggregatedPlan.
 *
 * The runner produces an `AggregatedPlan` (canonical shape from
 * `solved-plan`) plus the original orders/vehicles/config it ran with.
 * `verifyPlan` is the only place that:
 *   1. converts those into the verifier's `OptimizerOrder` /
 *      `OptimizerVehicle` / `OptimizerConfig` inputs (purely a
 *      normalisation: same data, slightly different shape),
 *   2. runs solver-level checks (`verify`),
 *   3. runs driver-assignment checks (`checkDriverAssignments`),
 *   4. merges violations into a single `VerificationReport`,
 *   5. returns a `VerifiedPlan` (plan + report).
 *
 * Pure function: no DB, no throws.
 */

import type {
  AggregatedPlan,
  VerificationReport,
  VerifiedPlan,
} from "../solved-plan";
import type {
  OptimizerOrder,
  OptimizerVehicle,
  OptimizerConfig,
} from "./input-types";
import { verify } from "./verify";
import { checkDriverAssignments } from "./check-assignments";

/**
 * Shape of the DB-derived order the verifier needs. Matches the subset of
 * fields on drizzle's `orders` table that the verifier cares about, plus
 * the time-window-preset values resolved by the runner.
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

/** Shape of DB vehicle the verifier cares about. */
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
  depot: {
    latitude: number;
    longitude: number;
    timeWindowStart?: string | null;
    timeWindowEnd?: string | null;
  };
  objective: "DISTANCE" | "TIME" | "BALANCED";
  maxDistanceKm?: number | null;
  maxTravelTimeMinutes?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────

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
    originLatitude:
      v.originLatitude !== null && v.originLatitude !== undefined
        ? num(v.originLatitude)
        : undefined,
    originLongitude:
      v.originLongitude !== null && v.originLongitude !== undefined
        ? num(v.originLongitude)
        : undefined,
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

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Verify an aggregated plan against its inputs and produce a verified plan.
 * The returned plan carries a mandatory `verification: VerificationReport`.
 */
export function verifyPlan(args: {
  plan: AggregatedPlan;
  orders: RunnerOrderInput[];
  vehicles: RunnerVehicleInput[];
  config: RunnerConfigInput;
}): VerifiedPlan {
  const verifierOrders = args.orders.map(toOptimizerOrder);
  const verifierVehicles = args.vehicles.map(toOptimizerVehicle);
  const verifierConfig = toOptimizerConfig(args.config);

  // Solver-level violations (time windows, capacity, skills, etc.) — read
  // the canonical AggregatedPlan directly. No more adapter-shape conversion.
  const base = verify({
    orders: verifierOrders,
    vehicles: verifierVehicles,
    config: verifierConfig,
    plan: args.plan,
  });

  // Driver-assignment violations (lifted from per-route assignmentQuality).
  const assignmentViolations = checkDriverAssignments(
    args.plan.routes.map((r) => ({
      vehicleId: r.vehicleId,
      vehicleIdentifier: r.vehicleIdentifier,
      driverId: r.driverId,
      driverName: r.driverName,
      stopCount: r.stops.length,
      assignmentQuality: r.assignmentQuality,
    })),
  );

  const violations = [...base.violations, ...assignmentViolations];
  const summary = {
    hard: 0,
    soft: 0,
    info: 0,
    byCode: {} as Record<string, number>,
  };
  for (const v of violations) {
    if (v.severity === "HARD") summary.hard++;
    else if (v.severity === "SOFT") summary.soft++;
    else summary.info++;
    summary.byCode[v.code] = (summary.byCode[v.code] ?? 0) + 1;
  }

  const verification: VerificationReport = {
    optimizer: base.optimizer,
    violations,
    summary,
    totals: base.totals,
  };

  return { ...args.plan, verification };
}
