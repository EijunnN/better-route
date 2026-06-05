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
 * POST /api/orders/:id/unassign — pull an ASSIGNED order out of a confirmed
 * plan back to PENDING, atomically deleting its not-yet-started route stop(s)
 * so plan and execution never diverge. Gated by the elevated order:revert.
 *
 * Only PENDING stops are removed (they carry no delivery_visits); if the
 * driver has already started/finished the stop the order is no longer
 * ASSIGNED and the expectedFrom guard rejects the unassign with a 409.
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
    const { order, applied } = await applyOrderTransition({
      orderId,
      companyId: tenantCtx.companyId,
      to: "PENDING",
      expectedFrom: "ASSIGNED",
      source: "unassign",
      reason,
      actorUserId: tenantCtx.userId ?? null,
      correlationId,
      effects: async (tx) => {
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
    return NextResponse.json({ data: order, applied });
  } catch (error) {
    const mapped = toOrderTransitionHttp(error);
    if (mapped) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    throw error;
  }
}
