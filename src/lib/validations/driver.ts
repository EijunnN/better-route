import { z } from "zod";

export const DRIVER_STATUS = [
  "AVAILABLE",
  "ASSIGNED",
  "IN_ROUTE",
  "ON_PAUSE",
  "COMPLETED",
  "UNAVAILABLE",
  "ABSENT",
] as const;

export const LICENSE_CATEGORIES = [
  "A",
  "A1",
  "A2",
  "A3",
  "B",
  "C",
  "C1",
  "CE",
  "D",
  "D1",
  "DE",
] as const;

// Helper function to check if date is within 30 days
const isExpiringSoon = (dateString: string) => {
  const expiryDate = new Date(dateString);
  const today = new Date();
  const daysUntilExpiry = Math.ceil(
    (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  return daysUntilExpiry < 30 && daysUntilExpiry >= 0;
};

// Helper function to check if date is expired
const isExpired = (dateString: string) => {
  const expiryDate = new Date(dateString);
  const today = new Date();
  return expiryDate < today;
};

// Base driver fields
const baseDriverSchema = {
  fleetId: z.string().uuid("ID de flota inválido"),
  name: z
    .string()
    .min(1, "Nombre es requerido")
    .max(255, "Nombre demasiado largo"),
  identification: z
    .string()
    .min(1, "Identificación es requerida")
    .max(50, "Identificación demasiado larga"),
  email: z.string().email("Correo electrónico inválido"),
  phone: z.string().max(50, "Teléfono demasiado largo").optional(),
  birthDate: z
    .string()
    .datetime("Fecha de nacimiento inválida")
    .optional()
    .nullable(),
  photo: z.string().url("URL de foto inválida").optional().nullable(),
  licenseNumber: z
    .string()
    .min(1, "Número de licencia es requerido")
    .max(100, "Número de licencia demasiado largo"),
  licenseExpiry: z
    .string()
    .datetime("Fecha de vencimiento de licencia inválida"),
  licenseCategories: z
    .string()
    .min(1, "Categorías de licencia son requeridas")
    .max(255, "Categorías demasiado largas"),
  certifications: z
    .string()
    .max(1000, "Certificaciones demasiado largas")
    .optional()
    .nullable(),
  status: z
    .enum(DRIVER_STATUS, {
      message:
        "Estado debe ser AVAILABLE, ASSIGNED, IN_ROUTE, ON_PAUSE, COMPLETED, UNAVAILABLE o ABSENT",
    })
    .default("AVAILABLE"),
  active: z.boolean().default(true),
};

export const driverSchema = z
  .object({
    ...baseDriverSchema,
  })
  .refine(
    (data) => {
      // Validate license categories format (comma-separated values)
      if (data.licenseCategories) {
        const categories = data.licenseCategories
          .split(",")
          .map((c) => c.trim());
        const invalidCategories = categories.filter(
          (c) => !LICENSE_CATEGORIES.includes(c as any),
        );
        if (invalidCategories.length > 0) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        "Categorías de licencia inválidas. Debe ser una lista separada por comas de: B, C, C1, CE, D, D1, DE",
      path: ["licenseCategories"],
    },
  )
  .refine(
    (data) => {
      // Auto-set status to UNAVAILABLE if license is expired
      if (isExpired(data.licenseExpiry)) {
        return true; // Allow but will be handled in business logic
      }
      return true;
    },
    {
      message: "Licencia vencida",
    },
  );

export const updateDriverSchema = z.object({
  id: z.string().uuid(),
  fleetId: z.string().uuid().optional(),
  name: z.string().min(1).max(255).optional(),
  identification: z.string().min(1).max(50).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  birthDate: z.string().datetime().optional().nullable(),
  photo: z.string().url().optional().nullable(),
  licenseNumber: z.string().min(1).max(100).optional(),
  licenseExpiry: z.string().datetime().optional(),
  licenseCategories: z.string().min(1).max(255).optional(),
  certifications: z.string().max(1000).optional().nullable(),
  status: z.enum(DRIVER_STATUS).optional(),
  active: z.boolean().optional(),
});

export const driverQuerySchema = z.object({
  fleetId: z.string().uuid().optional(),
  status: z.enum(DRIVER_STATUS).optional(),
  licenseStatus: z.enum(["valid", "expiring_soon", "expired"]).optional(),
  hasCertifications: z.coerce.boolean().optional(),
  active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type DriverInput = z.infer<typeof driverSchema>;
export type UpdateDriverInput = z.infer<typeof updateDriverSchema>;
export type DriverQuery = z.infer<typeof driverQuerySchema>;

// Export helper functions for use in business logic
export { isExpiringSoon, isExpired };
