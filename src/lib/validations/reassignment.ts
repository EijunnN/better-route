import { z } from "zod";

/**
 * Reassignment strategy options
 */
export const REASSIGNMENT_STRATEGY = {
  SAME_FLEET: "SAME_FLEET", // Only consider drivers from same fleet
  ANY_FLEET: "ANY_FLEET", // Consider any available driver
  BALANCED_WORKLOAD: "BALANCED_WORKLOAD", // Distribute stops to minimize workload impact
  CONSOLIDATE: "CONSOLIDATE", // Assign all stops to single driver if possible
} as const;

/**
 * Validation schema for reassignment request
 */
export const reassignmentRequestSchema = z.object({
  companyId: z.string().uuid(),
  absentDriverId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  strategy: z
    .enum(["SAME_FLEET", "ANY_FLEET", "BALANCED_WORKLOAD", "CONSOLIDATE"])
    .default("SAME_FLEET"),
  reason: z.string().optional(),
});

export type ReassignmentRequestSchema = z.infer<
  typeof reassignmentRequestSchema
>;

/**
 * Validation schema for calculating reassignment impact
 */
export const reassignmentImpactRequestSchema = z.object({
  companyId: z.string().uuid(),
  absentDriverId: z.string().uuid(),
  replacementDriverId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
});

export type ReassignmentImpactRequestSchema = z.infer<
  typeof reassignmentImpactRequestSchema
>;

/**
 * Validation schema for executing reassignment
 */
export const executeReassignmentSchema = z.object({
  companyId: z.string().uuid(),
  absentDriverId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  reassignments: z.array(
    z.object({
      routeId: z.string(),
      vehicleId: z.string().uuid(),
      fromDriverId: z.string().uuid(),
      toDriverId: z.string().uuid(),
      stopIds: z.array(z.string().uuid()).min(1),
    }),
  ),
  reason: z.string().optional(),
  userId: z.string().uuid(),
});

export type ExecuteReassignmentSchema = z.infer<
  typeof executeReassignmentSchema
>;

/**
 * Validation schema for querying reassignment history
 */
export const reassignmentHistoryQuerySchema = z.object({
  companyId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export type ReassignmentHistoryQuerySchema = z.infer<
  typeof reassignmentHistoryQuerySchema
>;

/**
 * Validation schema for available replacement drivers query
 */
export const availableReplacementsSchema = z.object({
  companyId: z.string().uuid(),
  absentDriverId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  strategy: z
    .enum(["SAME_FLEET", "ANY_FLEET", "BALANCED_WORKLOAD", "CONSOLIDATE"])
    .default("SAME_FLEET"),
  limit: z.number().int().min(1).max(20).default(10),
});

export type AvailableReplacementsSchema = z.infer<
  typeof availableReplacementsSchema
>;
