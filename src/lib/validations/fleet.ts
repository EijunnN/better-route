import { z } from "zod";

// Fleet types (kept for backward compatibility)
export const FLEET_TYPES = [
  "HEAVY_LOAD",
  "LIGHT_LOAD",
  "EXPRESS",
  "REFRIGERATED",
  "SPECIAL",
] as const;

// New simplified fleet schema
export const fleetSchema = z
  .object({
    name: z
      .string()
      .min(1, "Nombre es requerido")
      .max(255, "Nombre demasiado largo"),
    description: z
      .string()
      .max(500, "Descripción demasiado larga")
      .optional()
      .nullable(),

    // M:N relationships
    vehicleIds: z
      .array(z.string().uuid("ID de vehículo inválido"))
      .optional()
      .default([]),
    userIds: z
      .array(z.string().uuid("ID de usuario inválido"))
      .optional()
      .default([]),

    // Legacy fields (kept for backward compatibility)
    type: z
      .enum(FLEET_TYPES, {
        message:
          "Tipo debe ser HEAVY_LOAD, LIGHT_LOAD, EXPRESS, REFRIGERATED o SPECIAL",
      })
      .optional()
      .nullable(),
    weightCapacity: z
      .number()
      .positive("Capacidad de peso debe ser mayor a 0")
      .optional()
      .nullable(),
    volumeCapacity: z
      .number()
      .positive("Capacidad de volumen debe ser mayor a 0")
      .optional()
      .nullable(),
    operationStart: z
      .string()
      .regex(
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        "Formato de hora inicio debe ser HH:MM",
      )
      .optional()
      .nullable(),
    operationEnd: z
      .string()
      .regex(
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        "Formato de hora fin debe ser HH:MM",
      )
      .optional()
      .nullable(),

    active: z.boolean().default(true),
  })
  .refine(
    (data) => {
      // Validate operation times if both are provided
      if (data.operationStart && data.operationEnd) {
        const [startHour, startMin] = data.operationStart
          .split(":")
          .map(Number);
        const [endHour, endMin] = data.operationEnd.split(":").map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        return endMinutes > startMinutes;
      }
      return true;
    },
    {
      message: "Hora fin debe ser posterior a hora inicio",
      path: ["operationEnd"],
    },
  );

export const updateFleetSchema = z.object({
  id: z.string().uuid("ID de flota inválido"),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).optional().nullable(),
  vehicleIds: z.array(z.string().uuid()).optional(),
  userIds: z.array(z.string().uuid()).optional(),
  // Legacy fields
  type: z.enum(FLEET_TYPES).optional().nullable(),
  weightCapacity: z.number().positive().optional().nullable(),
  volumeCapacity: z.number().positive().optional().nullable(),
  operationStart: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .optional()
    .nullable(),
  operationEnd: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .optional()
    .nullable(),
  active: z.boolean().optional(),
});

export const fleetQuerySchema = z.object({
  type: z.enum(FLEET_TYPES).optional(),
  active: z.coerce.boolean().optional(),
  hasVehicles: z.coerce.boolean().optional(),
  hasUsers: z.coerce.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type FleetInput = z.infer<typeof fleetSchema>;
export type UpdateFleetInput = z.infer<typeof updateFleetSchema>;
export type FleetQuery = z.infer<typeof fleetQuerySchema>;

// Fleet type display names for UI
export const FLEET_TYPE_LABELS: Record<(typeof FLEET_TYPES)[number], string> = {
  HEAVY_LOAD: "Carga Pesada",
  LIGHT_LOAD: "Carga Ligera",
  EXPRESS: "Express",
  REFRIGERATED: "Refrigerado",
  SPECIAL: "Especial",
};
