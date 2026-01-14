import { z } from "zod";

// Zone types
export const ZONE_TYPES = [
  "DELIVERY",
  "PICKUP",
  "MIXED",
  "RESTRICTED",
] as const;

// Days of week for zone scheduling
export const DAYS_OF_WEEK = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

// GeoJSON polygon coordinate validation
// Coordinates should be an array of arrays: [[[lng, lat], [lng, lat], ...]]
const coordinatesSchema = z
  .array(
    z.array(
      z.tuple([
        z
          .number()
          .min(-180)
          .max(180), // longitude
        z
          .number()
          .min(-90)
          .max(90), // latitude
      ]),
    ),
  )
  .min(1, "Se requiere al menos un anillo de coordenadas")
  .refine(
    (rings) => rings.every((ring) => ring.length >= 4 && ring.length <= 1000),
    "Cada anillo debe tener entre 4 y 1000 puntos",
  );

// GeoJSON Polygon geometry schema
const geometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: coordinatesSchema,
});

// Zone schema for creation
export const zoneSchema = z.object({
  name: z
    .string()
    .min(1, "Nombre es requerido")
    .max(255, "Nombre demasiado largo"),
  description: z
    .string()
    .max(500, "Descripcion demasiado larga")
    .optional()
    .nullable(),
  type: z
    .enum(ZONE_TYPES, {
      message: "Tipo debe ser DELIVERY, PICKUP, MIXED o RESTRICTED",
    })
    .default("DELIVERY"),
  // GeoJSON polygon geometry stored as JSON string
  geometry: z.string().refine(
    (val) => {
      try {
        const parsed = JSON.parse(val);
        return geometrySchema.safeParse(parsed).success;
      } catch {
        return false;
      }
    },
    { message: "Geometria debe ser un poligono GeoJSON valido" },
  ),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color debe ser un codigo hexadecimal valido")
    .default("#3B82F6"),
  isDefault: z.boolean().default(false),
  // Active days as JSON array of day names
  activeDays: z.array(z.enum(DAYS_OF_WEEK)).optional().nullable(),
  active: z.boolean().default(true),
});

// Zone schema for updates (all fields optional except id)
export const updateZoneSchema = z.object({
  id: z.string().uuid("ID de zona invalido"),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).optional().nullable(),
  type: z.enum(ZONE_TYPES).optional(),
  geometry: z
    .string()
    .refine(
      (val) => {
        try {
          const parsed = JSON.parse(val);
          return geometrySchema.safeParse(parsed).success;
        } catch {
          return false;
        }
      },
      { message: "Geometria debe ser un poligono GeoJSON valido" },
    )
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  isDefault: z.boolean().optional(),
  activeDays: z.array(z.enum(DAYS_OF_WEEK)).optional().nullable(),
  active: z.boolean().optional(),
});

// Zone query schema for filtering
export const zoneQuerySchema = z.object({
  type: z.enum(ZONE_TYPES).optional(),
  active: z.coerce.boolean().optional(),
  isDefault: z.coerce.boolean().optional(),
  hasVehicles: z.coerce.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// Zone-Vehicle assignment schema
export const zoneVehicleSchema = z.object({
  zoneId: z.string().uuid("ID de zona invalido"),
  vehicleId: z.string().uuid("ID de vehiculo invalido"),
  assignedDays: z.array(z.enum(DAYS_OF_WEEK)).optional().nullable(),
  active: z.boolean().default(true),
});

// Bulk zone-vehicle assignment (assign multiple vehicles to a zone)
export const bulkZoneVehicleSchema = z.object({
  zoneId: z.string().uuid("ID de zona invalido"),
  vehicleIds: z.array(z.string().uuid("ID de vehiculo invalido")),
  assignedDays: z.array(z.enum(DAYS_OF_WEEK)).optional().nullable(),
});

// Zone-vehicle update schema
export const updateZoneVehicleSchema = z.object({
  id: z.string().uuid("ID de asignacion invalido"),
  assignedDays: z.array(z.enum(DAYS_OF_WEEK)).optional().nullable(),
  active: z.boolean().optional(),
});

// Type exports
export type ZoneInput = z.infer<typeof zoneSchema>;
export type UpdateZoneInput = z.infer<typeof updateZoneSchema>;
export type ZoneQuery = z.infer<typeof zoneQuerySchema>;
export type ZoneVehicleInput = z.infer<typeof zoneVehicleSchema>;
export type BulkZoneVehicleInput = z.infer<typeof bulkZoneVehicleSchema>;
export type UpdateZoneVehicleInput = z.infer<typeof updateZoneVehicleSchema>;

// Zone type display names for UI
export const ZONE_TYPE_LABELS: Record<(typeof ZONE_TYPES)[number], string> = {
  DELIVERY: "Entrega",
  PICKUP: "Recogida",
  MIXED: "Mixta",
  RESTRICTED: "Restringida",
};

// Day of week display names for UI
export const DAY_OF_WEEK_LABELS: Record<(typeof DAYS_OF_WEEK)[number], string> =
  {
    MONDAY: "Lunes",
    TUESDAY: "Martes",
    WEDNESDAY: "Miercoles",
    THURSDAY: "Jueves",
    FRIDAY: "Viernes",
    SATURDAY: "Sabado",
    SUNDAY: "Domingo",
  };

// Predefined zone colors for UI
export const ZONE_COLORS = [
  "#3B82F6", // Blue
  "#EF4444", // Red
  "#10B981", // Green
  "#F59E0B", // Amber
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#06B6D4", // Cyan
  "#84CC16", // Lime
  "#F97316", // Orange
  "#6366F1", // Indigo
];
