import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import { isDispatchRole } from "@/lib/chat";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { withContractHeader } from "@/lib/mobile-contract";
import {
  centrifugoChannels,
  issueCentrifugoSubscriptionToken,
} from "@/lib/realtime";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

export const dynamic = "force-dynamic";

/**
 * `chat:{companyId}:driver:{driverId}` — the only channel pattern this
 * endpoint will mint. Anchored on both ends so a sneaky prefix or
 * suffix cannot widen access.
 */
const CHAT_THREAD_RE = /^chat:([^:]+):driver:([^:]+)$/;

/**
 * GET /api/realtime/subscription-token?channel=...
 *
 * Mints a short-lived Centrifugo subscription JWT for a single chat
 * thread. The dispatcher's connection token only auto-subscribes them
 * to the company-wide channels (monitoring, inbox, broadcast); opening
 * a thread asks for a per-channel token so a leak only exposes one
 * conversation and only for a few minutes.
 *
 * Validates that the caller is a dispatcher of the channel's tenant
 * and that the driverId is a real CONDUCTOR of that tenant — every
 * piece of the channel name is checked, not just the namespace.
 */
async function handleGet(request: NextRequest) {
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

  const tenant = extractTenantContextAuthed(request, authResult);
  if (tenant instanceof NextResponse) return tenant;

  const channel = new URL(request.url).searchParams.get("channel");
  if (!channel) {
    return NextResponse.json(
      { error: "Missing 'channel'", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const match = CHAT_THREAD_RE.exec(channel);
  if (!match) {
    return NextResponse.json(
      {
        error: "Only per-driver chat channels can be requested here",
        code: "UNSUPPORTED_CHANNEL",
      },
      { status: 400 },
    );
  }

  const [, channelCompanyId, driverId] = match;

  if (channelCompanyId !== tenant.companyId) {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const [driver] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, driverId),
        eq(users.companyId, tenant.companyId),
        eq(users.role, "CONDUCTOR"),
      ),
    )
    .limit(1);

  if (!driver) {
    return NextResponse.json(
      { error: "Conversación no encontrada", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  try {
    const token = await issueCentrifugoSubscriptionToken({
      userId: authResult.userId,
      channel: centrifugoChannels.driverChat(tenant.companyId, driverId),
    });
    return NextResponse.json({ token });
  } catch (err) {
    console.error("[realtime/subscription-token] issuance failed:", err);
    return NextResponse.json(
      { error: "Token issuance failed", code: "TOKEN_ERROR" },
      { status: 500 },
    );
  }
}

export const GET = withContractHeader(handleGet);
