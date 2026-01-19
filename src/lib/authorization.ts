/**
 * Role-Based Access Control (RBAC) System
 *
 * This module provides granular permission checking for all entities and actions
 * following the requirements of Story 14.2.
 */

import { type AuthenticatedUser, USER_ROLES } from "./auth-api";

/**
 * Entity types in the system
 */
export enum EntityType {
  COMPANY = "company",
  FLEET = "fleet",
  VEHICLE = "vehicle",
  VEHICLE_SKILL = "vehicle_skill",
  DRIVER = "driver",
  DRIVER_SKILL = "driver_skill",
  ORDER = "order",
  OPTIMIZATION_JOB = "optimization_job",
  OPTIMIZATION_CONFIG = "optimization_config",
  OPTIMIZATION_PRESET = "optimization_preset",
  PLAN = "plan",
  ROUTE = "route",
  ROUTE_STOP = "route_stop",
  ALERT = "alert",
  ALERT_RULE = "alert_rule",
  REASSIGNMENT = "reassignment",
  OUTPUT = "output",
  TIME_WINDOW_PRESET = "time_window_preset",
  USER = "user",
  AUDIT_LOG = "audit_log",
  METRICS = "metrics",
  SESSION = "session",
  CACHE = "cache",
  // RBAC entities
  ROLE = "role",
  PERMISSION = "permission",
}

/**
 * Action types for permissions
 */
export enum Action {
  // CRUD operations
  CREATE = "create",
  READ = "read",
  UPDATE = "update",
  DELETE = "delete",

  // Special actions
  LIST = "list",
  CONFIRM = "confirm",
  CANCEL = "cancel",
  EXECUTE = "execute",
  IMPORT = "import",
  EXPORT = "export",
  ASSIGN = "assign",
  REASSIGN = "reassign",
  ACKNOWLEDGE = "acknowledge",
  DISMISS = "dismiss",
  MONITOR = "monitor",
  VALIDATE = "validate",

  // Sensitive actions (require confirmation)
  FORCE_DELETE = "force_delete",
  BULK_DELETE = "bulk_delete",
  BULK_UPDATE = "bulk_update",
  CHANGE_STATUS = "change_status",
  INVALIDATE_SESSIONS = "invalidate_sessions",
  INVALIDATE_ALL = "invalidate_all",

  // Cache actions (Story 17.2)
  WARMUP = "warmup",
  DELETE_ALL = "delete_all",
}

/**
 * Permission resource in format "entity:action" or wildcard "*"
 */
export type Permission = `${EntityType}:${Action}` | "*";

/**
 * Sensitive actions that require additional confirmation
 */
export const SENSITIVE_ACTIONS = new Set<Action>([
  Action.FORCE_DELETE,
  Action.BULK_DELETE,
  Action.BULK_UPDATE,
  Action.CHANGE_STATUS,
  Action.INVALIDATE_SESSIONS,
  Action.INVALIDATE_ALL,
  Action.DELETE,
  Action.DELETE_ALL,
]);

