import { z } from "zod";

export const TIME_WINDOW_TYPES = ["SHIFT", "RANGE", "EXACT"] as const;
export const TIME_WINDOW_STRICTNESS = ["HARD", "SOFT"] as const;

// Base schema fields
const baseTimeWindowPresetSchema = {
  name: z.string().min(1, "Name is required").max(255, "Name too long"),
  type: z.enum(TIME_WINDOW_TYPES, {
    message: "Type must be SHIFT, RANGE, or EXACT",
  }),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)")
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)")
    .optional(),
  exactTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)")
    .optional(),
  toleranceMinutes: z.number().int().nonnegative().optional(),
  strictness: z
    .enum(TIME_WINDOW_STRICTNESS, {
      message: "Strictness must be HARD or SOFT",
    })
    .default("HARD" as const),
  active: z.boolean().default(true),
};

// Create schema with type-specific validation
export const timeWindowPresetSchema = z
  .object({
    ...baseTimeWindowPresetSchema,
  })
  .refine(
    (data) => {
      // Validate SHIFT type has both start and end time
      if (data.type === "SHIFT") {
        return data.startTime !== undefined && data.endTime !== undefined;
      }
      return true;
    },
    {
      message: "SHIFT type requires both start and end time",
      path: ["startTime"],
    },
  )
  .refine(
    (data) => {
      // Validate RANGE type has both start and end time
      if (data.type === "RANGE") {
        return data.startTime !== undefined && data.endTime !== undefined;
      }
      return true;
    },
    {
      message: "RANGE type requires both start and end time",
      path: ["startTime"],
    },
  )
  .refine(
    (data) => {
      // Validate EXACT type has exact time and tolerance
      if (data.type === "EXACT") {
        return (
          data.exactTime !== undefined && data.toleranceMinutes !== undefined
        );
      }
      return true;
    },
    {
      message: "EXACT type requires exact time and tolerance minutes",
      path: ["exactTime"],
    },
  )
  .refine(
    (data) => {
      // Validate end time is after start time for SHIFT and RANGE
      if (
        (data.type === "SHIFT" || data.type === "RANGE") &&
        data.startTime &&
        data.endTime
      ) {
        return data.endTime > data.startTime;
      }
      return true;
    },
    {
      message: "End time must be after start time",
      path: ["endTime"],
    },
  );

// Update schema (all optional)
export const updateTimeWindowPresetSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(255).optional(),
    type: z.enum(TIME_WINDOW_TYPES).optional(),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)")
      .optional(),
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)")
      .optional(),
    exactTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)")
      .optional(),
    toleranceMinutes: z.number().int().nonnegative().optional(),
    strictness: z.enum(TIME_WINDOW_STRICTNESS).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // Validate SHIFT type has both start and end time
      if (data.type === "SHIFT") {
        return data.startTime !== undefined && data.endTime !== undefined;
      }
      return true;
    },
    {
      message: "SHIFT type requires both start and end time",
      path: ["startTime"],
    },
  )
  .refine(
    (data) => {
      // Validate RANGE type has both start and end time
      if (data.type === "RANGE") {
        return data.startTime !== undefined && data.endTime !== undefined;
      }
      return true;
    },
    {
      message: "RANGE type requires both start and end time",
      path: ["startTime"],
    },
  )
  .refine(
    (data) => {
      // Validate EXACT type has exact time and tolerance
      if (data.type === "EXACT") {
        return (
          data.exactTime !== undefined && data.toleranceMinutes !== undefined
        );
      }
      return true;
    },
    {
      message: "EXACT type requires exact time and tolerance minutes",
      path: ["exactTime"],
    },
  )
  .refine(
    (data) => {
      // Validate end time is after start time for SHIFT and RANGE
      if (
        (data.type === "SHIFT" || data.type === "RANGE") &&
        data.startTime &&
        data.endTime
      ) {
        return data.endTime > data.startTime;
      }
      return true;
    },
    {
      message: "End time must be after start time",
      path: ["endTime"],
    },
  );

// Query schema (for GET requests)
export const timeWindowPresetQuerySchema = z.object({
  type: z.enum(TIME_WINDOW_TYPES).optional(),
  strictness: z.enum(TIME_WINDOW_STRICTNESS).optional(),
  active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// Type exports
export type TimeWindowPresetInput = z.infer<typeof timeWindowPresetSchema>;
export type UpdateTimeWindowPresetInput = z.infer<
  typeof updateTimeWindowPresetSchema
>;
export type TimeWindowPresetQuery = z.infer<typeof timeWindowPresetQuerySchema>;
