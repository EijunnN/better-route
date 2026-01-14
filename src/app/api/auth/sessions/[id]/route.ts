import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-api";
import { Action, authorize, EntityType } from "@/lib/authorization";
import { getSession, invalidateSession } from "@/lib/session";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/auth/sessions/[id]
 * Get a specific session by ID
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser(request);
    const { id: sessionId } = await context.params;

    const session = await getSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Users can only view their own sessions
    if (session.userId !== user.userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({
      sessionId: session.sessionId,
      createdAt: new Date(session.createdAt).toISOString(),
      lastActivityAt: new Date(session.lastActivityAt).toISOString(),
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get session" },
      { status: 401 },
    );
  }
}

/**
 * DELETE /api/auth/sessions/[id]
 * Invalidate a specific session
 * Users can invalidate their own sessions
 * Admins can invalidate any session
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser(request);
    const { id: sessionId } = await context.params;

    const session = await getSession(sessionId);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Check permission: users can invalidate their own sessions
    // admins can invalidate any session
    const canInvalidate =
      session.userId === user.userId ||
      authorize(user, EntityType.SESSION, Action.DELETE, session.userId);

    if (!canInvalidate) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    await invalidateSession(sessionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to invalidate session" },
      { status: 401 },
    );
  }
}
