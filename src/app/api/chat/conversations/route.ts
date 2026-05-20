import { desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatConversations, users } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import { isDispatchRole } from "@/lib/chat";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

/**
 * GET /api/chat/conversations
 *
 * The dispatcher inbox — every driver conversation of the tenant, most
 * recent first, with unread counts. Dispatch roles only: a driver has
 * no inbox, only their own thread.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.CHAT,
    Action.READ,
  );
  if (authResult instanceof NextResponse) return authResult;

  if (!isDispatchRole(authResult.role)) {
    return NextResponse.json(
      {
        error: "Solo el escritorio de despacho tiene bandeja",
        code: "FORBIDDEN",
      },
      { status: 403 },
    );
  }

  const tenantCtx = extractTenantContextAuthed(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  setTenantContext(tenantCtx);

  const rows = await db
    .select({
      id: chatConversations.id,
      driverId: chatConversations.driverId,
      driverName: users.name,
      lastMessageAt: chatConversations.lastMessageAt,
      lastMessagePreview: chatConversations.lastMessagePreview,
      unreadForDispatch: chatConversations.unreadForDispatch,
    })
    .from(chatConversations)
    .leftJoin(users, eq(chatConversations.driverId, users.id))
    .where(eq(chatConversations.companyId, tenantCtx.companyId))
    .orderBy(desc(chatConversations.lastMessageAt));

  return NextResponse.json({ data: rows });
}
