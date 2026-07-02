import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  extractTokenFromAuthHeader,
  getCurrentUser,
  verifyToken,
} from "@/lib/auth/auth";
import { getUserPermissionsFromDB } from "@/lib/auth/authorization";
import { withContractHeader } from "@/lib/mobile-contract";
import { AUTH_ERRORS } from "@/lib/validations/auth";

/**
 * GET /api/auth/me
 *
 * Get current authenticated user information
 * Supports both cookie-based and Bearer token authentication
 */
async function handleGet(request: NextRequest) {
  try {
    // Try to get user from cookies first
    let payload = await getCurrentUser();

    // If no cookie, try Authorization header
    if (!payload) {
      const authHeader = request.headers.get("authorization");
      const token = extractTokenFromAuthHeader(authHeader);

      if (token) {
        payload = await verifyToken(token);
      }
    }

    if (!payload || payload.type !== "access") {
      return NextResponse.json(
        { error: AUTH_ERRORS.UNAUTHORIZED },
        { status: 401 },
      );
    }

    // Get full user details from database
    const userResult = await db
      .select({
        id: users.id,
        companyId: users.companyId,
        email: users.email,
        name: users.name,
        role: users.role,
        active: users.active,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    const user = userResult[0];

    if (!user || !user.active) {
      return NextResponse.json(
        { error: AUTH_ERRORS.USER_INACTIVE },
        { status: 403 },
      );
    }

    // Get user permissions from database
    const permissions = await getUserPermissionsFromDB(user.id, user.companyId);

    return NextResponse.json({
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
      permissions,
    });
  } catch (error) {
    console.error("Get current user error:", error);
    return NextResponse.json(
      { error: "Error al obtener información del usuario" },
      { status: 500 },
    );
  }
}

export const GET = withContractHeader(handleGet);
