import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { routeStops } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  applyOrderTransition,
  toOrderTransitionHttp,
} from "@/lib/orders/transition";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

/**
 * POST /api/orders/:id/revert — privileged reversion of an order back to
 * PENDING so it can be re-planned. Unlike /reactivate (FAILED only,
 * order:update), this can undo a COMPLETED delivery and therefore demands the
 * elevated order:revert permission. CANCELLED stays definitively irreversible
 * (ADR-0005) — the state machine rejects it even on this privileged path.
 *
 * The historical COMPLETED/FAILED route_stop and its delivery_visit are left
 * intact (immutable audit); the next optimization run creates a fresh attempt.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.ORDER,
    Action.REVERT,
  );
  if (authResult instanceof NextResponse) return authResult;
  const tenantCtx = extractTenantContextAuthed(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  setTenantContext(tenantCtx);

  const { id: orderId } = await params;
  const body = (await request.json().catch(() => null)) as {
    reason?: unknown;
    correlationId?: unknown;
  } | null;

  const reason =
    body && typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json(
      { error: "reason is required and must be non-empty" },
      { status: 400 },
    );
  }
  const correlationId =
    body && typeof body.correlationId === "string" ? body.correlationId : null;
  if (
    correlationId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      correlationId,
    )
  ) {
    return NextResponse.json(
      { error: "correlationId must be a UUID" },
      { status: 400 },
    );
  }

  try {
    const { order } = await applyOrderTransition({
      orderId,
      companyId: tenantCtx.companyId,
      to: "PENDING",
      source: "revert",
      privileged: true,
      reason,
      actorUserId: tenantCtx.userId ?? null,
      correlationId,
      effects: async (tx) => {
        // Drop any not-yet-started stop so reverting an ASSIGNED order (or one
        // mid-replan) leaves no orphan PENDING stop. A COMPLETED order has no
        // PENDING stop, so this is a no-op there.
        await tx
          .delete(routeStops)
          .where(
            and(
              eq(routeStops.orderId, orderId),
              eq(routeStops.companyId, tenantCtx.companyId),
              eq(routeStops.status, "PENDING"),
            ),
          );
      },
    });
    return NextResponse.json({ data: order });
  } catch (error) {
    const mapped = toOrderTransitionHttp(error);
    if (mapped) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    throw error;
  }
}
