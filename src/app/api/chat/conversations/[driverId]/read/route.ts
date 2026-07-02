import { type NextRequest, NextResponse } from "next/server";
import { Action, EntityType } from "@/lib/auth/authorization";
import {
  isDispatchRole,
  markConversationRead,
  markDriverThreadRead,
} from "@/lib/chat";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { withContractHeader } from "@/lib/mobile-contract";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

/**
 * POST /api/chat/conversations/:driverId/read
 *
 * Read receipts en ambos sentidos:
 * - Dispatch: marca leídos los mensajes driver→despacho y limpia el
 *   contador `unreadForDispatch` (comportamiento original).
 * - CONDUCTOR (solo su propio hilo): marca leídos los mensajes
 *   despacho→driver — la base del "Leído" que ve el despachador.
 */
async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ driverId: string }> },
) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.CHAT,
    Action.READ,
  );
  if (authResult instanceof NextResponse) return authResult;

  const tenantCtx = extractTenantContextAuthed(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  setTenantContext(tenantCtx);

  const { driverId } = await params;

  if (isDispatchRole(authResult.role)) {
    await markConversationRead(tenantCtx.companyId, driverId);
    return NextResponse.json({ ok: true });
  }

  // Driver: solo puede marcar leído SU propio hilo.
  if (authResult.role === "CONDUCTOR" && driverId === authResult.userId) {
    await markDriverThreadRead(tenantCtx.companyId, driverId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: "Forbidden", code: "FORBIDDEN" },
    { status: 403 },
  );
}

export const POST = withContractHeader(handlePost);
