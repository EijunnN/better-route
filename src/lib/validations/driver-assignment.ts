import { z } from "zod";

/**
 * Driver assignment strategy options
 */
export const ASSIGNMENT_STRATEGIES = {
  BALANCED: "BALANCED",
  SKILLS_FIRST: "SKILLS_FIRST",
  AVAILABILITY: "AVAILABILITY",
  WORKLOAD: "WORKLOAD",
  FLEET_MATCH: "FLEET_MATCH",
} as const;

/**
 * Validation schema for assignment configuration
 */
export const driverAssignmentConfigSchema = z.object({
  strategy: z
    .enum([
      "BALANCED",
      "SKILLS_FIRST",
      "AVAILABILITY",
      "WORKLOAD",
      "FLEET_MATCH",
    ])
    .default("BALANCED"),
  requireLicenseValid: z.boolean().default(true),
  requireSkillsMatch: z.boolean().default(true),
  maxDaysLicenseNearExpiry: z.number().int().min(0).max(365).default(30),
  balanceWorkload: z.boolean().default(true),
});

export type DriverAssignmentConfigSchema = z.infer<
  typeof driverAssignmentConfigSchema
>;

/**
 * Validation schema for driver assignment request
 */
export const driverAssignmentRequestSchema = z.object({
  companyId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  routeStops: z
    .array(
      z.object({
        orderId: z.string().uuid(),
        promisedDate: z.coerce.date().optional(),
      }),
    )
    .min(1),
  candidateDriverIds: z.array(z.string().uuid()).min(1),
  assignedDrivers: z.record(z.string().uuid(), z.string().uuid()).optional(),
});

export type DriverAssignmentRequestSchema = z.infer<
  typeof driverAssignmentRequestSchema
>;

/**
 * Validation schema for bulk driver assignment (multiple routes)
 */
export const bulkDriverAssignmentRequestSchema = z.object({
  companyId: z.string().uuid(),
  configurationId: z.string().uuid(),
  config: driverAssignmentConfigSchema.optional(),
});

export type BulkDriverAssignmentRequestSchema = z.infer<
  typeof bulkDriverAssignmentRequestSchema
>;

/**
 * Validation schema for driver assignment validation
 */
export const validateDriverAssignmentSchema = z.object({
  companyId: z.string().uuid(),
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  routeStops: z.array(
    z.object({
      orderId: z.string().uuid(),
      promisedDate: z.coerce.date().optional(),
    }),
  ),
});

export type ValidateDriverAssignmentSchema = z.infer<
  typeof validateDriverAssignmentSchema
>;

/**
 * Validation schema for manual driver assignment override
 */
export const manualDriverAssignmentSchema = z.object({
  companyId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  routeId: z.string().uuid(),
  overrideWarnings: z.boolean().default(false),
  reason: z.string().optional(),
});

export type ManualDriverAssignmentSchema = z.infer<
  typeof manualDriverAssignmentSchema
>;

/**
 * Validation schema for removing driver assignment
 */
export const removeDriverAssignmentSchema = z.object({
  companyId: z.string().uuid(),
  routeId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  reason: z.string().optional(),
});

export type RemoveDriverAssignmentSchema = z.infer<
  typeof removeDriverAssignmentSchema
>;

/**
 * Validation schema for assignment quality metrics query
 */
export const assignmentQualityMetricsSchema = z.object({
  companyId: z.string().uuid(),
  assignmentIds: z.array(z.string().uuid()),
});

export type AssignmentQualityMetricsSchema = z.infer<
  typeof assignmentQualityMetricsSchema
>;

/**
 * Validation schema for available drivers query at time
 */
export const availableDriversAtTimeSchema = z.object({
  companyId: z.string().uuid(),
  driverIds: z.array(z.string().uuid()),
  dateTime: z.coerce.date(),
});

export type AvailableDriversAtTimeSchema = z.infer<
  typeof availableDriversAtTimeSchema
>;

/**
 * Validation schema for assignment suggestions
 */
export const assignmentSuggestionsSchema = z.object({
  companyId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  routeStops: z.array(
    z.object({
      orderId: z.string().uuid(),
      promisedDate: z.coerce.date().optional(),
    }),
  ),
  strategy: z
    .enum([
      "BALANCED",
      "SKILLS_FIRST",
      "AVAILABILITY",
      "WORKLOAD",
      "FLEET_MATCH",
    ])
    .optional()
    .default("BALANCED"),
  limit: z.number().int().min(1).max(20).default(5),
});

export type AssignmentSuggestionsSchema = z.infer<
  typeof assignmentSuggestionsSchema
>;
