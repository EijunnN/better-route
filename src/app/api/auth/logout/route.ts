import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { USER_ROLES, users } from "@/db/schema";
import { clearAuthCookies, invalidateCurrentSession } from "@/lib/auth/auth";
import { getOptionalUser } from "@/lib/auth/auth-api";

/**
 * POST /api/auth/logout
 *
 * Logout the current user by invalidating the Redis session and
 * clearing all authentication cookies.
 *
 * For drivers, this also flips `users.appOnline` to false so the
 * monitoring dashboard reflects the logout immediately, rather than
 * waiting out the GPS recency window (see ADR-0007 / the logout gap).
 */
export async function POST(request: NextRequest) {
  try {
    // Resolve the user before the session is invalidated.
    const user = await getOptionalUser(request);
    if (user?.role === USER_ROLES.CONDUCTOR) {
      await db
        .update(users)
        .set({ appOnline: false })
        .where(eq(users.id, user.userId));
    }

    await invalidateCurrentSession();
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
