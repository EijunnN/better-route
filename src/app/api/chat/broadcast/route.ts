import { type NextRequest, NextResponse } from "next/server";
import { Action, EntityType } from "@/lib/auth/authorization";
import { broadcastChatMessage, isDispatchRole } from "@/lib/chat";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

/**
 * POST /api/chat/broadcast
 *
 * Emergency message to every driver of the tenant — one row per driver
 * so it lands in each thread, plus a single publish to the broadcast
 * channel. Dispatch roles only.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.CHAT,
    Action.CREATE,
  );
  if (authResult instanceof NextResponse) return authResult;

  if (!isDispatchRole(authResult.role)) {
    return NextResponse.json(
      {
        error: "Solo el escritorio de despacho puede emitir broadcasts",
        code: "FORBIDDEN",
      },
      { status: 403 },
    );
  }

  const tenantCtx = extractTenantContextAuthed(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  setTenantContext(tenantCtx);

  const body = (await request.json().catch(() => null)) as {
    body?: string;
  } | null;
  const text = body?.body?.trim();
  if (!text) {
    return NextResponse.json(
      { error: "El mensaje no puede estar vacío", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const reached = await broadcastChatMessage({
    companyId: tenantCtx.companyId,
    senderId: authResult.userId,
    body: text,
  });

  return NextResponse.json({ ok: true, reached });
}
