import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getAuthenticatedUser } from "@/lib/auth/auth-api";
import {
  Action,
  authorize,
  EntityType,
  isAdmin,
} from "@/lib/auth/authorization";
import { getUserSessions, invalidateUserSessions } from "@/lib/auth/session";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/users/[id]/sessions
 * Get all sessions for a specific user
 * Users can view their own sessions
 * Admins can view any user's sessions
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser(request);
    const { id: userId } = await context.params;

    // Check permission: users can view their own sessions
    // admins can view any user's sessions
    const canView =
      user.userId === userId ||
      authorize(user, EntityType.USER, Action.READ, userId);

    if (!canView) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Cross-tenant guard: a non-self requester (who passed the permission
    // check above) may still only view sessions of users in their own
    // company, unless they are a system admin.
    if (user.userId !== userId && !isAdmin(user)) {
      if (!user.companyId) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      const [targetUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.companyId, user.companyId)))
        .limit(1);

      if (!targetUser) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
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
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to get user sessions" },
      { status: 401 },
    );
  }
}

/**
 * DELETE /api/users/[id]/sessions
 * Invalidate all sessions for a specific user
 * Users can invalidate their own sessions
 * Admins can invalidate any user's sessions
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser(request);
    const { id: userId } = await context.params;

    // Check permission: users can invalidate their own sessions
    // admins can invalidate any user's sessions
    const canInvalidate =
      user.userId === userId ||
      authorize(user, EntityType.USER, Action.INVALIDATE_SESSIONS, userId);

    if (!canInvalidate) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Cross-tenant guard: a non-self requester (who passed the permission
    // check above) may still only invalidate sessions of users in their own
    // company, unless they are a system admin.
    if (user.userId !== userId && !isAdmin(user)) {
      if (!user.companyId) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      const [targetUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.companyId, user.companyId)))
        .limit(1);

      if (!targetUser) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    await invalidateUserSessions(userId);

    return NextResponse.json({
      success: true,
      message: `All sessions invalidated for user ${userId}`,
    });
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to invalidate user sessions" },
      { status: 401 },
    );
  }
}
