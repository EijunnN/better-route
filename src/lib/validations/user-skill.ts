import { z } from "zod";
export { isExpired, isExpiringSoon } from "./user";

// Base user skill fields
const baseUserSkillSchema = {
  userId: z.string().uuid("ID de usuario invalido"),
  skillId: z.string().uuid("ID de habilidad invalido"),
  obtainedAt: z.string().datetime("Fecha de obtencion invalida").optional(),
  expiresAt: z
    .string()
    .datetime("Fecha de vencimiento invalida")
    .optional()
    .nullable(),
  active: z.boolean().default(true),
};

export const userSkillSchema = z
  .object({
    ...baseUserSkillSchema,
  })
  .refine(
    (data) => {
      // Validate that obtainedAt is before expiresAt if both are provided
      if (data.obtainedAt && data.expiresAt) {
        return new Date(data.obtainedAt) < new Date(data.expiresAt);
      }
      return true;
    },
    {
      message:
        "La fecha de obtencion debe ser anterior a la fecha de vencimiento",
    },
  );

export const updateUserSkillSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().optional(),
  skillId: z.string().uuid().optional(),
  obtainedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  active: z.boolean().optional(),
});

export const userSkillQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  skillId: z.string().uuid().optional(),
  status: z.enum(["valid", "expiring_soon", "expired"]).optional(),
  active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type UserSkillInput = z.infer<typeof userSkillSchema>;
export type UpdateUserSkillInput = z.infer<typeof updateUserSkillSchema>;
export type UserSkillQuery = z.infer<typeof userSkillQuerySchema>;
