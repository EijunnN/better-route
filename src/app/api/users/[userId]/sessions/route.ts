import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-api";
import { Action, authorize, EntityType } from "@/lib/authorization";
import { getUserSessions, invalidateUserSessions } from "@/lib/session";

interface RouteContext {
  params: Promise<{ userId: string }>;
}

/**
 * GET /api/users/[userId]/sessions
 * Get all sessions for a specific user
 * Users can view their own sessions
 * Admins can view any user's sessions
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser(request);
    const { userId } = await context.params;

    // Check permission: users can view their own sessions
    // admins can view any user's sessions
    const canView =
      user.userId === userId ||
      authorize(user, EntityType.USER, Action.READ, userId);

    if (!canView) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const sessions = await getUserSessions(userId);

    return NextResponse.json({
      userId,
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        createdAt: new Date(s.createdAt).toISOString(),
        lastActivityAt: new Date(s.lastActivityAt).toISOString(),
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
      })),
      count: sessions.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get user sessions" },
      { status: 401 },
    );
  }
}

/**
 * DELETE /api/users/[userId]/sessions
 * Invalidate all sessions for a specific user
 * Users can invalidate their own sessions
 * Admins can invalidate any user's sessions
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser(request);
    const { userId } = await context.params;

    // Check permission: users can invalidate their own sessions
    // admins can invalidate any user's sessions
    const canInvalidate =
      user.userId === userId ||
      authorize(user, EntityType.USER, Action.INVALIDATE_SESSIONS, userId);

    if (!canInvalidate) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    await invalidateUserSessions(userId);

    return NextResponse.json({
      success: true,
      message: `All sessions invalidated for user ${userId}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to invalidate user sessions" },
      { status: 401 },
    );
  }
}
