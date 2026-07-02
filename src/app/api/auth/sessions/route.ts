import { type NextRequest, NextResponse } from "next/server";
import { getSessionId } from "@/lib/auth/auth";
import { getAuthenticatedUser } from "@/lib/auth/auth-api";
import { getUserSessions } from "@/lib/auth/session";

/**
 * GET /api/auth/sessions
 * Get all active sessions for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    // Bearer-only requests carry no session cookie: currentSessionId is
    // undefined and every row reports isCurrent: false (access tokens
    // don't embed the sessionId).
    const [sessions, currentSessionId] = await Promise.all([
      getUserSessions(user.userId),
      getSessionId(),
    ]);

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        createdAt: new Date(s.createdAt).toISOString(),
        lastActivityAt: new Date(s.lastActivityAt).toISOString(),
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        isCurrent: s.sessionId === currentSessionId,
      })),
      count: sessions.length,
    });
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to get sessions" },
      { status: 401 },
    );
  }
}
