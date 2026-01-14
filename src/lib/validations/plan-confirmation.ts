import { z } from "zod";

/**
 * Validation schema for plan confirmation request
 */
export const planConfirmationSchema = z.object({
  companyId: z.string().uuid(),
  jobId: z.string().uuid(),
  overrideWarnings: z.boolean().default(false),
  confirmationNote: z.string().optional(),
});

export type PlanConfirmationSchema = z.infer<typeof planConfirmationSchema>;

/**
 * Validation schema for plan validation request
 */
export const planValidationRequestSchema = z.object({
  companyId: z.string().uuid(),
  jobId: z.string().uuid(),
  config: z
    .object({
      requireAllDriversAssigned: z.boolean().default(true),
      requireMinimumAssignmentQuality: z.number().min(0).max(100).default(50),
      requireMinimumTimeWindowCompliance: z
        .number()
        .min(0)
        .max(100)
        .default(80),
      allowUnassignedOrdersOverride: z.boolean().default(false),
      checkLicenseExpiry: z.boolean().default(true),
      licenseExpiryWarningDays: z.number().int().min(0).max(365).default(30),
      checkSkillExpiry: z.boolean().default(true),
      skillExpiryWarningDays: z.number().int().min(0).max(365).default(30),
    })
    .optional(),
});

export type PlanValidationRequestSchema = z.infer<
  typeof planValidationRequestSchema
>;

/**
 * Validation schema for plan confirmation status check
 */
export const planConfirmationStatusSchema = z.object({
  jobId: z.string().uuid(),
});

export type PlanConfirmationStatusSchema = z.infer<
  typeof planConfirmationStatusSchema
>;

/**
 * Plan confirmation status response
 */
export const planConfirmationStatusResponseSchema = z.object({
  jobId: z.string().uuid(),
  isConfirmed: z.boolean(),
  confirmedAt: z.coerce.date().nullable(),
  confirmedBy: z.string().uuid().nullable(),
  configurationId: z.string().uuid(),
});

export type PlanConfirmationStatusResponseSchema = z.infer<
  typeof planConfirmationStatusResponseSchema
>;
