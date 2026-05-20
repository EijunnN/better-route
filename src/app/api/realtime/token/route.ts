import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/auth-api";
import { issueCentrifugoToken } from "@/lib/realtime";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

// Reads the session cookie — never cacheable.
export const dynamic = "force-dynamic";

/**
 * GET /api/realtime/token
 *
 * Issues a short-lived (15 min) Centrifugo connection JWT for the
 * authenticated user. The client SDK calls this on connect and again
 * before expiry via its `getToken` callback — the refresh is transparent
 * to the user. See ADR-0007.
 *
 * The token's `channels` claim is derived from the caller's role, so a
 * driver can never receive a token that subscribes them to monitoring.
 */
export async function GET(request: NextRequest) {
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser(request);
  } catch {
    return NextResponse.json(
      { error: "Authentication required", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  // Resolves the effective company — for ADMIN_SISTEMA this requires the
  // x-company-id header, for everyone else the JWT companyId is used.
  const tenant = extractTenantContextAuthed(request, user);
  if (tenant instanceof NextResponse) return tenant;

  try {
    const token = await issueCentrifugoToken({
      userId: user.userId,
      role: user.role,
      companyId: tenant.companyId,
    });
    return NextResponse.json({ token });
  } catch (err) {
    console.error("[realtime/token] issuance failed:", err);
    return NextResponse.json(
      { error: "Token issuance failed", code: "TOKEN_ERROR" },
      { status: 500 },
    );
  }
}
