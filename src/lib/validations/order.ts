import { z } from "zod";

export const ORDER_STATUS = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export const TIME_WINDOW_STRICTNESS = ["HARD", "SOFT"] as const;

// Base schema fields
const baseOrderSchema = {
  trackingId: z
    .string()
    .min(1, "Tracking ID is required")
    .max(50, "Tracking ID too long"),
  customerName: z.string().max(255, "Customer name too long").optional(),
  customerPhone: z.string().max(50, "Phone number too long").optional(),
  customerEmail: z
    .string()
    .email("Invalid email format")
    .optional()
    .or(z.literal("")),
  address: z.string().min(1, "Address is required"),
  latitude: z
    .string()
    .regex(/^-?\d+\.?\d*$/, "Invalid latitude format")
    .min(1, "Latitude is required"),
  longitude: z
    .string()
    .regex(/^-?\d+\.?\d*$/, "Invalid longitude format")
    .min(1, "Longitude is required"),
  timeWindowPresetId: z
    .string()
    .uuid("Invalid time window preset ID")
    .optional()
    .or(z.literal("")),
  strictness: z
    .enum(TIME_WINDOW_STRICTNESS, {
      message: "Strictness must be HARD or SOFT",
    })
    .nullable()
    .optional(), // null means inherit from preset
  promisedDate: z.coerce.date().optional(),
  weightRequired: z
    .number()
    .int()
    .positive("Weight must be positive")
    .optional(),
  volumeRequired: z
    .number()
    .int()
    .positive("Volume must be positive")
    .optional(),
  orderValue: z.number().int().nonnegative("El valorizado no puede ser negativo").optional(),
  unitsRequired: z.number().int().positive("Las unidades deben ser positivas").optional(),
  orderType: z.enum(["NEW", "RESCHEDULED", "URGENT"] as const).optional(),
  priority: z.number().int().min(0, "Prioridad mínima es 0").max(100, "Prioridad máxima es 100").optional(),
  requiredSkills: z.string().optional(),
  notes: z.string().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  status: z
    .enum(ORDER_STATUS, {
      message: "Invalid order status",
    })
    .default("PENDING" as const),
  active: z.boolean().default(true),
};

// Create schema
export const orderSchema = z
  .object({
    ...baseOrderSchema,
  })
  .refine(
    (data) => {
      // Validate coordinates are within valid ranges
      if (data.latitude) {
        const lat = parseFloat(data.latitude);
        if (lat < -90 || lat > 90) return false;
      }
      return true;
    },
    {
      message: "Latitude must be between -90 and 90",
      path: ["latitude"],
    },
  )
  .refine(
    (data) => {
      // Validate coordinates are within valid ranges
      if (data.longitude) {
        const lng = parseFloat(data.longitude);
        if (lng < -180 || lng > 180) return false;
      }
      return true;
    },
    {
      message: "Longitude must be between -180 and 180",
      path: ["longitude"],
    },
  )
  .refine(
    (data) => {
      // Warn for (0, 0) coordinates (likely invalid)
      if (data.latitude === "0" && data.longitude === "0") {
        return false; // This will trigger the error message
      }
      return true;
    },
    {
      message:
        "Coordinates (0, 0) are likely invalid. Please verify the address.",
      path: ["latitude"],
    },
  );

// Update schema (all optional)
export const updateOrderSchema = z.object({
  trackingId: z.string().min(1).max(50).optional(),
  customerName: z.string().max(255).optional(),
  customerPhone: z.string().max(50).optional(),
  customerEmail: z.string().email().optional().or(z.literal("")),
  address: z.string().min(1).optional(),
  latitude: z
    .string()
    .regex(/^-?\d+\.?\d*$/)
    .optional(),
  longitude: z
    .string()
    .regex(/^-?\d+\.?\d*$/)
    .optional(),
  timeWindowPresetId: z.string().uuid().optional().or(z.literal("")),
  strictness: z.enum(TIME_WINDOW_STRICTNESS).nullable().optional(),
  promisedDate: z.coerce.date().optional(),
  weightRequired: z.number().int().positive().optional(),
  volumeRequired: z.number().int().positive().optional(),
  orderValue: z.number().int().nonnegative().optional(),
  unitsRequired: z.number().int().positive().optional(),
  orderType: z.enum(["NEW", "RESCHEDULED", "URGENT"] as const).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  requiredSkills: z.string().optional(),
  notes: z.string().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(ORDER_STATUS).optional(),
  active: z.boolean().optional(),
});

// Query schema (for GET requests)
export const orderQuerySchema = z.object({
  status: z.enum(ORDER_STATUS).optional(),
  timeWindowPresetId: z.string().uuid().optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().optional(), // Search by tracking ID or customer name
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// Validation result for time window strictness
export const timeWindowValidationResultSchema = z.object({
  valid: z.boolean(),
  canAssign: z.boolean().default(false), // Whether order can be assigned with given constraints
  reason: z.string().optional(),
  penalty: z.number().optional(), // Penalty for SOFT mode violations
  warning: z.string().optional(),
});

// Batch validation result
export const batchValidationResultSchema = z.object({
  total: z.number(),
  assignable: z.number(),
  unassignable: z.number(),
  violations: z.array(
    z.object({
      orderId: z.string().uuid(),
      trackingId: z.string(),
      reason: z.string(),
      strictness: z.enum(TIME_WINDOW_STRICTNESS),
    }),
  ),
});

// Type exports
export type OrderInput = z.infer<typeof orderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type OrderQuery = z.infer<typeof orderQuerySchema>;
export type TimeWindowValidationResult = z.infer<
  typeof timeWindowValidationResultSchema
>;
export type BatchValidationResult = z.infer<typeof batchValidationResultSchema>;
