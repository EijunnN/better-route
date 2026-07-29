/**
 * API Middleware for authorization
 *
 * Single guard contract for API routes: `requireRoutePermission` at the top of
 * every handler. The old wrapper-style middleware (`withAuth`, `withPermission`,
 * `withAuthAndAudit`, `withAuditLog`) was removed — one pattern, no shims.
 */

import { type NextRequest, NextResponse } from "next/server";
import { type AuthenticatedUser, getAuthenticatedUser } from "../auth/auth-api";
import {
  type Action,
  AuthorizationError,
  type EntityType,
  getUserPermissionsFromDB,
  hasPermission,
} from "../auth/authorization";

/**
 * Check permission against the legacy ROLE_PERMISSIONS matrix first (sync,
 * fast — covers the 5 base roles), then fall back to the DB-backed custom
 * roles (cached, ~1 min TTL inside getUserPermissionsFromDB). Returns true
 * if either grants access; throws AuthorizationError otherwise.
 *
 * This is the contract that ties /api/auth/me (which the client trusts)
 * to actual server enforcement: both surfaces consult the same union of
 * legacy + custom permissions.
 */
async function assertMergedPermission(
  user: AuthenticatedUser,
  entity: EntityType,
  action: Action,
): Promise<void> {
  // Fast path: legacy matrix (covers ADMIN_SISTEMA wildcard + base roles)
  if (hasPermission(user, entity, action)) return;
  // Slow path: custom roles from DB. Only attempt if we have a tenant.
  if (user.companyId) {
    const merged = await getUserPermissionsFromDB(user.userId, user.companyId);
    const desired = `${entity}:${action}`;
    if (merged.includes("*") || merged.includes(desired)) return;
  }
  throw new AuthorizationError(user, entity, action);
}

/**
 * Inline permission check for route handlers.
 * Use at the top of any handler that needs authorization.
 * Returns the authenticated user if successful, or a 401/403 NextResponse on failure.
 */
export async function requireRoutePermission(
  request: NextRequest,
  entity: EntityType,
  action: Action,
): Promise<AuthenticatedUser | NextResponse> {
  try {
    const user = await getAuthenticatedUser(request);
    await assertMergedPermission(user, entity, action);
    return user;
  } catch (error: unknown) {
    const err = error as { name?: string; toJSON?: () => unknown };
    if (err.name === "AuthorizationError" && err.toJSON) {
      return NextResponse.json(err.toJSON(), { status: 403 });
    }
    return NextResponse.json(
      { error: "Authentication required", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }
}