/**
 * Role permissions mapping - defines what each role can do
 */
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  [USER_ROLES.PLANIFICADOR]: [
    // Can manage planning entities
    `${EntityType.ORDER}:${Action.READ}`,
    `${EntityType.ORDER}:${Action.CREATE}`,
    `${EntityType.ORDER}:${Action.UPDATE}`,
    `${EntityType.ORDER}:${Action.VALIDATE}`,
    `${EntityType.ORDER}:${Action.IMPORT}`,
    `${EntityType.OPTIMIZATION_JOB}:${Action.READ}`,
    `${EntityType.OPTIMIZATION_JOB}:${Action.CREATE}`,
    `${EntityType.OPTIMIZATION_JOB}:${Action.CANCEL}`,
    `${EntityType.OPTIMIZATION_CONFIG}:${Action.READ}`,
    `${EntityType.OPTIMIZATION_CONFIG}:${Action.CREATE}`,
    `${EntityType.OPTIMIZATION_PRESET}:${Action.READ}`,
    `${EntityType.PLAN}:${Action.READ}`,
    `${EntityType.PLAN}:${Action.CREATE}`,
    `${EntityType.PLAN}:${Action.CONFIRM}`,
    `${EntityType.ROUTE}:${Action.READ}`,
    `${EntityType.ROUTE}:${Action.ASSIGN}`,
    `${EntityType.DRIVER}:${Action.READ}`,
    `${EntityType.VEHICLE}:${Action.READ}`,
    `${EntityType.FLEET}:${Action.READ}`,
    `${EntityType.TIME_WINDOW_PRESET}:${Action.READ}`,
    `${EntityType.METRICS}:${Action.READ}`,
    `${EntityType.OUTPUT}:${Action.READ}`,
    `${EntityType.OUTPUT}:${Action.EXPORT}`,
  ],

  [USER_ROLES.MONITOR]: [
    // Can view monitoring information
    `${EntityType.DRIVER}:${Action.READ}`,
    `${EntityType.VEHICLE}:${Action.READ}`,
    `${EntityType.ROUTE}:${Action.READ}`,
    `${EntityType.ROUTE_STOP}:${Action.READ}`,
    `${EntityType.ALERT}:${Action.READ}`,
    `${EntityType.ALERT}:${Action.ACKNOWLEDGE}`,
    `${EntityType.ALERT}:${Action.DISMISS}`,
    `${EntityType.ALERT_RULE}:${Action.READ}`,
    `${EntityType.PLAN}:${Action.READ}`,
    `${EntityType.METRICS}:${Action.READ}`,
    `${EntityType.ORDER}:${Action.READ}`,
    `${EntityType.FLEET}:${Action.READ}`,
  ],

  [USER_ROLES.ADMIN_FLOTA]: [
    // Can manage fleets, vehicles, and drivers
    `${EntityType.FLEET}:${Action.CREATE}`,
    `${EntityType.FLEET}:${Action.READ}`,
    `${EntityType.FLEET}:${Action.UPDATE}`,
    `${EntityType.FLEET}:${Action.DELETE}`,
    `${EntityType.VEHICLE}:${Action.CREATE}`,
    `${EntityType.VEHICLE}:${Action.READ}`,
    `${EntityType.VEHICLE}:${Action.UPDATE}`,
    `${EntityType.VEHICLE}:${Action.DELETE}`,
    `${EntityType.VEHICLE}:${Action.CHANGE_STATUS}`,
    `${EntityType.VEHICLE_SKILL}:${Action.READ}`,
    `${EntityType.DRIVER}:${Action.CREATE}`,
    `${EntityType.DRIVER}:${Action.READ}`,
    `${EntityType.DRIVER}:${Action.UPDATE}`,
    `${EntityType.DRIVER}:${Action.DELETE}`,
    `${EntityType.DRIVER}:${Action.CHANGE_STATUS}`,
    `${EntityType.DRIVER_SKILL}:${Action.READ}`,
    `${EntityType.TIME_WINDOW_PRESET}:${Action.READ}`,
    `${EntityType.METRICS}:${Action.READ}`,
  ],

  [USER_ROLES.ADMIN_SISTEMA]: [
    // Full access - wildcard grants all permissions
    "*",
  ],

  [USER_ROLES.CONDUCTOR]: [
    // Drivers have limited access - mainly to view their assigned routes
    `${EntityType.ROUTE}:${Action.READ}`,
    `${EntityType.ROUTE_STOP}:${Action.READ}`,
    `${EntityType.ORDER}:${Action.READ}`,
  ],
};

// Precomputed Set versions of role permissions for O(1) lookups
const ROLE_PERMISSIONS_SETS: Record<
  string,
  Set<Permission>
> = Object.fromEntries(
  Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => [
    role,
    new Set(perms),
  ]),
);

/**
 * Check if a user has a specific permission
 */
export function hasPermission(
  user: AuthenticatedUser,
  entity: EntityType,
  action: Action,
): boolean {
  const permissionsSet = ROLE_PERMISSIONS_SETS[user.role] || new Set();

  // Check for wildcard permission (admin has full access)
  if (permissionsSet.has("*")) {
    return true;
  }

  // Check for exact permission match
  const permission = `${entity}:${action}` as Permission;
  return permissionsSet.has(permission);
}

/**
 * Check if a user has any of the specified permissions
 */
export function hasAnyPermission(
  user: AuthenticatedUser,
  permissions: Permission[],
): boolean {
  return permissions.some((permission) => {
    const [entity, action] = permission.split(":") as [EntityType, Action];
    return hasPermission(user, entity, action);
  });
}

/**
 * Require user to have permission, throw error if not
 * @throws {AuthorizationError} if user lacks permission
 */
export function requirePermission(
  user: AuthenticatedUser,
  entity: EntityType,
  action: Action,
): void {
  if (!hasPermission(user, entity, action)) {
    throw new AuthorizationError(user, entity, action);
  }
}

