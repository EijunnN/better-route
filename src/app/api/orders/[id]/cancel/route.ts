import { and, eq } from "drizzle-orm";
import { after, type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  orders,
  ORDER_CANCELLATION_CATEGORIES,
  USER_ROLES,
  type OrderCancellationCategory,
} from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { logUpdate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

const CANCEL_ROLES = new Set<keyof typeof USER_ROLES>([
  "PLANIFICADOR",
  "ADMIN_FLOTA",
  "ADMIN_SISTEMA",
]);

const TERMINAL_STATUSES = new Set(["CANCELLED", "COMPLETED"]);

/**
 * POST /api/orders/:id/cancel — terminal definitive cancellation.
 *
 * Issue 005. CANCELLED is irreversible (per ADR-0005). The CSV import
 * preview categorises CANCELLED orders into the "skipped (cancelled)"
 * bucket so they cannot be reactivated through any flow.
 *
 * Authorization: only PLANIFICADOR / ADMIN_FLOTA / ADMIN_SISTEMA can
 * cancel. Conductores y demás roles reciben 403.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.ORDER,
    Action.UPDATE,
  );
  if (authResult instanceof NextResponse) return authResult;
  const tenantCtx = extractTenantContextAuthed(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  setTenantContext(tenantCtx);

  if (!CANCEL_ROLES.has(authResult.role as keyof typeof USER_ROLES)) {
    return NextResponse.json(
      { error: "No tienes permiso para cancelar pedidos definitivamente." },
      { status: 403 },
    );
  }

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

  const existing = await db.query.orders.findFirst({
    where: and(
      eq(orders.id, orderId),
      withTenantFilter(orders, [], tenantCtx.companyId),
    ),
  });
  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (TERMINAL_STATUSES.has(existing.status)) {
    return NextResponse.json(
      {
        error: `Order is already in terminal state ${existing.status} and cannot be cancelled.`,
      },
      { status: 409 },
    );
  }

  const [updated] = await db
    .update(orders)
    .set({
      status: "CANCELLED",
      cancellationReasonCategory:
        reasonCategory as OrderCancellationCategory,
      cancellationReasonNote: reasonNote,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.status, existing.status),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json(
      {
        error:
          "Order status changed since the cancellation request was prepared. Refresh and try again.",
      },
      { status: 409 },
    );
  }

  after(async () => {
    await logUpdate("order", orderId, {
      action: "cancel",
      reasonCategory,
      reasonNote,
      previous: {
        status: existing.status,
      },
    });
  });

  return NextResponse.json({ data: updated });
}
