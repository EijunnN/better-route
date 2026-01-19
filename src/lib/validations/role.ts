import { z } from "zod";

// Schema para crear un rol
export const roleSchema = z.object({
  name: z
    .string()
    .min(1, "Nombre del rol es requerido")
    .max(100, "Nombre muy largo"),
  description: z.string().optional(),
  code: z.string().max(50).optional(),
});

// Schema para actualizar un rol
export const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  active: z.boolean().optional(),
});

// Schema para asignar permisos a un rol (switches)
export const rolePermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      permissionId: z.string().uuid("ID de permiso inválido"),
      enabled: z.boolean(),
    }),
  ),
});

// Schema para asignar un rol a un usuario
export const userRoleSchema = z.object({
  userId: z.string().uuid("ID de usuario inválido"),
  roleId: z.string().uuid("ID de rol inválido"),
  isPrimary: z.boolean().default(false),
});

// Schema para query de roles
export const roleQuerySchema = z.object({
  active: z.coerce.boolean().optional(),
  isSystem: z.coerce.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// Tipos exportados
export type RoleInput = z.infer<typeof roleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type RolePermissionsInput = z.infer<typeof rolePermissionsSchema>;
export type UserRoleInput = z.infer<typeof userRoleSchema>;
export type RoleQuery = z.infer<typeof roleQuerySchema>;
