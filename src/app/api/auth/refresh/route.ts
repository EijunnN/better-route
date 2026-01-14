import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  generateTokenPair,
  getRefreshToken,
  setAuthCookies,
  verifyToken,
} from "@/lib/auth";
import { AUTH_ERRORS } from "@/lib/validations/auth";

/**
 * POST /api/auth/refresh
 *
 * Refresh access token using a valid refresh token
 * Returns a new access token (and optionally a new refresh token)
 */
export async function POST(request: NextRequest) {
  try {
    // Get refresh token from cookie or request body
    const cookieToken = await getRefreshToken();

    let refreshToken = cookieToken;

    // Try to get from body if not in cookie
    if (!refreshToken) {
      try {
        const body = await request.json();
        refreshToken = body.refreshToken;
      } catch {
        // Body might be empty
      }
    }

    if (!refreshToken) {
      return NextResponse.json(
        { error: AUTH_ERRORS.INVALID_TOKEN },
        { status: 401 },
      );
    }

    // Verify refresh token
    const payload = await verifyToken(refreshToken);

    if (!payload || payload.type !== "refresh") {
      return NextResponse.json(
        { error: AUTH_ERRORS.INVALID_TOKEN },
        { status: 401 },
      );
    }

    // Get user from database
    const userResult = await db
      .select({
        id: users.id,
        companyId: users.companyId,
        email: users.email,
        name: users.name,
        role: users.role,
        active: users.active,
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

    // Generate new token pair
    const tokens = await generateTokenPair({
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      role: user.role,
    });

    // Set new cookies
    await setAuthCookies(tokens.accessToken, tokens.refreshToken);

    return NextResponse.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return NextResponse.json(
      { error: "Error al refrescar token" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/auth/refresh
 *
 * Refresh access token via GET (for convenience in polling scenarios)
 */
export async function GET(request: NextRequest) {
  return POST(request);
}
