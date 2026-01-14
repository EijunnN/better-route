import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-api";
import { Action, authorize, EntityType } from "@/lib/authorization";
import { invalidateAllSessions } from "@/lib/session";

/**
 * POST /api/auth/sessions/invalidate-all
 * Invalidate ALL sessions globally (admin emergency action)
 * Only ADMIN_SISTEMA role can perform this action
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    // Only system admins can invalidate all sessions
    const canInvalidateAll = authorize(
      user,
      EntityType.SESSION,
      Action.INVALIDATE_ALL,
    );

    if (!canInvalidateAll) {
      return NextResponse.json(
        {
          error:
            "Access denied. Only system administrators can perform this action.",
        },
        { status: 403 },
      );
    }

    const count = await invalidateAllSessions();

    return NextResponse.json({
      success: true,
      message: `Invalidated ${count} sessions`,
      count,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to invalidate all sessions" },
      { status: 401 },
    );
  }
}
