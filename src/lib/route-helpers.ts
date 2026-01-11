/**
 * Route helper utilities for consistent API route handling
 *
 * This module provides helper functions that bridge the existing
 * tenant-based authentication with the new RBAC permission system.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, AuthenticatedUser } from "./auth-api";
import { EntityType, Action, requirePermission } from "./authorization";
import { setTenantContext } from "./tenant";

/**
 * Extract user context from request headers or JWT token
 * This is a bridge function for routes that still use header-based auth
 */
export function extractUserContext(request: NextRequest): {
  companyId: string | null;
  userId: string | null;
  email: string | null;
  role: string | null;
} {
  // Try to get from headers first (existing pattern)
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  const email = request.headers.get("x-user-email");
  const role = request.headers.get("x-user-role");

  // If we have all the context from headers, use it
  if (companyId && userId && email && role) {
    return { companyId, userId, email, role };
  }

  // Return null context - JWT token verification will be done in async setupAuthContext
  return {
    companyId: null,
    userId: null,
    email: null,
    role: null,
  };
}

/**
 * Set up tenant context from request and check authentication
 * Returns user info or null if not authenticated
 */
export async function setupAuthContext(request: NextRequest): Promise<{
  authenticated: boolean;
  user: AuthenticatedUser | null;
}> {
  const context = extractUserContext(request);

  // If we have context from headers, use it
  if (context.companyId) {
    const user: AuthenticatedUser = {
      userId: context.userId || "",
      companyId: context.companyId,
      email: context.email || "",
      role: context.role || "",
    };

    // Set tenant context
    setTenantContext({
      companyId: context.companyId,
      userId: context.userId || undefined,
    });

    return { authenticated: true, user };
  }

  // Fallback: try JWT token verification
  try {
    const user = await getAuthenticatedUser(request);

    // Set tenant context from JWT
    setTenantContext({
      companyId: user.companyId,
      userId: user.userId,
    });

    return { authenticated: true, user };
  } catch {
    return { authenticated: false, user: null };
  }
}

/**
 * Check permission and return appropriate error response if denied
 */
export function checkPermissionOrError(
  user: AuthenticatedUser,
  entity: EntityType,
  action: Action
): NextResponse | null {
  try {
    requirePermission(user, entity, action);
    return null; // Permission granted
  } catch (error: any) {
    if (error.name === "AuthorizationError") {
      return NextResponse.json(error.toJSON(), { status: 403 });
    }
    return NextResponse.json(
      { error: "Permission check failed", code: "PERMISSION_ERROR" },
      { status: 500 }
    );
  }
}

/**
 * Create unauthorized response
 */
export function unauthorizedResponse(message: string = "Authentication required"): NextResponse {
  return NextResponse.json(
    { error: message, code: "UNAUTHORIZED" },
    { status: 401 }
  );
}

/**
 * Create not found response
 */
export function notFoundResponse(resource: string = "Resource"): NextResponse {
  return NextResponse.json(
    { error: `${resource} not found`, code: "NOT_FOUND" },
    { status: 404 }
  );
}

/**
 * Create validation error response
 */
export function validationErrorResponse(error: unknown): NextResponse {
  if (error instanceof Error && error.name === "ZodError") {
    return NextResponse.json(
      { error: "Validation failed", details: error },
      { status: 400 }
    );
  }
  return NextResponse.json(
    { error: "Invalid input", code: "VALIDATION_ERROR" },
    { status: 400 }
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
      return NextResponse.json((error as any).toJSON?.() || { error: error.message }, { status: 403 });
    }
    if (error.name === "TenantAccessDeniedError") {
      return NextResponse.json(
        { error: "Access denied", code: "TENANT_ACCESS_DENIED" },
        { status: 403 }
      );
    }
    if (error.name === "ZodError") {
      return validationErrorResponse(error);
    }
  }

  return NextResponse.json(
    { error: `An error occurred`, code: "INTERNAL_ERROR" },
    { status: 500 }
  );
}
