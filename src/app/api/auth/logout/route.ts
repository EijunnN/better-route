import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { USER_ROLES, users } from "@/db/schema";
import {
  clearAuthCookies,
  invalidateCurrentSession,
  verifyToken,
} from "@/lib/auth/auth";
import { getOptionalUser } from "@/lib/auth/auth-api";
import { invalidateSession } from "@/lib/auth/session";
import { withContractHeader } from "@/lib/mobile-contract";

/**
 * POST /api/auth/logout
 *
 * Logout the current user by invalidating the Redis session and
 * clearing all authentication cookies.
 *
 * Bearer clients (mobile) carry no `session_id` cookie, so the
 * cookie-based invalidation is a no-op for them. Per the mobile
 * contract [FIX-8], they send `{ refreshToken }` in the body; we
 * derive the sessionId from the verified token and revoke it in
 * Redis so the refresh token dies with the logout.
 *
 * For drivers, this also flips `users.appOnline` to false so the
 * monitoring dashboard reflects the logout immediately, rather than
 * waiting out the GPS recency window (see ADR-0007 / the logout gap).
 */
async function handlePost(request: NextRequest) {
  try {
    // Resolve the user before the session is invalidated.
    const user = await getOptionalUser(request);
    if (user?.role === USER_ROLES.CONDUCTOR) {
      await db
        .update(users)
        .set({ appOnline: false })
        .where(eq(users.id, user.userId));
    }

    await invalidateSessionFromBody(request);
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

export const POST = withContractHeader(handlePost);

/**
 * [FIX-8] Revoke the Redis session referenced by a `{ refreshToken }`
 * body. Best-effort: a missing/invalid body never fails the logout
 * (the contract mandates 200 always).
 */
async function invalidateSessionFromBody(request: NextRequest): Promise<void> {
  const body = await request.json().catch(() => null);
  const refreshToken = body?.refreshToken;
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    return;
  }

  const payload = await verifyToken(refreshToken);
  if (payload?.type === "refresh" && payload.sessionId) {
    await invalidateSession(payload.sessionId);
  }
}
