import { and, asc, desc, eq, gt } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  CHAT_DIRECTION,
  CHAT_MESSAGE_KIND,
  chatMessages,
  users,
} from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import { isDispatchRole, isQuickReplyCode, sendChatMessage } from "@/lib/chat";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

const LIMIT_DEFAULT = 50;
const LIMIT_MAX = 200;

/** Verify the path driverId is a CONDUCTOR of the tenant. */
async function isTenantDriver(
  driverId: string,
  companyId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, driverId),
        eq(users.companyId, companyId),
        eq(users.role, "CONDUCTOR"),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * GET /api/chat/conversations/:driverId/messages?after=&limit=
 *
 * Thread history. Without `after`, the most recent `limit` messages
 * (ascending). With `after` (an ISO timestamp), everything newer — the
 * cursor a client uses to reconcile after a reconnect.
 *
 * A dispatcher may read any thread of the tenant; a driver only theirs.
 */
export async function GET(
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

  if (!isDispatchRole(authResult.role) && driverId !== authResult.userId) {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 },
    );
  }
  if (!(await isTenantDriver(driverId, tenantCtx.companyId))) {
    return NextResponse.json(
      { error: "Conversación no encontrada", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const { searchParams } = new URL(request.url);
  const after = searchParams.get("after");
  const limit = Math.min(
    parseInt(searchParams.get("limit") || String(LIMIT_DEFAULT), 10) ||
      LIMIT_DEFAULT,
    LIMIT_MAX,
  );

  const scope = and(
    eq(chatMessages.companyId, tenantCtx.companyId),
    eq(chatMessages.driverId, driverId),
  );

  if (after) {
    const afterDate = new Date(after);
    if (Number.isNaN(afterDate.getTime())) {
      return NextResponse.json(
        { error: "Cursor 'after' inválido", code: "BAD_REQUEST" },
        { status: 400 },
      );
    }
    const rows = await db
      .select()
      .from(chatMessages)
      .where(and(scope, gt(chatMessages.createdAt, afterDate)))
      .orderBy(asc(chatMessages.createdAt))
      .limit(LIMIT_MAX);
    return NextResponse.json({ data: rows });
  }

  const recent = await db
    .select()
    .from(chatMessages)
    .where(scope)
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  // Newest-first from the DB, returned oldest-first for top-to-bottom render.
  return NextResponse.json({ data: recent.reverse() });
}

/**
 * POST /api/chat/conversations/:driverId/messages
 *
 * Send a message. The direction is derived from the caller's role — a
 * dispatcher message is TO_DRIVER, a driver message TO_DISPATCH — so the
 * client cannot spoof it. A driver may only post in their own thread.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ driverId: string }> },
) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.CHAT,
    Action.CREATE,
  );
  if (authResult instanceof NextResponse) return authResult;
  const tenantCtx = extractTenantContextAuthed(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  setTenantContext(tenantCtx);

  const { driverId } = await params;
  const dispatch = isDispatchRole(authResult.role);

  if (!dispatch && driverId !== authResult.userId) {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 },
    );
  }
  if (!(await isTenantDriver(driverId, tenantCtx.companyId))) {
    return NextResponse.json(
      { error: "Conversación no encontrada", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    body?: string;
    templateCode?: string;
  } | null;
  const text = body?.body?.trim();
  if (!text) {
    return NextResponse.json(
      { error: "El mensaje no puede estar vacío", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }
  if (body?.templateCode && !isQuickReplyCode(body.templateCode)) {
    return NextResponse.json(
      { error: "templateCode inválido", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const message = await sendChatMessage({
    companyId: tenantCtx.companyId,
    driverId,
    senderId: authResult.userId,
    direction: dispatch ? CHAT_DIRECTION.TO_DRIVER : CHAT_DIRECTION.TO_DISPATCH,
    kind: body?.templateCode
      ? CHAT_MESSAGE_KIND.TEMPLATE
      : CHAT_MESSAGE_KIND.TEXT,
    body: text,
    templateCode: body?.templateCode ?? null,
  });

  return NextResponse.json({ data: message }, { status: 201 });
}
