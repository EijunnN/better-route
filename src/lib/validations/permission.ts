import { z } from "zod";

// Categorías válidas
const permissionCategoryEnum = z.enum([
  "ORDERS",
  "VEHICLES",
  "DRIVERS",
  "FLEETS",
  "ROUTES",
  "OPTIMIZATION",
  "ALERTS",
  "USERS",
  "SETTINGS",
  "REPORTS",
] as const);

// Acciones válidas
const permissionActionEnum = z.enum([
  "VIEW",
  "CREATE",
  "EDIT",
  "DELETE",
  "IMPORT",
  "EXPORT",
  "ASSIGN",
  "CONFIRM",
  "CANCEL",
  "MANAGE",
] as const);

// Schema para crear un permiso (uso interno/admin)
export const permissionSchema = z.object({
  entity: z.string().min(1).max(50),
  action: permissionActionEnum,
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  category: permissionCategoryEnum,
  displayOrder: z.number().int().default(0),
});

// Schema para query de permisos
export const permissionQuerySchema = z.object({
  category: permissionCategoryEnum.optional(),
  entity: z.string().optional(),
  active: z.coerce.boolean().optional(),
});

// Tipos exportados
export type PermissionInput = z.infer<typeof permissionSchema>;
export type PermissionQuery = z.infer<typeof permissionQuerySchema>;
export type PermissionCategory = z.infer<typeof permissionCategoryEnum>;
export type PermissionAction = z.infer<typeof permissionActionEnum>;
