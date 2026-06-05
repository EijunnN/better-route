import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  ORDER_CANCELLATION_CATEGORIES,
  type OrderCancellationCategory,
  orders,
} from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  applyOrderTransition,
  toOrderTransitionHttp,
} from "@/lib/orders/transition";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import { isOrderTerminal } from "@/lib/workflow/order-states";

/**
 * POST /api/orders/:id/cancel — terminal definitive cancellation.
 *
 * Issue 005. CANCELLED is irreversible (ADR-0005). Gated by the typed
 * `order:cancel` permission (no more hardcoded role Set). The transition
 * legality, optimistic lock and append-only audit all live in
 * `applyOrderTransition`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.ORDER,
    Action.CANCEL,
  );
  if (authResult instanceof NextResponse) return authResult;
  const tenantCtx = extractTenantContextAuthed(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  setTenantContext(tenantCtx);

  const { id: orderId } = await params;
  const body = (await request.json().catch(() => null)) as {
    reasonCategory?: unknown;
    reasonNote?: unknown;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reasonCategory =
    typeof body.reasonCategory === "string" ? body.reasonCategory : "";
  const reasonNote =
    typeof body.reasonNote === "string" ? body.reasonNote.trim() : "";

  if (!Object.hasOwn(ORDER_CANCELLATION_CATEGORIES, reasonCategory)) {
    return NextResponse.json(
      {
        error: "reasonCategory is required and must be a valid category",
        validCategories: Object.keys(ORDER_CANCELLATION_CATEGORIES),
      },
      { status: 400 },
    );
  }
  if (!reasonNote) {
    return NextResponse.json(
      { error: "reasonNote is required and must be non-empty" },
      { status: 400 },
    );
  }

  // Terminal orders (CANCELLED/COMPLETED) cannot be cancelled — 409, matching
  // the pre-existing contract (the state machine would otherwise 422/no-op).
  const existing = await db.query.orders.findFirst({
    where: and(
      eq(orders.id, orderId),
      withTenantFilter(orders, [], tenantCtx.companyId),
    ),
    columns: { status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (isOrderTerminal(existing.status)) {
    return NextResponse.json(
      {
        error: `Order is already in terminal state ${existing.status} and cannot be cancelled.`,
      },
      { status: 409 },
    );
  }

  try {
    const { order } = await applyOrderTransition({
      orderId,
      companyId: tenantCtx.companyId,
      to: "CANCELLED",
      source: "cancel",
      reason: reasonNote,
      reasonCategory,
      actorUserId: tenantCtx.userId ?? null,
      statusColumns: {
        cancellationReasonCategory: reasonCategory as OrderCancellationCategory,
        cancellationReasonNote: reasonNote,
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
