/**
 * Zod schemas for the Solved Plan boundaries.
 *
 * These run at the 3 trust-domain crossings — nowhere else:
 *   1. Solver output → RawSolvedRoute       (rawSolvedRouteSchema)
 *   2. VerifiedPlan  → DB persist (JSONB)   (verifiedPlanSchema)
 *   3. DB JSONB      → VerifiedPlan         (verifiedPlanSchema)
 *
 * Inside the runner pipeline the types alone are the contract.
 *
 * Schemas are written as `z.ZodType<X>` so TypeScript fails the build if
 * a schema drifts from its TS interface.
 */

import { z } from "zod";
import type {
  AggregatedPlan,
  AssignedSolvedRoute,
  AssignmentMetrics,
  CapacityUsage,
  DriverWithoutRoute,
  PlanLevelMetrics,
  PlanSummary,
  RawSolvedRoute,
  SolvedStop,
  UnassignedOrderRecord,
  VehicleWithoutRoute,
  VerificationReport,
  VerifiedPlan,
  Violation,
} from "./types";

// ─── Building blocks ───────────────────────────────────────────────────

const capacityUsageSchema: z.ZodType<CapacityUsage> = z.object({
  WEIGHT: z.number().nonnegative().optional(),
  VOLUME: z.number().nonnegative().optional(),
  VALUE: z.number().nonnegative().optional(),
  UNITS: z.number().nonnegative().optional(),
});

const hhmm = z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/, {
  message: "Expected HH:MM or HH:MM:SS",
});

const solvedStopSchema: z.ZodType<SolvedStop> = z.object({
  orderId: z.string().min(1),
  trackingId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  estimatedArrival: hhmm.optional(),
  waitingTimeSeconds: z.number().nonnegative().optional(),
  timeWindow: z
    .object({
      start: hhmm,
      end: hhmm,
    })
    .optional(),
  capacityUsed: capacityUsageSchema,
  groupedOrderIds: z.array(z.string()).optional(),
  groupedTrackingIds: z.array(z.string()).optional(),
});

// ─── Per-route ─────────────────────────────────────────────────────────

export const rawSolvedRouteSchema: z.ZodType<RawSolvedRoute> = z.object({
  routeId: z.string().min(1),
  vehicleId: z.string().min(1),
  vehicleIdentifier: z.string().min(1),
  zoneId: z.string().optional(),
  stops: z.array(solvedStopSchema),
  totalDistance: z.number().nonnegative(),
  totalDuration: z.number().nonnegative(),
  totalServiceTime: z.number().nonnegative(),
  totalTravelTime: z.number().nonnegative(),
  capacityUsed: capacityUsageSchema,
  utilizationPercentage: z.number().min(0).max(100),
  timeWindowViolations: z.number().int().nonnegative(),
  geometry: z.string().optional(),
});

const assignedSolvedRouteSchema: z.ZodType<AssignedSolvedRoute> = z.object({
  // Inlined RawSolvedRoute fields — ZodType<extends> can be flaky with .merge().
  routeId: z.string().min(1),
  vehicleId: z.string().min(1),
  vehicleIdentifier: z.string().min(1),
  zoneId: z.string().optional(),
  stops: z.array(solvedStopSchema),
  totalDistance: z.number().nonnegative(),
  totalDuration: z.number().nonnegative(),
  totalServiceTime: z.number().nonnegative(),
  totalTravelTime: z.number().nonnegative(),
  capacityUsed: capacityUsageSchema,
  utilizationPercentage: z.number().min(0).max(100),
  timeWindowViolations: z.number().int().nonnegative(),
  geometry: z.string().optional(),
  // Driver-assignment additions.
  driverId: z.string().min(1),
  driverName: z.string().min(1),
  driverOrigin: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      address: z.string().optional(),
    })
    .optional(),
  assignmentQuality: z.object({
    score: z.number().min(0).max(100),
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
  }),
});

// ─── Plan-level building blocks ────────────────────────────────────────

const unassignedOrderSchema: z.ZodType<UnassignedOrderRecord> = z.object({
  orderId: z.string().min(1),
  trackingId: z.string().min(1),
  reason: z.string(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  address: z.string().optional(),
});

const driverWithoutRouteSchema: z.ZodType<DriverWithoutRoute> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  originLatitude: z.number().optional(),
  originLongitude: z.number().optional(),
});

const vehicleWithoutRouteSchema: z.ZodType<VehicleWithoutRoute> = z.object({
  id: z.string().min(1),
  plate: z.string().min(1),
  originLatitude: z.number().optional(),
  originLongitude: z.number().optional(),
});

const planLevelMetricsSchema: z.ZodType<PlanLevelMetrics> = z.object({
  totalRoutes: z.number().int().nonnegative(),
  totalStops: z.number().int().nonnegative(),
  totalDistance: z.number().nonnegative(),
  totalDuration: z.number().nonnegative(),
  utilizationRate: z.number().min(0).max(100),
  timeWindowComplianceRate: z.number().min(0).max(100),
});

