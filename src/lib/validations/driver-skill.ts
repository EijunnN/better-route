import { z } from "zod";

// Helper function to check if date is expiring soon (within 30 days)
const isExpiringSoon = (dateString: string) => {
  if (!dateString) return false;
  const expiryDate = new Date(dateString);
  const today = new Date();
  const daysUntilExpiry = Math.ceil(
    (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  return daysUntilExpiry < 30 && daysUntilExpiry >= 0;
};

// Helper function to check if date is expired
const isExpired = (dateString: string) => {
  if (!dateString) return false;
  const expiryDate = new Date(dateString);
  const today = new Date();
  return expiryDate < today;
};

// Base driver skill fields
const baseDriverSkillSchema = {
  driverId: z.string().uuid("ID de conductor inválido"),
  skillId: z.string().uuid("ID de habilidad inválido"),
  obtainedAt: z.string().datetime("Fecha de obtención inválida").optional(),
  expiresAt: z
    .string()
    .datetime("Fecha de vencimiento inválida")
    .optional()
    .nullable(),
  active: z.boolean().default(true),
};

export const driverSkillSchema = z
  .object({
    ...baseDriverSkillSchema,
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
        "La fecha de obtención debe ser anterior a la fecha de vencimiento",
    },
  );

export const updateDriverSkillSchema = z.object({
  id: z.string().uuid(),
  driverId: z.string().uuid().optional(),
  skillId: z.string().uuid().optional(),
  obtainedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  active: z.boolean().optional(),
});

export const driverSkillQuerySchema = z.object({
  driverId: z.string().uuid().optional(),
  skillId: z.string().uuid().optional(),
  status: z.enum(["valid", "expiring_soon", "expired"]).optional(),
  active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type DriverSkillInput = z.infer<typeof driverSkillSchema>;
export type UpdateDriverSkillInput = z.infer<typeof updateDriverSkillSchema>;
export type DriverSkillQuery = z.infer<typeof driverSkillQuerySchema>;

// Export helper functions for use in business logic
export { isExpiringSoon, isExpired };
