/**
 * Permission contract — public surface for both server and client.
 *
 * Import from here for typed permission checks:
 *   import { type Permission, EntityType, Action } from "@/lib/auth/permissions";
 *
 * Server-side enforcement (DB lookups, JWT) lives in
 * `@/lib/auth/authorization` and should be imported only from server code.
 */

export type { Permission, UserRole } from "./types";
export {
  Action,
  EntityType,
  isPermission,
  parsePermission,
  permission,
  USER_ROLES,
  WILDCARD_PERMISSION,
} from "./types";
