import { and, asc, desc, eq, sql } from "drizzle-orm";
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
import { withContractHeader } from "@/lib/mobile-contract";
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
 * GET /api/chat/conversations/:driverId/messages?after=&before=&limit=
 *
 * Thread history. Three modes, mutually exclusive:
 *   - no cursor:  the most recent `limit` messages (ascending render).
 *   - `after=id`: everything strictly newer than the cursor — reconnect
 *                 reconciliation, no count limit beyond LIMIT_MAX.
 *   - `before=id`: the `limit` messages strictly older than the cursor,
 *                 oldest-first — scroll-back pagination.
 *
 * Cursors are message ids, not timestamps: the client only sees
 * millisecond-precision dates, so a timestamp cursor would re-deliver
 * the boundary message every time.
 *
 * A dispatcher may read any thread of the tenant; a driver only theirs.
 */
async function handleGet(
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
  const before = searchParams.get("before");
  const limit = Math.min(
    parseInt(searchParams.get("limit") || String(LIMIT_DEFAULT), 10) ||
      LIMIT_DEFAULT,
    LIMIT_MAX,
  );

  if (after && before) {
    return NextResponse.json(
      {
        error: "Usa 'after' o 'before', no ambos",
        code: "BAD_REQUEST",
      },
      { status: 400 },
    );
  }

  const scope = and(
    eq(chatMessages.companyId, tenantCtx.companyId),
    eq(chatMessages.driverId, driverId),
  );

  if (after || before) {
    const cursorId = (after ?? before) as string;
    // Resolve the cursor row. `created_at` is read as text so its
    // microsecond precision survives — a JS Date would truncate to
    // milliseconds and the boundary message would leak back in.
    const [cursor] = await db
      .select({
        createdAt: sql<string>`${chatMessages.createdAt}::text`,
        id: chatMessages.id,
      })
      .from(chatMessages)
      .where(and(scope, eq(chatMessages.id, cursorId)))
      .limit(1);
    if (!cursor) {
      return NextResponse.json(
        {
          error: `Cursor '${after ? "after" : "before"}' inválido`,
          code: "BAD_REQUEST",
        },
        { status: 400 },
      );
    }
    // Keyset comparison runs entirely in Postgres (no JS round-trip),
    // so the (created_at, id) tuple is compared at full precision.
    if (after) {
      const rows = await db
        .select()
        .from(chatMessages)
        .where(
          and(
            scope,
            sql`(${chatMessages.createdAt}, ${chatMessages.id}) > (${cursor.createdAt}::timestamp, ${cursor.id}::uuid)`,
          ),
        )
        .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
        .limit(LIMIT_MAX);
      return NextResponse.json({ data: rows });
    }
    // before: fetch the `limit` older messages, newest-first from the DB
    // (so the LIMIT cuts off the oldest, not the newest), then reverse
    // so the client appends them oldest-first above the existing window.
    const rows = await db
      .select()
      .from(chatMessages)
      .where(
        and(
          scope,
          sql`(${chatMessages.createdAt}, ${chatMessages.id}) < (${cursor.createdAt}::timestamp, ${cursor.id}::uuid)`,
        ),
      )
      .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
      .limit(limit);
    return NextResponse.json({ data: rows.reverse() });
  }

  const recent = await db
    .select()
    .from(chatMessages)
    .where(scope)
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
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
async function handlePost(
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

export const GET = withContractHeader(handleGet);
export const POST = withContractHeader(handlePost);