/**
 * Check if an action is sensitive and requires confirmation
 */
export function isSensitiveAction(action: Action): boolean {
  return SENSITIVE_ACTIONS.has(action);
}

/**
 * Authorization error with details
 */
export class AuthorizationError extends Error {
  public readonly userId: string;
  public readonly userRole: string;
  public readonly entityType: EntityType;
  public readonly action: Action;
  public readonly code = "AUTHORIZATION_ERROR";

  constructor(user: AuthenticatedUser, entityType: EntityType, action: Action) {
    super(
      `User ${user.userId} with role ${user.role} does not have permission to ${action} ${entityType}`,
    );
    this.name = "AuthorizationError";
    this.userId = user.userId;
    this.userRole = user.role;
    this.entityType = entityType;
    this.action = action;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      userId: this.userId,
      userRole: this.userRole,
      entityType: this.entityType,
      action: this.action,
    };
  }
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}

// ============================================
// DATABASE-BASED PERMISSION CHECKING
// ============================================

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  userRoles,
  rolePermissions,
  permissions as permissionsTable,
  roles,
  users,
} from "@/db/schema";

/**
 * Cache for user permissions to avoid repeated DB queries
 * Key: `${userId}:${entity}:${action}`
 */
const permissionCache = new Map<
  string,
  { allowed: boolean; expiresAt: number }
>();
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Clear permission cache for a user (call when roles change)
 */
export function clearUserPermissionCache(userId: string): void {
  for (const key of permissionCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      permissionCache.delete(key);
    }
  }
}

/**
 * Check if user has permission by querying the database
 * Uses role_permissions table for dynamic permission checking
 */
