import { and, eq } from "drizzle-orm";
import { after, type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { logUpdate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

/**
 * POST /api/orders/:id/reactivate — cross-day reactivation of a FAILED Order.
 *
 * Issue 004. Flips Order.status FAILED → PENDING so it joins the next
 * planning batch. Optional overrides patch the Order's
 * address/coordinates/time-window/promised-date/notes columns.
 *
 * No RouteStop is created here — the next optimization run produces it
 * with `attempt_number = priorVisitCount + 1` (issue 001).
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

  const { id: orderId } = await params;
  const body = (await request.json().catch(() => null)) as {
    reason?: unknown;
    addressOverride?: unknown;
    latitudeOverride?: unknown;
    longitudeOverride?: unknown;
    timeWindowStartOverride?: unknown;
    timeWindowEndOverride?: unknown;
    promisedDateOverride?: unknown;
    notesOverride?: unknown;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json(
      { error: "reason is required and must be non-empty" },
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
  if (existing.status !== "FAILED") {
    return NextResponse.json(
      {
        error: `Cannot reactivate an order in status ${existing.status}. Only FAILED orders can be reactivated.`,
      },
      { status: 409 },
    );
  }

  const changed: Record<string, unknown> = {};
  const update: Partial<typeof orders.$inferInsert> = {
    status: "PENDING",
    updatedAt: new Date(),
  };

  if (typeof body.addressOverride === "string" && body.addressOverride) {
    update.address = body.addressOverride;
    changed.address = body.addressOverride;
  }
  if (typeof body.latitudeOverride === "string" && body.latitudeOverride) {
    update.latitude = body.latitudeOverride;
    changed.latitude = body.latitudeOverride;
  }
  if (typeof body.longitudeOverride === "string" && body.longitudeOverride) {
    update.longitude = body.longitudeOverride;
    changed.longitude = body.longitudeOverride;
  }
  // Order.timeWindowStart/End are `time` columns — Drizzle accepts an
  // "HH:MM" or "HH:MM:SS" string verbatim.
  if (
    typeof body.timeWindowStartOverride === "string" &&
    body.timeWindowStartOverride
  ) {
    update.timeWindowStart = body.timeWindowStartOverride;
    changed.timeWindowStart = body.timeWindowStartOverride;
  }
  if (
    typeof body.timeWindowEndOverride === "string" &&
    body.timeWindowEndOverride
  ) {
    update.timeWindowEnd = body.timeWindowEndOverride;
    changed.timeWindowEnd = body.timeWindowEndOverride;
  }
  if (
    typeof body.promisedDateOverride === "string" &&
    body.promisedDateOverride
  ) {
    const parsed = new Date(body.promisedDateOverride);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Invalid promisedDateOverride; expected ISO date" },
        { status: 400 },
      );
    }
    update.promisedDate = parsed;
    changed.promisedDate = body.promisedDateOverride;
  }
  if (typeof body.notesOverride === "string" && body.notesOverride) {
    update.notes = body.notesOverride;
    changed.notes = body.notesOverride;
  }

  const [updated] = await db
    .update(orders)
    .set(update)
    .where(and(eq(orders.id, orderId), eq(orders.status, "FAILED")))
    .returning();

  if (!updated) {
    return NextResponse.json(
      {
        error:
          "Order status changed since the reactivation request was prepared. Refresh and try again.",
      },
      { status: 409 },
    );
  }

  after(async () => {
    await logUpdate("order", orderId, {
      action: "reactivate",
      reason,
      changed,
      previous: {
        status: existing.status,
        address: existing.address,
        latitude: existing.latitude,
        longitude: existing.longitude,
        timeWindowStart: existing.timeWindowStart,
        timeWindowEnd: existing.timeWindowEnd,
        promisedDate: existing.promisedDate,
        notes: existing.notes,
      },
    });
  });

  return NextResponse.json({ data: updated });
}
