/**
 * Chat access scoping. `chat:read` / `chat:create` gate the endpoints,
 * but the *scope* still differs by role: a dispatcher works across every
 * conversation of the tenant, a driver only their own thread.
 */

const DISPATCH_ROLES = new Set<string>([
  "PLANIFICADOR",
  "ADMIN_FLOTA",
  "ADMIN_SISTEMA",
]);

/** True for roles that staff the dispatch desk (inbox, any thread, broadcast). */
export function isDispatchRole(role: string): boolean {
  return DISPATCH_ROLES.has(role);
}
