import { z } from "zod";
import { OPTIMIZATION_OBJECTIVE, TIME_WINDOW_STRICTNESS } from "@/db/schema";

export const OPTIMIZATION_OBJECTIVE_VALUES = Object.values(
  OPTIMIZATION_OBJECTIVE,
);
export const TIME_WINDOW_STRICTNESS_VALUES = Object.values(
  TIME_WINDOW_STRICTNESS,
);

// Coordinates validation - must be valid latitude/longitude
const coordinateSchema = z
  .string()
  .min(1)
  .refine(
    (val) => {
      const num = parseFloat(val);
      return !Number.isNaN(num);
    },
    { message: "Must be a valid number" },
  )
  .refine(
    (val) => {
      const num = parseFloat(val);
      return num >= -90 && num <= 90;
    },
    { message: "Latitude must be between -90 and 90" },
  );

const longitudeSchema = z
  .string()
  .min(1)
  .refine(
    (val) => {
      const num = parseFloat(val);
      return !Number.isNaN(num);
    },
    { message: "Must be a valid number" },
  )
  .refine(
    (val) => {
      const num = parseFloat(val);
      return num >= -180 && num <= 180;
    },
    { message: "Longitude must be between -180 and 180" },
  );

// Validate that coordinates are not (0, 0) which is typically invalid
const nonZeroCoordinateSchema = coordinateSchema.refine(
  (val) => parseFloat(val) !== 0,
  { message: "Coordinate cannot be 0" },
);

const nonZeroLongitudeSchema = longitudeSchema.refine(
  (val) => parseFloat(val) !== 0,
  { message: "Coordinate cannot be 0" },
);

// Time format validation (HH:MM)
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
  message: "Time must be in HH:MM format (24-hour)",
});

// JSON array of UUIDs validation
const _uuidArraySchema = z
  .string()
  .transform((val) => {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })
  .refine(
    (arr) =>
      arr.every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        ),
      ),
    {
      message: "All values must be valid UUIDs",
    },
  );

export const optimizationConfigSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(255, "Name too long"),
    depotLatitude: nonZeroCoordinateSchema.optional(),
    depotLongitude: nonZeroLongitudeSchema.optional(),
    depotAddress: z.string().optional(),
    selectedVehicleIds: z.union([z.string(), z.array(z.string())]).optional(),
    selectedDriverIds: z.union([z.string(), z.array(z.string())]).optional(),
    objective: z.enum(OPTIMIZATION_OBJECTIVE_VALUES).default("BALANCED"),
    capacityEnabled: z.boolean().default(true),
    workWindowStart: timeSchema,
    workWindowEnd: timeSchema,
    serviceTimeMinutes: z.number().int().positive().default(10),
    timeWindowStrictness: z.enum(TIME_WINDOW_STRICTNESS_VALUES).default("SOFT"),
    penaltyFactor: z.number().int().min(1).max(20).default(3),
    maxRoutes: z.number().int().positive().optional(),
    status: z.enum(["DRAFT", "CONFIGURED"]).default("CONFIGURED"),
  })
  .refine(
    (data) => {
      // Validate that work window end is after start
      const [startHour, startMin] = data.workWindowStart.split(":").map(Number);
      const [endHour, endMin] = data.workWindowEnd.split(":").map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      return endMinutes > startMinutes;
    },
    {
      message: "Work window end time must be after start time",
      path: ["workWindowEnd"],
    },
  );

export const optimizationConfigQuerySchema = z.object({
  status: z.string().optional(),
  active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// Update schema - all fields optional without refinements that cause issues with .partial()
export const optimizationConfigUpdateSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    depotLatitude: z.string().min(1).optional(),
    depotLongitude: z.string().min(1).optional(),
    depotAddress: z.string().optional(),
    selectedVehicleIds: z.union([z.string(), z.array(z.string())]).optional(),
    selectedDriverIds: z.union([z.string(), z.array(z.string())]).optional(),
    objective: z.enum(OPTIMIZATION_OBJECTIVE_VALUES).optional(),
    capacityEnabled: z.boolean().optional(),
    workWindowStart: timeSchema.optional(),
    workWindowEnd: timeSchema.optional(),
    serviceTimeMinutes: z.number().int().positive().optional(),
    timeWindowStrictness: z.enum(TIME_WINDOW_STRICTNESS_VALUES).optional(),
    penaltyFactor: z.number().int().min(1).max(20).optional(),
    maxRoutes: z.number().int().positive().optional(),
    status: z.enum(["DRAFT", "CONFIGURED"]).optional(),
  })
  .refine(
    (data) => {
      // Only validate work window if both are provided
      if (data.workWindowStart && data.workWindowEnd) {
        const [startHour, startMin] = data.workWindowStart
          .split(":")
          .map(Number);
        const [endHour, endMin] = data.workWindowEnd.split(":").map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        return endMinutes > startMinutes;
      }
      return true;
    },
    {
      message: "Work window end time must be after start time",
      path: ["workWindowEnd"],
    },
  );

// Validation for depot location specifically
export const depotLocationSchema = z.object({
  latitude: nonZeroCoordinateSchema,
  longitude: nonZeroLongitudeSchema,
  address: z.string().optional(),
});

export type OptimizationConfigInput = z.infer<typeof optimizationConfigSchema>;
export type OptimizationConfigUpdate = z.infer<
  typeof optimizationConfigUpdateSchema
>;
export type DepotLocationInput = z.infer<typeof depotLocationSchema>;
export type OptimizationConfigQuery = z.infer<
  typeof optimizationConfigQuerySchema
>;
