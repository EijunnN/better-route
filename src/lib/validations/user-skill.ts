import { z } from "zod";

// Helper function to check if date is expiring soon (within 30 days)
export const isExpiringSoon = (dateString: string) => {
  if (!dateString) return false;
  const expiryDate = new Date(dateString);
  const today = new Date();
  const daysUntilExpiry = Math.ceil(
    (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  return daysUntilExpiry < 30 && daysUntilExpiry >= 0;
};

// Helper function to check if date is expired
export const isExpired = (dateString: string) => {
  if (!dateString) return false;
  const expiryDate = new Date(dateString);
  const today = new Date();
  return expiryDate < today;
};

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
