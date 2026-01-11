/**
 * Role-Based Access Control (RBAC) System
 *
 * This module provides granular permission checking for all entities and actions
 * following the requirements of Story 14.2.
 */

import { AuthenticatedUser, USER_ROLES } from "./auth-api";

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
  Action.DELETE,
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
};

/**
 * Check if a user has a specific permission
 */
export function hasPermission(
  user: AuthenticatedUser,
  entity: EntityType,
  action: Action
): boolean {
  const permissions = ROLE_PERMISSIONS[user.role] || [];

  // Check for wildcard permission (admin has full access)
  if (permissions.includes("*")) {
    return true;
  }

  // Check for exact permission match
  const permission = `${entity}:${action}` as Permission;
  return permissions.includes(permission);
}

/**
 * Check if a user has any of the specified permissions
 */
export function hasAnyPermission(
  user: AuthenticatedUser,
  permissions: Permission[]
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
  action: Action
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

  constructor(
    user: AuthenticatedUser,
    entityType: EntityType,
    action: Action
  ) {
    super(
      `User ${user.userId} with role ${user.role} does not have permission to ${action} ${entityType}`
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

/**
 * Check permission with detailed result
 */
export function checkPermission(
  user: AuthenticatedUser,
  entity: EntityType,
  action: Action
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
export function createAuthorizationErrorResponse(error: AuthorizationError): Response {
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
