import type { NextRequest } from "next/server";
import {
  extractTokenFromAuthHeader,
  getCurrentUser,
  verifyToken,
} from "@/lib/auth";
import { AUTH_ERRORS } from "@/lib/validations/auth";

/**
 * Authenticated user information extracted from request
 */
export interface AuthenticatedUser {
  userId: string;
  companyId: string;
  email: string;
  role: string;
}

/**
 * Extract authenticated user from request
 * Supports both cookie-based and Bearer token authentication
 *
 * @param request - Next.js request object
 * @returns Authenticated user information or throws error
 */
export async function getAuthenticatedUser(
  request: NextRequest,
): Promise<AuthenticatedUser> {
  // Try cookies first
  let payload = await getCurrentUser();

  // Fallback to Authorization header
  if (!payload) {
    const authHeader = request.headers.get("authorization");
    const token = extractTokenFromAuthHeader(authHeader);

    if (!token) {
      throw new Error(AUTH_ERRORS.UNAUTHORIZED);
    }

    payload = await verifyToken(token);
  }

  if (!payload || payload.type !== "access") {
    throw new Error(AUTH_ERRORS.UNAUTHORIZED);
  }

  return {
    userId: payload.userId,
    companyId: payload.companyId,
    email: payload.email,
    role: payload.role,
  };
}

/**
 * Optional authentication - returns user if authenticated, null otherwise
 */
export async function getOptionalUser(
  request: NextRequest,
): Promise<AuthenticatedUser | null> {
  try {
    return await getAuthenticatedUser(request);
  } catch {
    return null;
  }
}

/**
 * Check if user has required role
 */
export function hasRole(
  user: AuthenticatedUser,
  allowedRoles: string[],
): boolean {
  return allowedRoles.includes(user.role);
}

/**
 * Check if user has required role, throw error if not
 */
export function requireRole(
  user: AuthenticatedUser,
  allowedRoles: string[],
): void {
  if (!hasRole(user, allowedRoles)) {
    throw new Error("Insufficient permissions");
  }
}

/**
 * User roles enum
 */
export const USER_ROLES = {
  PLANIFICADOR: "PLANIFICADOR",
  MONITOR: "MONITOR",
  ADMIN_FLOTA: "ADMIN_FLOTA",
  ADMIN_SISTEMA: "ADMIN_SISTEMA",
} as const;

/**
 * Role permissions mapping
 * Using readonly string arrays to avoid type issues
 */
export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  PLANIFICADOR: [
    "plans:create",
    "plans:read",
    "plans:update",
    "plans:delete",
    "orders:read",
    "orders:create",
    "drivers:read",
    "vehicles:read",
  ],
  MONITOR: [
    "monitoring:read",
    "drivers:read",
    "vehicles:read",
    "alerts:read",
    "alerts:acknowledge",
  ],
  ADMIN_FLOTA: [
    "fleets:read",
    "fleets:create",
    "fleets:update",
    "fleets:delete",
    "drivers:read",
    "drivers:create",
    "drivers:update",
    "drivers:delete",
    "vehicles:read",
    "vehicles:create",
    "vehicles:update",
    "vehicles:delete",
  ],
  ADMIN_SISTEMA: ["*"],
};

/**
 * Check if user has permission
 */
export function hasPermission(
  user: AuthenticatedUser,
  permission: string,
): boolean {
  const permissions = ROLE_PERMISSIONS[user.role] || [];

  // Check for wildcard permission (admin)
  if (permissions.includes("*")) {
    return true;
  }

  return permissions.includes(permission);
}

/**
 * Require user to have permission, throw error if not
 */
export function requirePermission(
  user: AuthenticatedUser,
  permission: string,
): void {
  if (!hasPermission(user, permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}