export async function hasPermissionFromDB(
  userId: string,
  companyId: string,
  entity: string,
  action: string,
): Promise<boolean> {
  const cacheKey = `${userId}:${entity}:${action}`;
  const cached = permissionCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.allowed;
  }

  try {
    // Get user's active roles
    const userRolesData = await db
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.active, true),
          eq(roles.companyId, companyId),
          eq(roles.active, true),
        ),
      );

    if (userRolesData.length === 0) {
      // No roles assigned, fall back to legacy role check
      permissionCache.set(cacheKey, {
        allowed: false,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return false;
    }

    const roleIds = userRolesData.map((r) => r.roleId);

    // Check if any role is a system admin role (has all permissions)
    const systemAdminRoles = await db
      .select()
      .from(roles)
      .where(and(eq(roles.code, "ADMIN_SISTEMA"), eq(roles.active, true)));

    const adminRoleIdsSet = new Set(systemAdminRoles.map((r) => r.id));
    const isAdmin = roleIds.some((id) => adminRoleIdsSet.has(id));

    if (isAdmin) {
      permissionCache.set(cacheKey, {
        allowed: true,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return true;
    }

    // Check for specific permission in role_permissions
    for (const roleId of roleIds) {
      const permissionCheck = await db
        .select()
        .from(rolePermissions)
        .innerJoin(
          permissionsTable,
          eq(rolePermissions.permissionId, permissionsTable.id),
        )
        .where(
          and(
            eq(rolePermissions.roleId, roleId),
            eq(rolePermissions.enabled, true),
            eq(permissionsTable.entity, entity),
            eq(permissionsTable.action, action),
            eq(permissionsTable.active, true),
          ),
        )
        .limit(1);

      if (permissionCheck.length > 0) {
        permissionCache.set(cacheKey, {
          allowed: true,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return true;
      }
    }

    permissionCache.set(cacheKey, {
      allowed: false,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return false;
  } catch (error) {
    console.error("Error checking permission from DB:", error);
    // Fall back to false on error
    return false;
  }
}

/**
 * Get all permissions for a user from the database
 * Returns array of "entity:action" strings
 *
 * Combines two permission sources:
 * 1. Base role permissions (from ROLE_PERMISSIONS static mapping)
 * 2. Custom role permissions (from database roles assigned to user)
 */
export async function getUserPermissionsFromDB(
  userId: string,
  companyId: string | null,
): Promise<string[]> {
  try {
    // Get user's base role from users table
    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return [];
    }

    // For ADMIN_SISTEMA (with or without companyId), grant all permissions
    if (user.role === "ADMIN_SISTEMA") {
      return ["*"];
    }

    // Start with base role permissions (static mapping)
    const enabledPermissionsSet = new Set<string>();
    const baseRolePermissions = ROLE_PERMISSIONS[user.role] || [];
    for (const perm of baseRolePermissions) {
      enabledPermissionsSet.add(perm);
    }

    // If no companyId, return only base role permissions
    if (!companyId) {
      return Array.from(enabledPermissionsSet);
    }

    // Get user's custom roles from database
    const userRolesData = await db
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.active, true),
          eq(roles.companyId, companyId),
          eq(roles.active, true),
        ),
      );

    // Add permissions from custom roles
    for (const { roleId } of userRolesData) {
      // Check if custom role is admin
      const [customRole] = await db
        .select({ code: roles.code })
        .from(roles)
        .where(eq(roles.id, roleId))
        .limit(1);

      if (customRole?.code === "ADMIN_SISTEMA") {
        return ["*"]; // Admin role grants all permissions
      }

      // Get enabled permissions for this custom role
      const perms = await db
        .select({
          entity: permissionsTable.entity,
          action: permissionsTable.action,
        })
        .from(rolePermissions)
        .innerJoin(
          permissionsTable,
          eq(rolePermissions.permissionId, permissionsTable.id),
        )
        .where(
          and(
            eq(rolePermissions.roleId, roleId),
            eq(rolePermissions.enabled, true),
            eq(permissionsTable.active, true),
          ),
        );

      for (const perm of perms) {
        enabledPermissionsSet.add(`${perm.entity}:${perm.action}`);
      }
    }

    return Array.from(enabledPermissionsSet);
  } catch (error) {
    console.error("Error getting user permissions from DB:", error);
    return [];
  }
}

/**
 * Check permission with detailed result
 */
export function checkPermission(
  user: AuthenticatedUser,
  entity: EntityType,
  action: Action,
): PermissionCheckResult {
  const allowed = hasPermission(user, entity, action);
  const requiresConfirmation = allowed && isSensitiveAction(action);

  return {
    allowed,
    requiresConfirmation,
    reason: allowed
      ? requiresConfirmation
        ? "This action requires confirmation before proceeding"
        : undefined
      : `User with role ${user.role} is not authorized to ${action} ${entity}`,
  };
}

/**
 * Create an API response for authorization error
 */
export function createAuthorizationErrorResponse(
  error: AuthorizationError,
): Response {
  return new Response(JSON.stringify(error.toJSON()), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if user has admin-level access
 */
export function isAdmin(user: AuthenticatedUser): boolean {
  return user.role === USER_ROLES.ADMIN_SISTEMA;
}

/**
 * Simple authorization check helper
 * Returns true if user has permission, with special handling for:
 * - Users can always access their own resources
 * - Admins have full access
 *
 * @param user - Authenticated user
 * @param entity - Entity type
 * @param action - Action to perform
 * @param resourceOwnerId - Optional owner ID of the resource (for ownership checks)
 * @returns true if authorized, false otherwise
 */
export function authorize(
  user: AuthenticatedUser,
  entity: EntityType,
  action: Action,
  resourceOwnerId?: string,
): boolean {
  // Admins have full access
  if (isAdmin(user)) {
    return true;
  }

  // Users can always manage their own sessions
  if (entity === EntityType.SESSION && resourceOwnerId === user.userId) {
    return action === Action.READ || action === Action.DELETE;
  }

  // Users can always invalidate their own sessions
  if (entity === EntityType.USER && resourceOwnerId === user.userId) {
    if (action === Action.INVALIDATE_SESSIONS) {
      return true;
    }
  }

  // Check standard permission
  return hasPermission(user, entity, action);
}

/**
 * Check if user can manage other users
 */
export function canManageUsers(user: AuthenticatedUser): boolean {
  return isAdmin(user);
}

/**
 * Check if user can perform reassignment operations
 */
export function canReassign(user: AuthenticatedUser): boolean {
  return (
    hasPermission(user, EntityType.REASSIGNMENT, Action.READ) &&
    hasPermission(user, EntityType.REASSIGNMENT, Action.EXECUTE)
  );
}

/**
 * Check if user can monitor operations
 */
export function canMonitor(user: AuthenticatedUser): boolean {
  return (
    user.role === USER_ROLES.MONITOR ||
    user.role === USER_ROLES.ADMIN_SISTEMA ||
    user.role === USER_ROLES.PLANIFICADOR
  );
}

/**
 * Check if user can manage fleet resources
 */
export function canManageFleet(user: AuthenticatedUser): boolean {
  return (
    user.role === USER_ROLES.ADMIN_FLOTA ||
    user.role === USER_ROLES.ADMIN_SISTEMA
  );
}
