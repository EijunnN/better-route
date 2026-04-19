/**
 * Permission contract — public surface for both server and client.
 *
 * Import from here for typed permission checks:
 *   import { type Permission, EntityType, Action } from "@/lib/auth/permissions";
 *
 * Server-side enforcement (DB lookups, JWT) lives in
 * `@/lib/auth/authorization` and should be imported only from server code.
 */

export {
  EntityType,
  Action,
  WILDCARD_PERMISSION,
  USER_ROLES,
  permission,
  parsePermission,
  isPermission,
} from "./types";

export type { Permission, UserRole } from "./types";
