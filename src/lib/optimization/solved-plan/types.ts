/**
 * Canonical Solved Plan — types for the optimizer output pipeline.
 *
 * Solver output flows through two parallel chains:
 *
 *   per-route:  RawSolvedRoute ──assignDriver──> AssignedSolvedRoute
 *   per-plan:   AggregatedPlan ──verify────────> VerifiedPlan
 *
 * Each stage is a distinct type so the type system enforces invariants
 * like "this route already has a driver" or "this plan was verified",
 * without runtime checks inside the pipeline.
 *
 * Runtime validation (Zod) is only at the 3 boundaries that cross trust
 * domains — see schemas.ts.
 *
 * Conventions:
 * - Distances in meters, durations in seconds, times of day as "HH:MM" strings.
 * - Latitude/longitude as numbers (DB stores them as varchar, parsers convert).
 * - Capacity used as a map keyed by dimension, not flat fields.
 *
 * See docs/CONTEXT.md → Plan Optimization → "Shapes canónicos del solver output".
 */

// ─── Capacity ──────────────────────────────────────────────────────────

export type CapacityDimension = "WEIGHT" | "VOLUME" | "VALUE" | "UNITS";

/**
 * Capacity used by a route or stop, keyed by dimension. Only dimensions
 * present in the company's `OptimizationProfile.activeDimensions` should
 * appear; unused dimensions are simply absent (not zero).
 */
export type CapacityUsage = Partial<Record<CapacityDimension, number>>;

// ─── Stop ──────────────────────────────────────────────────────────────

export interface SolvedStop {
  /** Order being delivered. Stops are 1-to-1 with orders unless grouped. */
  orderId: string;
  trackingId: string;
  /** 1-based position within the route. */
  sequence: number;
  address: string;
  /** WGS84 latitude. */
  latitude: number;
  /** WGS84 longitude. */
  longitude: number;
  /** Local-time HH:MM the driver is expected to arrive. */
  estimatedArrival?: string;
  /** Seconds the driver waits at the location before the time window opens. */
  waitingTimeSeconds?: number;
  /** Service window resolved from the order's preset or direct fields. */
  timeWindow?: {
    /** "HH:MM" */
    start: string;
    /** "HH:MM" */
    end: string;
  };
  /**
   * Capacity consumed by this stop, only the dimensions the company tracks.
   */
  capacityUsed: CapacityUsage;
  /**
   * When multiple orders share an exact (lat,lng) and the preset has
   * `groupSameLocation: true`, the route shows ONE stop and lists the
   * grouped orders here. Empty/undefined means a single-order stop.
   */
  groupedOrderIds?: string[];
  groupedTrackingIds?: string[];
}

// ─── Route (per-route chain) ───────────────────────────────────────────

/**
 * A route as it comes out of the solver and post-batch builder. No driver
 * has been assigned yet — driver assignment is a separate stage that
 * promotes this to AssignedSolvedRoute.
 */
export interface RawSolvedRoute {
  /** Solver-generated identifier, unique within the plan. */
  routeId: string;
  vehicleId: string;
  /** Plate or human-readable vehicle name. */
  vehicleIdentifier: string;
  /**
   * Zone the route was built within (zone-batched optimization). Undefined
   * means the route ran in the unzoned bucket — the stops won't carry zoneId
   * at persist time.
   */
  zoneId?: string;
  stops: SolvedStop[];
  /** Total distance traveled, meters. */
  totalDistance: number;
  /** Total wall-clock duration: travel + service + waiting, seconds. */
  totalDuration: number;
  /** Time spent at stops servicing customers, seconds. */
  totalServiceTime: number;
  /** Time spent driving between stops, seconds. */
  totalTravelTime: number;
  /** Aggregated capacity used across all stops in this route. */
  capacityUsed: CapacityUsage;
  /**
   * Capacity utilization, 0–100. Computed against the vehicle's primary
   * capacity dimension (typically WEIGHT, falls back to whatever the
   * company has configured).
   */
  utilizationPercentage: number;
  /** Count of stops that violate their time window. */
  timeWindowViolations: number;
  /** Encoded polyline geometry from VROOM/OSRM. Optional. */
  geometry?: string;
}

/**
 * A RawSolvedRoute that has been matched to a driver. The `driverId` and
 * `assignmentQuality` are required — there is no such thing as an
 * "assigned route without a driver."
 */
export interface AssignedSolvedRoute extends RawSolvedRoute {
  driverId: string;
  driverName: string;
  /**
   * Where the driver starts the day. Falls back to the vehicle's origin if
   * not set per-driver.
   */
  driverOrigin?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  assignmentQuality: {
    /** 0–100, higher is a better match. */
    score: number;
    warnings: string[];
    errors: string[];
  };
}

