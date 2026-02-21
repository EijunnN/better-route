import { type NextRequest, NextResponse } from "next/server";
import { clearAuthCookies, invalidateCurrentSession } from "@/lib/auth/auth";

/**
 * POST /api/auth/logout
 *
 * Logout the current user by invalidating the Redis session
 * and clearing all authentication cookies.
 */
export async function POST(_request: NextRequest) {
  try {
    // Invalidate Redis session + clear session cookie
    await invalidateCurrentSession();

    // Clear authentication cookies (access + refresh tokens)
    await clearAuthCookies();

    return NextResponse.json({
      success: true,
      message: "Sesión cerrada correctamente",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "Error al cerrar sesión" },
      { status: 500 },
    );
  }
}
