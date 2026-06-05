import { type NextRequest, NextResponse } from "next/server";
import type { orders } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  applyOrderTransition,
  toOrderTransitionHttp,
} from "@/lib/orders/transition";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

/**
 * POST /api/orders/:id/reactivate — cross-day reactivation of a FAILED Order.
 *
 * Issue 004. Transitions Order FAILED → PENDING (validated against the order
 * state machine, optimistically locked, audited in order_status_history) so
 * the order joins the next planning batch. Optional overrides patch the
 * Order's address/coordinates/time-window/promised-date/notes columns.
 *
 * No RouteStop is created or deleted here — the next optimization run
 * produces a fresh stop with `attempt_number = priorVisitCount + 1`
 * (issue 001). The prior FAILED stop + its delivery_visit stay as immutable
 * history.
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

  const statusColumns: Partial<typeof orders.$inferInsert> = {};
  const changed: Record<string, unknown> = {};

  if (typeof body.addressOverride === "string" && body.addressOverride) {
    statusColumns.address = body.addressOverride;
    changed.address = body.addressOverride;
  }
  if (typeof body.latitudeOverride === "string" && body.latitudeOverride) {
    statusColumns.latitude = body.latitudeOverride;
    changed.latitude = body.latitudeOverride;
  }
  if (typeof body.longitudeOverride === "string" && body.longitudeOverride) {
    statusColumns.longitude = body.longitudeOverride;
    changed.longitude = body.longitudeOverride;
  }
  // Order.timeWindowStart/End are `time` columns — Drizzle accepts an
  // "HH:MM" or "HH:MM:SS" string verbatim.
  if (
    typeof body.timeWindowStartOverride === "string" &&
    body.timeWindowStartOverride
  ) {
    statusColumns.timeWindowStart = body.timeWindowStartOverride;
    changed.timeWindowStart = body.timeWindowStartOverride;
  }
  if (
    typeof body.timeWindowEndOverride === "string" &&
    body.timeWindowEndOverride
  ) {
    statusColumns.timeWindowEnd = body.timeWindowEndOverride;
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
    statusColumns.promisedDate = parsed;
    changed.promisedDate = body.promisedDateOverride;
  }
  if (typeof body.notesOverride === "string" && body.notesOverride) {
    statusColumns.notes = body.notesOverride;
    changed.notes = body.notesOverride;
  }

  try {
    const { order } = await applyOrderTransition({
      orderId,
      companyId: tenantCtx.companyId,
      to: "PENDING",
      expectedFrom: "FAILED",
      source: "reactivate",
      reason,
      actorUserId: tenantCtx.userId ?? null,
      statusColumns,
      metadata: { changed },
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
