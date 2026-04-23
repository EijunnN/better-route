import { z } from "zod";

// Fleet classification — purely for display/filter. Not consumed by the solver.
export const FLEET_TYPES = [
  "HEAVY_LOAD",
  "LIGHT_LOAD",
  "EXPRESS",
  "REFRIGERATED",
  "SPECIAL",
] as const;

export const fleetSchema = z.object({
  name: z
    .string()
    .min(1, "Nombre es requerido")
    .max(255, "Nombre demasiado largo"),
  description: z
    .string()
    .max(500, "Descripción demasiado larga")
    .optional()
    .nullable(),
  // Vehicles belong to fleets via vehicle_fleets M:N. userIds kept for
  // primary/secondary fleet assignments updated from this form.
  vehicleIds: z
    .array(z.string().uuid("ID de vehículo inválido"))
    .optional()
    .default([]),
  userIds: z
    .array(z.string().uuid("ID de usuario inválido"))
    .optional()
    .default([]),
  type: z
    .enum(FLEET_TYPES, {
      message:
        "Tipo debe ser HEAVY_LOAD, LIGHT_LOAD, EXPRESS, REFRIGERATED o SPECIAL",
    })
    .optional()
    .nullable(),
  active: z.boolean().default(true),
});

export const updateFleetSchema = z.object({
  id: z.string().uuid("ID de flota inválido"),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).optional().nullable(),
  vehicleIds: z.array(z.string().uuid()).optional(),
  userIds: z.array(z.string().uuid()).optional(),
  type: z.enum(FLEET_TYPES).optional().nullable(),
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
