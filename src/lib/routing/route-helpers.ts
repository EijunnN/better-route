/**
 * Route helper utilities for consistent API route handling
 *
 * This module provides helper functions that bridge the existing
 * tenant-based authentication with the new RBAC permission system.
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
import { setTenantContext } from "../infra/tenant";

/**
 * Derive the tenant context for an already-authenticated request.
 *
 * Security contract:
 * - For ADMIN_SISTEMA (no JWT companyId): the `x-company-id` header is
 *   required and used as the target tenant.
 * - For every other role: the JWT's `companyId` is authoritative. If the
 *   caller sends an `x-company-id` header that disagrees, the request is
 *   rejected with 403 (defense-in-depth against forged headers).
 *
 * Returns either the resolved tenant or a NextResponse error to return
 * directly from the route handler. Callers MUST have validated the user
 * first via `requireRoutePermission` / `getAuthenticatedUser`.
 */
export function extractTenantContextAuthed(
  request: NextRequest,
  user: AuthenticatedUser,
): { companyId: string; userId: string } | NextResponse {
  const headerCompanyId = request.headers.get("x-company-id");

  if (user.role === "ADMIN_SISTEMA") {
    if (!headerCompanyId) {
      return NextResponse.json(
        {
          error: "x-company-id header required for ADMIN_SISTEMA",
          code: "COMPANY_REQUIRED",
        },
        { status: 400 },
      );
    }
    return { companyId: headerCompanyId, userId: user.userId };
  }

  if (!user.companyId) {
    return NextResponse.json(
      { error: "User has no company", code: "NO_COMPANY" },
      { status: 403 },
    );
  }

  if (headerCompanyId && headerCompanyId !== user.companyId) {
    return NextResponse.json(
      { error: "Tenant mismatch", code: "TENANT_MISMATCH" },
      { status: 403 },
    );
  }

  return { companyId: user.companyId, userId: user.userId };
}

/**
 * @deprecated Use `extractTenantContextAuthed` together with `requireRoutePermission`.
 *
 * Previously returned a user object built from the `x-*` headers without a JWT
 * check — an unauthenticated attacker could set `x-user-role: ADMIN_SISTEMA`
 * and bypass RBAC. Now forced to always validate the JWT first.
 */
export function extractUserContext(_request: NextRequest): {
  companyId: string | null;
  userId: string | null;
  email: string | null;
  role: string | null;
} {
  // Never trust headers for identity. Routes that used the header short-circuit
  // must migrate to setupAuthContext (JWT-only) or requireRoutePermission.
  return {
    companyId: null,
    userId: null,
    email: null,
    role: null,
  };
}

/**
 * Set up authenticated context for a request.
 *
 * Validates the JWT and derives the tenant via `extractTenantContextAuthed`.
 * Returns { authenticated: false } if the JWT is missing or invalid, or if
 * the header/JWT tenant mismatch is detected.
 *
 * CRITICAL CHANGE: this function no longer honours header-supplied identity.
 * Any attacker relying on `x-user-role: ADMIN_SISTEMA` via headers will be
 * treated as unauthenticated.
 */
export async function setupAuthContext(request: NextRequest): Promise<{
  authenticated: boolean;
  user: AuthenticatedUser | null;
  response?: NextResponse;
}> {
  let user: AuthenticatedUser;
  try {
    user = await getAuthenticatedUser(request);
  } catch {
    return { authenticated: false, user: null };
  }

  const tenant = extractTenantContextAuthed(request, user);
  if (tenant instanceof NextResponse) {
    return { authenticated: false, user: null, response: tenant };
  }

  setTenantContext({ companyId: tenant.companyId, userId: tenant.userId });
  return {
    authenticated: true,
    user: { ...user, companyId: tenant.companyId },
  };
}

/**
 * Check permission and return appropriate error response if denied.
 *
 * Consults legacy ROLE_PERMISSIONS first (sync), then falls back to
 * DB-backed custom roles via getUserPermissionsFromDB. Returns null on
 * grant, a 403 NextResponse on denial.
 *
 * Now async — every call site must `await`. Search for `checkPermissionOrError(`
 * in the codebase if you change its signature.
 */
export async function checkPermissionOrError(
  user: AuthenticatedUser,
  entity: EntityType,
  action: Action,
): Promise<NextResponse | null> {
  try {
    // Fast path: legacy matrix
    if (hasPermission(user, entity, action)) return null;
    // Slow path: custom roles in DB
    if (user.companyId) {
      const merged = await getUserPermissionsFromDB(
        user.userId,
        user.companyId,
      );
      const desired = `${entity}:${action}`;
      if (merged.includes("*") || merged.includes(desired)) return null;
    }
    throw new AuthorizationError(user, entity, action);
  } catch (error: unknown) {
    const err = error as { name?: string; toJSON?: () => unknown };
    if (err.name === "AuthorizationError" && err.toJSON) {
      return NextResponse.json(err.toJSON(), { status: 403 });
    }
    return NextResponse.json(
      { error: "Permission check failed", code: "PERMISSION_ERROR" },
      { status: 500 },
    );
  }
}

/**
 * Create unauthorized response
 */
export function unauthorizedResponse(
  message: string = "Authentication required",
): NextResponse {
  return NextResponse.json(
    { error: message, code: "UNAUTHORIZED" },
    { status: 401 },
  );
}

/**
 * Create not found response
 */
export function notFoundResponse(resource: string = "Resource"): NextResponse {
  return NextResponse.json(
    { error: `${resource} not found`, code: "NOT_FOUND" },
    { status: 404 },
  );
}

/**
 * Create validation error response
 */
export function validationErrorResponse(error: unknown): NextResponse {
  if (error instanceof Error && error.name === "ZodError") {
    return NextResponse.json(
      { error: "Validation failed", details: error },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { error: "Invalid input", code: "VALIDATION_ERROR" },
    { status: 400 },
  );
}

/**
 * Generic error response handler
 */
export function handleError(error: unknown, context: string): NextResponse {
  console.error(`Error in ${context}:`, error);

  if (error instanceof Error) {
    // Handle specific error types
    if (error.name === "AuthorizationError") {
      const authError = error as { toJSON?: () => unknown };
      return NextResponse.json(
        authError.toJSON?.() || { error: error.message },
        { status: 403 },
      );
    }
    if (error.name === "TenantAccessDeniedError") {
      return NextResponse.json(
        { error: "Access denied", code: "TENANT_ACCESS_DENIED" },
        { status: 403 },
      );
    }
    if (error.name === "ZodError") {
      return validationErrorResponse(error);
    }
  }

  return NextResponse.json(
    { error: `An error occurred`, code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
