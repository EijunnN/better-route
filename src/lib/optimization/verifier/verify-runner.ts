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

import type { ProfileSchema } from "@/lib/orders/profile-schema";
import { DEFAULT_SERVICE_TIME_SECONDS } from "../constants";
import type {
  AggregatedPlan,
  VerificationReport,
  VerifiedPlan,
} from "../solved-plan";
import { checkDriverAssignments } from "./check-assignments";
import type {
  OptimizerConfig,
  OptimizerOrder,
  OptimizerVehicle,
} from "./input-types";
import { verify } from "./verify";

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
  /**
   * MUST mirror the solver's setting: when true the solver widened order
   * windows ±30 min, so the verifier widens by the same tolerance. Omitting
   * it produced false HARD TIME_WINDOW_VIOLATED on valid plans (A1).
   */
  flexibleTimeWindows?: boolean | null;
  /**
   * Company profile the solver ran with. checkCapacity only treats the
   * profile's active dimensions as HARD; inactive ones degrade to INFO (A3).
   */
  profile?: ProfileSchema | null;
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
    serviceTime: o.serviceTime ?? DEFAULT_SERVICE_TIME_SECONDS,
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
    flexibleTimeWindows: c.flexibleTimeWindows ?? undefined,
    profile: c.profile ?? undefined,
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

  // Make the time-window metrics honest: the solve stage hardcodes
  // `timeWindowViolations: 0` per route (it has no verdict yet — SEMANTICS
  // §2), so the aggregated compliance rate was always 100%. Recompute both
  // from the verifier's actual findings, attributing each violated stop to
  // its route via orderId.
  const orderIdToRouteIndex = new Map<string, number>();
  args.plan.routes.forEach((route, index) => {
    for (const stop of route.stops) {
      orderIdToRouteIndex.set(stop.orderId, index);
    }
  });
  const violationsPerRoute = new Array(args.plan.routes.length).fill(0);
  const violatedOrderIds = new Set<string>();
  for (const v of violations) {
    if (v.code !== "TIME_WINDOW_VIOLATED" || !v.orderId) continue;
    if (violatedOrderIds.has(v.orderId)) continue; // one stop = one violation
    violatedOrderIds.add(v.orderId);
    const routeIndex = orderIdToRouteIndex.get(v.orderId);
    if (routeIndex !== undefined) violationsPerRoute[routeIndex]++;
  }
  const routes = args.plan.routes.map((route, index) =>
    violationsPerRoute[index] > 0
      ? { ...route, timeWindowViolations: violationsPerRoute[index] }
      : route,
  );
  const totalStops = args.plan.metrics.totalStops;
  const timeWindowComplianceRate =
    totalStops > 0
      ? Math.max(
          0,
          Math.round(((totalStops - violatedOrderIds.size) / totalStops) * 100),
        )
      : 100;

  return {
    ...args.plan,
    routes,
    metrics: { ...args.plan.metrics, timeWindowComplianceRate },
    verification,
  };
}
