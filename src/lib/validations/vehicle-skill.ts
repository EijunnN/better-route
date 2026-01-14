import { z } from "zod";

export const VEHICLE_SKILL_CATEGORIES = [
  "EQUIPMENT",
  "TEMPERATURE",
  "CERTIFICATIONS",
  "SPECIAL",
] as const;

const VEHICLE_SKILL_CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: "Equipamiento",
  TEMPERATURE: "Temperatura",
  CERTIFICATIONS: "Certificaciones",
  SPECIAL: "Especiales",
};

// Base vehicle skill fields
const baseVehicleSkillSchema = {
  code: z
    .string()
    .min(1, "Código es requerido")
    .max(50, "Código demasiado largo")
    .regex(
      /^[A-Z0-9_-]+$/,
      "El código debe contener solo mayúsculas, números, guiones y guiones bajos",
    ),
  name: z
    .string()
    .min(1, "Nombre es requerido")
    .max(255, "Nombre demasiado largo"),
  category: z.enum(VEHICLE_SKILL_CATEGORIES, {
    message:
      "Categoría debe ser EQUIPMENT, TEMPERATURE, CERTIFICATIONS o SPECIAL",
  }),
  description: z.string().max(1000, "Descripción demasiado larga").optional(),
  active: z.boolean().default(true),
};

export const vehicleSkillSchema = z.object({
  ...baseVehicleSkillSchema,
});

export const updateVehicleSkillSchema = z.object({
  id: z.string().uuid(),
  code: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[A-Z0-9_-]+$/)
    .optional(),
  name: z.string().min(1).max(255).optional(),
  category: z.enum(VEHICLE_SKILL_CATEGORIES).optional(),
  description: z.string().max(1000).optional(),
  active: z.boolean().optional(),
});

export const vehicleSkillQuerySchema = z.object({
  category: z.enum(VEHICLE_SKILL_CATEGORIES).optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().max(255).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type VehicleSkillInput = z.infer<typeof vehicleSkillSchema>;
export type UpdateVehicleSkillInput = z.infer<typeof updateVehicleSkillSchema>;
export type VehicleSkillQuery = z.infer<typeof vehicleSkillQuerySchema>;

export { VEHICLE_SKILL_CATEGORY_LABELS };
