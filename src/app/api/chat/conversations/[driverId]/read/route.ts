import { type NextRequest, NextResponse } from "next/server";
import { Action, EntityType } from "@/lib/auth/authorization";
import { isDispatchRole, markConversationRead } from "@/lib/chat";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

/**
 * POST /api/chat/conversations/:driverId/read
 *
 * Marks the inbound messages of a conversation read and clears the
 * dispatcher unread counter. Dispatch roles only — `unreadForDispatch`
 * is the dispatch desk's counter.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ driverId: string }> },
) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.CHAT,
    Action.READ,
  );
  if (authResult instanceof NextResponse) return authResult;

  if (!isDispatchRole(authResult.role)) {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const tenantCtx = extractTenantContextAuthed(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  setTenantContext(tenantCtx);

  const { driverId } = await params;
  await markConversationRead(tenantCtx.companyId, driverId);

  return NextResponse.json({ ok: true });
}
