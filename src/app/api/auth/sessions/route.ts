import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-api";
import { getUserSessions } from "@/lib/session";

/**
 * GET /api/auth/sessions
 * Get all active sessions for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    // Get user's sessions
    const sessions = await getUserSessions(user.userId);

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        createdAt: new Date(s.createdAt).toISOString(),
        lastActivityAt: new Date(s.lastActivityAt).toISOString(),
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        isCurrent: true, // TODO: Compare with current session ID
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
