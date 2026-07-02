import { and, eq, sql } from "drizzle-orm";
import { after, type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { routeStopHistory, routeStops } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { logUpdate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import { withContractHeader } from "@/lib/mobile-contract";
import {
  applyOrderTransition,
  toOrderTransitionHttp,
} from "@/lib/orders/transition";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

/**
 * Project an "HH:MM" override onto the day of the original timestamp,
 * preserving the date/timezone the Stop was originally scheduled for.
 * Returns null if `hhmm` is missing, the Date with the new time-of-day
 * if both are provided, or null when there's no original date to anchor
 * to (in which case the override is silently dropped).
 */
function projectHhmmOnDate(hhmm: string, anchor: Date): Date {
  const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  const out = new Date(anchor);
  out.setHours(h, m, 0, 0);
  return out;
}

/**
 * POST /api/route-stops/:id/reopen — same-day reopen of a FAILED Stop.
 *
 * Issue 003. Transitions FAILED → PENDING, applies operator-provided
 * overrides to the Stop, and clears the previous attempt's
 * evidence/failure data so the driver sees a clean stop on next poll.
 *
 * Crucially this does NOT modify the prior `delivery_visits` row — the
 * audit trail of the previous attempt remains intact (issue 001).
 */
async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.ROUTE_STOP,
    Action.UPDATE,
  );
  if (authResult instanceof NextResponse) return authResult;
  const tenantCtx = extractTenantContextAuthed(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  setTenantContext(tenantCtx);

  const { id: stopId } = await params;
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

  const currentStop = await db.query.routeStops.findFirst({
    where: and(
      eq(routeStops.id, stopId),
      withTenantFilter(routeStops, [], tenantCtx.companyId),
    ),
  });
  if (!currentStop) {
    return NextResponse.json({ error: "Stop not found" }, { status: 404 });
  }
  if (currentStop.status !== "FAILED") {
    return NextResponse.json(
      {
        error: `Cannot reopen a stop in status ${currentStop.status}. Only FAILED stops are reopenable.`,
      },
      { status: 409 },
    );
  }

  const overrides = [
    "addressOverride",
    "latitudeOverride",
    "longitudeOverride",
    "timeWindowStartOverride",
    "timeWindowEndOverride",
    "promisedDateOverride",
    "notesOverride",
  ] as const;
  const changed: Record<string, unknown> = {};

  const stopUpdate: Partial<typeof routeStops.$inferInsert> = {
    status: "PENDING",
    failureReason: null,
    evidenceUrls: null,
    notes: null,
    completedAt: null,
    startedAt: null,
    updatedAt: new Date(),
  };

  if (typeof body.addressOverride === "string" && body.addressOverride) {
    stopUpdate.address = body.addressOverride;
    changed.address = body.addressOverride;
  }
  if (typeof body.latitudeOverride === "string" && body.latitudeOverride) {
    stopUpdate.latitude = body.latitudeOverride;
    changed.latitude = body.latitudeOverride;
  }
  if (typeof body.longitudeOverride === "string" && body.longitudeOverride) {
    stopUpdate.longitude = body.longitudeOverride;
    changed.longitude = body.longitudeOverride;
  }
  if (
    typeof body.timeWindowStartOverride === "string" &&
    body.timeWindowStartOverride
  ) {
    const anchor = currentStop.timeWindowStart ?? new Date();
    stopUpdate.timeWindowStart = projectHhmmOnDate(
      body.timeWindowStartOverride,
      anchor,
    );
    changed.timeWindowStart = body.timeWindowStartOverride;
  }
  if (
    typeof body.timeWindowEndOverride === "string" &&
    body.timeWindowEndOverride
  ) {
    const anchor = currentStop.timeWindowEnd ?? new Date();
    stopUpdate.timeWindowEnd = projectHhmmOnDate(
      body.timeWindowEndOverride,
      anchor,
    );
    changed.timeWindowEnd = body.timeWindowEndOverride;
  }
  if (typeof body.notesOverride === "string") {
    // notes is cleared by default; an explicit (even empty) override would be
    // pointless to track, but a non-empty value should land on the Stop so the
    // driver sees the operator's prep note.
    if (body.notesOverride) {
      stopUpdate.notes = body.notesOverride;
      changed.notes = body.notesOverride;
    }
  }

  // promisedDateOverride applies to the Order (the Stop has no
  // promised_date column). Persist alongside the Stop reopen so both
  // shifts move together.
  let orderUpdate: { promisedDate: Date } | null = null;
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
    orderUpdate = { promisedDate: parsed };
    changed.promisedDate = body.promisedDateOverride;
  }

  // Sanity: only proceed with overrides keys we know about.
  for (const k of Object.keys(body)) {
    if (k === "reason") continue;
    if (!overrides.includes(k as (typeof overrides)[number])) {
      // Unknown keys are ignored, not rejected — keeps the API forward-compat.
    }
  }

  let updatedStop: typeof routeStops.$inferSelect;
  try {
    updatedStop = await db.transaction(async (tx) => {
      // Serializa contra el confirm de planes (mismo lock por companyId):
      // revivir un stop a PENDING cambia el conteo de stops activos que el
      // guard de vehículos del confirm lee bajo READ COMMITTED.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${tenantCtx.companyId}))`,
      );

      const [fresh] = await tx
        .select()
        .from(routeStops)
        .where(eq(routeStops.id, stopId))
        .limit(1);
      if (!fresh) throw new Error("NOT_FOUND");
      if (fresh.status !== "FAILED") throw new Error("CONFLICT");

      const [result] = await tx
        .update(routeStops)
        .set(stopUpdate)
        .where(and(eq(routeStops.id, stopId), eq(routeStops.status, "FAILED")))
        .returning();
      if (!result) throw new Error("CONFLICT");

      await tx.insert(routeStopHistory).values({
        companyId: tenantCtx.companyId,
        routeStopId: stopId,
        previousStatus: "FAILED",
        newStatus: "PENDING",
        userId: tenantCtx.userId || null,
        notes: reason,
        metadata: { reason, changed, source: "same-day-reopen" },
      });

      // Sync the Order back to PENDING (mirrors the Stop transition) through
      // the order state machine, so the move is validated against
      // ALLOWED_ORDER_TRANSITIONS and recorded in order_status_history within
      // this same transaction. A terminal (CANCELLED) order rejects the
      // reopen instead of leaving Order/Stop inconsistent.
      if (currentStop.orderId) {
        await applyOrderTransition({
          tx,
          orderId: currentStop.orderId,
          companyId: tenantCtx.companyId,
          to: "PENDING",
          source: "reopen",
          reason,
          actorUserId: tenantCtx.userId ?? null,
          statusColumns: orderUpdate ?? undefined,
        });
      }

      return result;
    });
  } catch (txError) {
    const mapped = toOrderTransitionHttp(txError);
    if (mapped) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    if (txError instanceof Error) {
      if (txError.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Stop not found" }, { status: 404 });
      }
      if (txError.message === "CONFLICT") {
        return NextResponse.json(
          {
            error:
              "Stop status changed since the reopen request was prepared. Refresh and try again.",
          },
          { status: 409 },
        );
      }
    }
    throw txError;
  }

  after(async () => {
    await logUpdate("route_stop", stopId, {
      action: "reopen",
      reason,
      changed,
      previous: {
        status: currentStop.status,
        address: currentStop.address,
        latitude: currentStop.latitude,
        longitude: currentStop.longitude,
        timeWindowStart: currentStop.timeWindowStart,
        timeWindowEnd: currentStop.timeWindowEnd,
        failureReason: currentStop.failureReason,
        evidenceUrls: currentStop.evidenceUrls,
        notes: currentStop.notes,
      },
    });
  });

  return NextResponse.json({ data: updatedStop });
}

export const POST = withContractHeader(handlePost);
