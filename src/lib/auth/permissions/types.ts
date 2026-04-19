/**
 * Permission types — single source of truth, browser-safe.
 *
 * No DB, no node, no server-only imports allowed in this file. The same
 * enums are imported by:
 *   - server: src/lib/auth/authorization.ts (permission checks, JWT layer)
 *   - client: src/components/auth/can.tsx, src/hooks/use-permissions.tsx
 *
 * Anything that touches the database (custom roles, role_permissions table)
 * lives in authorization.ts. Anything that runs in both worlds lives here.
 */

/** Entity types that can be permissioned. */
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
  ROLE = "role",
  PERMISSION = "permission",
}

/** Action types for permissions. */
export enum Action {
  CREATE = "create",
  READ = "read",
  UPDATE = "update",
  DELETE = "delete",
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
  FORCE_DELETE = "force_delete",
  BULK_DELETE = "bulk_delete",
  BULK_UPDATE = "bulk_update",
  CHANGE_STATUS = "change_status",
  INVALIDATE_SESSIONS = "invalidate_sessions",
  INVALIDATE_ALL = "invalidate_all",
  WARMUP = "warmup",
  DELETE_ALL = "delete_all",
}

/**
 * Wildcard permission. Granted to ADMIN_SISTEMA — bypasses all individual
 * permission checks. Use sparingly.
 */
export const WILDCARD_PERMISSION = "*" as const;

/**
 * Typed permission string in the canonical `entity:action` format.
 *
 * TypeScript expands this template literal into the full cartesian product, so
 * passing `"order:edit"` (typo) or `"vehicles:read"` (plural) is a compile
 * error at every call site. This is the contract that keeps server and client
 * in sync.
 */
export type Permission =
  | `${EntityType}:${Action}`
  | typeof WILDCARD_PERMISSION;

/** Build a permission string in a way TypeScript can verify. */
export function permission<E extends EntityType, A extends Action>(
  entity: E,
  action: A,
): `${E}:${A}` {
  return `${entity}:${action}` as const;
}

/** Parse a permission string back into its parts. Returns null for wildcard. */
export function parsePermission(
  perm: Permission,
): { entity: EntityType; action: Action } | null {
  if (perm === WILDCARD_PERMISSION) return null;
  const [entity, action] = perm.split(":") as [EntityType, Action];
  return { entity, action };
}

/**
 * Runtime guard. Use at trust boundaries (e.g. validating a permission string
 * fetched from the API) — inside the codebase prefer the typed `Permission`.
 */
export function isPermission(value: unknown): value is Permission {
  if (typeof value !== "string") return false;
  if (value === WILDCARD_PERMISSION) return true;
  const [entity, action] = value.split(":");
  if (!entity || !action) return false;
  const validEntities = new Set<string>(Object.values(EntityType));
  const validActions = new Set<string>(Object.values(Action));
  return validEntities.has(entity) && validActions.has(action);
}

/** Legacy role codes (mirror of db/schema/users.ts USER_ROLES — kept here client-safe). */
export const USER_ROLES = {
  ADMIN_SISTEMA: "ADMIN_SISTEMA",
  ADMIN_FLOTA: "ADMIN_FLOTA",
  PLANIFICADOR: "PLANIFICADOR",
  MONITOR: "MONITOR",
  CONDUCTOR: "CONDUCTOR",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