// ─── Plan-level (per-plan chain) ───────────────────────────────────────

export type OptimizationObjective = "DISTANCE" | "TIME" | "BALANCED";

export interface UnassignedOrderRecord {
  orderId: string;
  trackingId: string;
  /** Human-readable reason: "Outside RESTRICTED zone", "No vehicle has skill", etc. */
  reason: string;
  latitude?: number;
  longitude?: number;
  address?: string;
}

export interface DriverWithoutRoute {
  id: string;
  name: string;
  originLatitude?: number;
  originLongitude?: number;
}

export interface VehicleWithoutRoute {
  id: string;
  plate: string;
  originLatitude?: number;
  originLongitude?: number;
}

export interface PlanLevelMetrics {
  totalRoutes: number;
  totalStops: number;
  /** Sum of all routes' distance, meters. */
  totalDistance: number;
  /** Sum of all routes' duration, seconds. */
  totalDuration: number;
  /** Average utilization across routes, 0–100. */
  utilizationRate: number;
  /** Percentage of stops within their time window, 0–100. */
  timeWindowComplianceRate: number;
}

export interface AssignmentMetrics {
  totalAssignments: number;
  assignmentsWithWarnings: number;
  assignmentsWithErrors: number;
  /** Average score across all assignments, 0–100. */
  averageScore: number;
  /** 0–100 — fraction of stops whose required skills are covered. */
  skillCoverage: number;
  /** 0–100 — fraction of drivers with valid licenses for their vehicle. */
  licenseCompliance: number;
  /** 0–100 — fraction of drivers in their assigned fleet. */
  fleetAlignment: number;
  /** 0–100 — how evenly stops are distributed across drivers. */
  workloadBalance: number;
}

export interface PlanSummary {
  /** ISO 8601 — when the plan finished computing. */
  optimizedAt: string;
  objective: OptimizationObjective;
  processingTimeMs: number;
  /** Optimizer engine that ran. Currently always "VROOM". */
  engineUsed?: string;
}

/**
 * Full result of a completed (or partial) optimization run, BEFORE the
 * verifier has inspected it. Contains every route, the orders that
 * couldn't be assigned, drivers/vehicles left out, and aggregate metrics.
 */
export interface AggregatedPlan {
  routes: AssignedSolvedRoute[];
  unassignedOrders: UnassignedOrderRecord[];
  driversWithoutRoutes: DriverWithoutRoute[];
  vehiclesWithoutRoutes: VehicleWithoutRoute[];
  metrics: PlanLevelMetrics;
  assignmentMetrics: AssignmentMetrics;
  summary: PlanSummary;
  depot: {
    latitude: number;
    longitude: number;
  };
  /** Non-blocking warnings raised during the run (e.g. "fallback to NN"). */
  warnings?: string[];
  /**
   * Set when the OptimizationJob was aborted mid-execution. The plan is
   * still valid for inspection but should not be confirmed.
   */
  isPartial?: boolean;
}

// ─── Verifier output ───────────────────────────────────────────────────

export type ViolationSeverity = "HARD" | "SOFT" | "INFO";

export interface Violation {
  /** Stable code (e.g. "TIME_WINDOW_VIOLATION"). UI maps these to messages. */
  code: string;
  severity: ViolationSeverity;
  /** Human-readable summary for the violation. */
  message: string;
  vehicleId?: string;
  vehicleIdentifier?: string;
  orderId?: string;
  trackingId?: string;
  stopSequence?: number;
  expected?: string | number;
  actual?: string | number;
  /** Arbitrary debugging metadata (raw values, computed deltas, etc.). */
  context?: Record<string, unknown>;
}

export interface VerificationReport {
  /** Engine that produced the routes being verified. */
  optimizer: string;
  summary: {
    hard: number;
    soft: number;
    info: number;
    /** Count of violations grouped by code, for dashboards. */
    byCode: Record<string, number>;
  };
  totals: {
    ordersInput: number;
    ordersAssigned: number;
    ordersUnassigned: number;
    routes: number;
  };
  violations: Violation[];
}

/**
 * Final, verified output of an OptimizationJob. The presence of
 * `verification` is enforced by the type system — reach this state only
 * via the `verify()` stage.
 *
 * This is the shape persisted in `optimization_jobs.result` (JSONB) and
 * the shape consumed by the UI, the API, and downstream reporting.
 */
export interface VerifiedPlan extends AggregatedPlan {
  verification: VerificationReport;
}
