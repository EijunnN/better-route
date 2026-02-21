/**
 * API Middleware for authorization and audit logging
 *
 * This module provides helper functions for API routes to handle
 * authentication, authorization, and audit logging consistently.
 */

import { type NextRequest, NextResponse } from "next/server";
import { logCreate, logDelete, logUpdate } from "./audit";
import { type AuthenticatedUser, getAuthenticatedUser } from "../auth/auth-api";
import {
  Action,
  checkPermission,
  type EntityType,
  type PermissionCheckResult,
  requirePermission,
} from "../auth/authorization";

/**
 * Middleware result type
 */
export type MiddlewareResult =
  | { success: true; user: AuthenticatedUser }
  | { success: false; response: NextResponse };

/**
 * Extended request with authenticated user
 */
export interface AuthenticatedRequest extends NextRequest {
  user: AuthenticatedUser;
}

/**
 * Wrap an API handler with authentication requirement
 */
export function withAuth(
  handler: (
    request: AuthenticatedRequest,
  ) => Promise<NextResponse> | NextResponse,
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    try {
      const user = await getAuthenticatedUser(request);
      // @ts-expect-error - adding user to request
      request.user = user;
      return await handler(request as AuthenticatedRequest);
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message === "Unauthorized" ||
          error.message.includes("UNAUTHORIZED")
        ) {
          return NextResponse.json(
            { error: "Authentication required", code: "AUTH_REQUIRED" },
            { status: 401 },
          );
        }
      }
      return NextResponse.json(
        { error: "Authentication failed", code: "AUTH_FAILED" },
        { status: 401 },
      );
    }
  };
}

/**
 * Wrap an API handler with permission requirement
 */
export function withPermission(
  entity: EntityType,
  action: Action,
  handler: (
    request: AuthenticatedRequest,
  ) => Promise<NextResponse> | NextResponse,
): (request: NextRequest) => Promise<NextResponse> {
  return withAuth(async (request: AuthenticatedRequest) => {
    try {
      requirePermission(request.user, entity, action);
      return await handler(request);
    } catch (error: unknown) {
      const err = error as { name?: string; toJSON?: () => unknown };
      if (err.name === "AuthorizationError" && err.toJSON) {
        return NextResponse.json(err.toJSON(), { status: 403 });
      }
      throw error;
    }
  });
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
    requirePermission(user, entity, action);
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

/**
 * Optional permission check - returns user if authenticated, null if not, or 403 if forbidden.
 * Use for routes that work with or without authentication but enforce permissions when authenticated.
 */
export async function optionalRoutePermission(
  request: NextRequest,
  entity: EntityType,
  action: Action,
): Promise<AuthenticatedUser | null | NextResponse> {
  try {
    const user = await getAuthenticatedUser(request);
    requirePermission(user, entity, action);
    return user;
  } catch (error: unknown) {
    const err = error as { name?: string; toJSON?: () => unknown };
    if (err.name === "AuthorizationError" && err.toJSON) {
      return NextResponse.json(err.toJSON(), { status: 403 });
    }
    // Not authenticated - return null (optional auth)
    return null;
  }
}

/**
 * Check permissions without throwing - returns check result
 */
export function checkPermissions(
  user: AuthenticatedUser,
  entity: EntityType,
  action: Action,
): PermissionCheckResult {
  return checkPermission(user, entity, action);
}

/**
 * Audit log options
 */
export interface AuditLogOptions {
  entityType: EntityType;
  entityId?: string;
  action?: Action;
  changes?: Record<string, unknown>;
}

/**
 * Wrap a handler with audit logging
 */
export function withAuditLog(
  options: AuditLogOptions,
  handler: (
    request: AuthenticatedRequest,
  ) => Promise<NextResponse> | NextResponse,
): (request: AuthenticatedRequest) => Promise<NextResponse> {
  return async (request: AuthenticatedRequest) => {
    const response = await handler(request);

    // Only log on successful operations
    if (response.status >= 200 && response.status < 300) {
      const auditAction = options.action || Action.CREATE;
      const changes = options.changes || undefined;

      // Determine log type based on action
      switch (auditAction) {
        case Action.CREATE:
          await logCreate(
            options.entityType,
            options.entityId || "unknown",
            changes,
          );
          break;
        case Action.UPDATE:
          await logUpdate(
            options.entityType,
            options.entityId || "unknown",
            changes,
          );
          break;
        case Action.DELETE:
          await logDelete(
            options.entityType,
            options.entityId || "unknown",
            changes,
          );
          break;
      }
    }

    return response;
  };
}

/**
 * Combined middleware: auth + permission + audit log
 */
export function withAuthAndAudit(
  entity: EntityType,
  action: Action,
  handler: (
    request: AuthenticatedRequest,
  ) => Promise<NextResponse> | NextResponse,
): (request: NextRequest) => Promise<NextResponse> {
  return withAuth(async (request: AuthenticatedRequest) => {
    try {
      requirePermission(request.user, entity, action);

      // Extract entity ID from URL if present
      const url = new URL(request.url);
      const pathParts = url.pathname.split("/");
      const entityId = pathParts[pathParts.length - 1];

      const response = await handler(request);

      // Log on success
      if (response.status >= 200 && response.status < 300) {
        switch (action) {
          case Action.CREATE:
            await logCreate(entity, entityId, {});
            break;
          case Action.UPDATE:
            await logUpdate(entity, entityId, {});
            break;
          case Action.DELETE:
            await logDelete(entity, entityId);
            break;
        }
      }

      return response;
    } catch (error: unknown) {
      const err = error as { name?: string; toJSON?: () => unknown };
      if (err.name === "AuthorizationError" && err.toJSON) {
        return NextResponse.json(err.toJSON(), { status: 403 });
      }
      throw error;
    }
  });
}

/**
 * Check if request body contains confirmation for sensitive action
 */
export async function hasConfirmation(request: NextRequest): Promise<boolean> {
  try {
    const body = await request.json();
    return body.confirmed === true;
  } catch {
    return false;
  }
}

/**
 * Require confirmation for sensitive actions
 */
export async function requireConfirmation(
  request: NextRequest,
): Promise<boolean> {
  return await hasConfirmation(request);
}

/**
 * Helper to validate confirmation for sensitive actions
 */
export async function validateSensitiveAction(
  user: AuthenticatedUser,
  entity: EntityType,
  action: Action,
  request: NextRequest,
): Promise<{
  allowed: boolean;
  requiresConfirmation: boolean;
  confirmed: boolean;
}> {
  const check = checkPermission(user, entity, action);

  if (!check.allowed) {
    return { allowed: false, requiresConfirmation: false, confirmed: false };
  }

  if (check.requiresConfirmation) {
    const confirmed = await hasConfirmation(request);
    return { allowed: confirmed, requiresConfirmation: true, confirmed };
  }

  return { allowed: true, requiresConfirmation: false, confirmed: true };
}

/**
 * Response for actions requiring confirmation
 */
export function createConfirmationRequiredResponse(
  entity: EntityType,
  action: Action,
): NextResponse {
  return NextResponse.json(
    {
      error: "Confirmation required",
      code: "CONFIRMATION_REQUIRED",
      entity,
      action,
      message: `This action requires confirmation. Please confirm by sending { confirmed: true } in your request body.`,
    },
    { status: 400 },
  );
}

/**
 * Extract authenticated user from request (after withAuth middleware)
 */
export function getUserFromRequest(
  request: AuthenticatedRequest,
): AuthenticatedUser {
  return request.user;
}
