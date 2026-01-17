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
  companyId: string | null; // null for ADMIN_SISTEMA who can manage all companies
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
 * User roles enum - Unified with schema.ts
 * Legacy roles for backwards compatibility
 * New system uses roles table with dynamic permissions
 */
export { USER_ROLES } from "@/db/schema";
