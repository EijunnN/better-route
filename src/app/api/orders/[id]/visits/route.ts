import { and, asc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deliveryVisits, orders, users } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

/**
 * GET /api/orders/:id/visits
 *
 * Returns the chronological list of physical delivery attempts (Visits)
 * for an Order. Each entry is the immutable record persisted by the
 * route-stops PATCH transition (issue 001 / ADR-0005).
 *
 * Ordering: ascending by `attemptedAt` — first attempt first, so the UI
 * timeline can render top-to-bottom in chronological order.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireRoutePermission(
    request,
    EntityType.ORDER,
    Action.READ,
  );
  if (authResult instanceof NextResponse) return authResult;
  const tenantCtx = extractTenantContextAuthed(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  setTenantContext(tenantCtx);

  const { id: orderId } = await params;

  const orderRow = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.id, orderId),
        withTenantFilter(orders, [], tenantCtx.companyId),
      ),
    )
    .limit(1);

  if (orderRow.length === 0) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const rows = await db
    .select({
      id: deliveryVisits.id,
      orderId: deliveryVisits.orderId,
      routeStopId: deliveryVisits.routeStopId,
      driverId: deliveryVisits.driverId,
      driverName: users.name,
      planId: deliveryVisits.planId,
      attemptedAt: deliveryVisits.attemptedAt,
      completedAt: deliveryVisits.completedAt,
      outcome: deliveryVisits.outcome,
      failureReason: deliveryVisits.failureReason,
      notes: deliveryVisits.notes,
      evidenceUrls: deliveryVisits.evidenceUrls,
      intendedAddress: deliveryVisits.intendedAddress,
      intendedLatitude: deliveryVisits.intendedLatitude,
      intendedLongitude: deliveryVisits.intendedLongitude,
      gpsLatitude: deliveryVisits.gpsLatitude,
      gpsLongitude: deliveryVisits.gpsLongitude,
      createdAt: deliveryVisits.createdAt,
    })
    .from(deliveryVisits)
    .leftJoin(users, eq(deliveryVisits.driverId, users.id))
    .where(
      and(
        eq(deliveryVisits.orderId, orderId),
        eq(deliveryVisits.companyId, tenantCtx.companyId),
      ),
    )
    .orderBy(asc(deliveryVisits.attemptedAt));

  return NextResponse.json({ data: rows });
}
