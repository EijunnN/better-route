import { z } from "zod";

// User roles
export const USER_ROLES = [
  "ADMIN",
  "CONDUCTOR",
  "AGENTE_SEGUIMIENTO",
  "PLANIFICADOR",
] as const;

// Driver status (only for users with role CONDUCTOR)
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
export const isExpiringSoon = (dateString: string) => {
  const expiryDate = new Date(dateString);
  const today = new Date();
  const daysUntilExpiry = Math.ceil(
    (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  return daysUntilExpiry < 30 && daysUntilExpiry >= 0;
};

// Helper function to check if date is expired
export const isExpired = (dateString: string) => {
  const expiryDate = new Date(dateString);
  const today = new Date();
  return expiryDate < today;
};

// Base user fields (required for all users)
const baseUserFields = {
  name: z
    .string()
    .min(1, "Nombre es requerido")
    .max(255, "Nombre demasiado largo"),
  email: z.string().email("Correo electrónico inválido"),
  username: z
    .string()
    .min(3, "Nombre de usuario debe tener al menos 3 caracteres")
    .max(100, "Nombre de usuario demasiado largo")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Solo se permiten letras, números y guiones bajos",
    ),
  role: z.enum(USER_ROLES, {
    message: "Rol debe ser ADMIN, CONDUCTOR, AGENTE_SEGUIMIENTO o PLANIFICADOR",
  }),
  phone: z.string().max(50, "Teléfono demasiado largo").optional().nullable(),
  active: z.boolean().default(true),
};

// Driver-specific fields (only required if role is CONDUCTOR)
const driverFields = {
  identification: z
    .string()
    .max(50, "Identificación demasiado larga")
    .optional()
    .nullable(),
  birthDate: z
    .string()
    .datetime("Fecha de nacimiento inválida")
    .optional()
    .nullable(),
  photo: z.string().url("URL de foto inválida").optional().nullable(),
  licenseNumber: z
    .string()
    .max(100, "Número de licencia demasiado largo")
    .optional()
    .nullable(),
  licenseExpiry: z
    .string()
    .datetime("Fecha de vencimiento de licencia inválida")
    .optional()
    .nullable(),
  licenseCategories: z
    .string()
    .max(255, "Categorías demasiado largas")
    .optional()
    .nullable(),
  certifications: z
    .string()
    .max(1000, "Certificaciones demasiado largas")
    .optional()
    .nullable(),
  driverStatus: z
    .enum(DRIVER_STATUS, {
      message:
        "Estado de conductor debe ser AVAILABLE, ASSIGNED, IN_ROUTE, ON_PAUSE, COMPLETED, UNAVAILABLE o ABSENT",
    })
    .optional()
    .nullable(),
  primaryFleetId: z.string().uuid("ID de flota inválido").optional().nullable(),
};

// Create user schema (with password required)
export const createUserSchema = z
  .object({
    ...baseUserFields,
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres")
      .max(255, "Contraseña demasiado larga"),
    ...driverFields,
  })
  .refine(
    (data) => {
      // If role is CONDUCTOR, require driver-specific fields
      if (data.role === "CONDUCTOR") {
        if (!data.identification || data.identification.trim() === "") {
          return false;
        }
        if (!data.licenseNumber || data.licenseNumber.trim() === "") {
          return false;
        }
        if (!data.licenseExpiry) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        "Para conductores, se requiere: identificación, número de licencia y fecha de vencimiento",
      path: ["role"],
    },
  )
  .refine(
    (data) => {
      // Validate license categories format if provided
      if (data.licenseCategories) {
        const categories = data.licenseCategories
          .split(",")
          .map((c) => c.trim());
        const invalidCategories = categories.filter(
          (c) =>
            !LICENSE_CATEGORIES.includes(
              c as (typeof LICENSE_CATEGORIES)[number],
            ),
        );
        if (invalidCategories.length > 0) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        "Categorías de licencia inválidas. Debe ser una lista separada por comas de: A, A1, A2, A3, B, C, C1, CE, D, D1, DE",
      path: ["licenseCategories"],
    },
  );

// Update user schema (all fields optional except id)
export const updateUserSchema = z.object({
  id: z.string().uuid("ID de usuario inválido"),
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  username: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
  role: z.enum(USER_ROLES).optional(),
  phone: z.string().max(50).optional().nullable(),
  password: z.string().min(8).max(255).optional(),
  identification: z.string().max(50).optional().nullable(),
  birthDate: z.string().datetime().optional().nullable(),
  photo: z.string().url().optional().nullable(),
  licenseNumber: z.string().max(100).optional().nullable(),
  licenseExpiry: z.string().datetime().optional().nullable(),
  licenseCategories: z.string().max(255).optional().nullable(),
  certifications: z.string().max(1000).optional().nullable(),
  driverStatus: z.enum(DRIVER_STATUS).optional().nullable(),
  primaryFleetId: z.string().uuid().optional().nullable(),
  active: z.boolean().optional(),
});

// Query schema for listing users
export const userQuerySchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  driverStatus: z.enum(DRIVER_STATUS).optional(),
  primaryFleetId: z.string().uuid().optional(),
  licenseStatus: z.enum(["valid", "expiring_soon", "expired"]).optional(),
  hasCertifications: z.coerce.boolean().optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// User schema for general validation (without password)
export const userSchema = z
  .object({
    ...baseUserFields,
    ...driverFields,
  })
  .refine(
    (data) => {
      if (data.role === "CONDUCTOR") {
        if (!data.identification || data.identification.trim() === "") {
          return false;
        }
        if (!data.licenseNumber || data.licenseNumber.trim() === "") {
          return false;
        }
        if (!data.licenseExpiry) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        "Para conductores, se requiere: identificación, número de licencia y fecha de vencimiento",
      path: ["role"],
    },
  );

// Types
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserQuery = z.infer<typeof userQuerySchema>;
export type UserInput = z.infer<typeof userSchema>;

// Role display names for UI
export const ROLE_LABELS: Record<(typeof USER_ROLES)[number], string> = {
  ADMIN: "Administrador",
  CONDUCTOR: "Conductor",
  AGENTE_SEGUIMIENTO: "Agente de Seguimiento",
  PLANIFICADOR: "Planificador",
};

// Driver status display names for UI
export const DRIVER_STATUS_LABELS: Record<
  (typeof DRIVER_STATUS)[number],
  string
> = {
  AVAILABLE: "Disponible",
  ASSIGNED: "Asignado",
  IN_ROUTE: "En Ruta",
  ON_PAUSE: "En Pausa",
  COMPLETED: "Completado",
  UNAVAILABLE: "No Disponible",
  ABSENT: "Ausente",
};