const assignmentMetricsSchema: z.ZodType<AssignmentMetrics> = z.object({
  totalAssignments: z.number().int().nonnegative(),
  assignmentsWithWarnings: z.number().int().nonnegative(),
  assignmentsWithErrors: z.number().int().nonnegative(),
  averageScore: z.number().min(0).max(100),
  skillCoverage: z.number().min(0).max(100),
  licenseCompliance: z.number().min(0).max(100),
  fleetAlignment: z.number().min(0).max(100),
  workloadBalance: z.number().min(0).max(100),
});

const planSummarySchema: z.ZodType<PlanSummary> = z.object({
  optimizedAt: z.string().min(1),
  objective: z.enum(["DISTANCE", "TIME", "BALANCED"]),
  processingTimeMs: z.number().nonnegative(),
  engineUsed: z.string().optional(),
});

const aggregatedPlanSchema: z.ZodType<AggregatedPlan> = z.object({
  routes: z.array(assignedSolvedRouteSchema),
  unassignedOrders: z.array(unassignedOrderSchema),
  driversWithoutRoutes: z.array(driverWithoutRouteSchema),
  vehiclesWithoutRoutes: z.array(vehicleWithoutRouteSchema),
  metrics: planLevelMetricsSchema,
  assignmentMetrics: assignmentMetricsSchema,
  summary: planSummarySchema,
  depot: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  warnings: z.array(z.string()).optional(),
  isPartial: z.boolean().optional(),
});

// ─── Verifier output ───────────────────────────────────────────────────

const violationSchema: z.ZodType<Violation> = z.object({
  code: z.string().min(1),
  severity: z.enum(["HARD", "SOFT", "INFO"]),
  message: z.string(),
  vehicleId: z.string().optional(),
  vehicleIdentifier: z.string().optional(),
  orderId: z.string().optional(),
  trackingId: z.string().optional(),
  stopSequence: z.number().int().nonnegative().optional(),
  expected: z.union([z.string(), z.number()]).optional(),
  actual: z.union([z.string(), z.number()]).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

const verificationReportSchema: z.ZodType<VerificationReport> = z.object({
  optimizer: z.string().min(1),
  summary: z.object({
    hard: z.number().int().nonnegative(),
    soft: z.number().int().nonnegative(),
    info: z.number().int().nonnegative(),
    byCode: z.record(z.string(), z.number().int().nonnegative()),
  }),
  totals: z.object({
    ordersInput: z.number().int().nonnegative(),
    ordersAssigned: z.number().int().nonnegative(),
    ordersUnassigned: z.number().int().nonnegative(),
    routes: z.number().int().nonnegative(),
  }),
  violations: z.array(violationSchema),
});

export const verifiedPlanSchema: z.ZodType<VerifiedPlan> = z.object({
  // Inlined AggregatedPlan fields.
  routes: z.array(assignedSolvedRouteSchema),
  unassignedOrders: z.array(unassignedOrderSchema),
  driversWithoutRoutes: z.array(driverWithoutRouteSchema),
  vehiclesWithoutRoutes: z.array(vehicleWithoutRouteSchema),
  metrics: planLevelMetricsSchema,
  assignmentMetrics: assignmentMetricsSchema,
  summary: planSummarySchema,
  depot: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  warnings: z.array(z.string()).optional(),
  isPartial: z.boolean().optional(),
  // Verification — non-optional by type.
  verification: verificationReportSchema,
});

// ─── Boundary parsers ──────────────────────────────────────────────────

/**
 * Parse the output of the solver/zone-batch builder into a RawSolvedRoute.
 * Throws ZodError with field-level detail on shape mismatch.
 *
 * Use this once per route at the seam between the solver and the runner.
 */
export function parseRawSolvedRoute(input: unknown): RawSolvedRoute {
  return rawSolvedRouteSchema.parse(input);
}

/**
 * Parse a VerifiedPlan from raw JSONB read out of `optimization_jobs.result`.
 * Use when reading a persisted plan back from the DB.
 */
export function parseVerifiedPlan(input: unknown): VerifiedPlan {
  return verifiedPlanSchema.parse(input);
}

/**
 * Validate a VerifiedPlan before persisting it to JSONB. Returns the plan
 * unchanged on success; throws ZodError on shape mismatch. Catches drift
 * before bad data lands in the DB.
 */
export function assertPersistableVerifiedPlan(plan: VerifiedPlan): VerifiedPlan {
  return verifiedPlanSchema.parse(plan);
}

// Aggregate exports kept minimal — the schemas above are the public surface.
export {
  aggregatedPlanSchema,
  assignedSolvedRouteSchema,
  capacityUsageSchema,
  solvedStopSchema,
  verificationReportSchema,
};
