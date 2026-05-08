import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, routeStops } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

/**
 * GET /api/orders/:id/stops/latest
 *
 * Returns the most recent `route_stops` row for the Order (the one
 * created in the latest plan), or `null` if the order never made it
 * into a plan. Used by the order detail page to surface the "Reabrir
 * parada" button when the latest stop is in FAILED (issue 003).
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

  const [orderRow] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.id, orderId),
        withTenantFilter(orders, [], tenantCtx.companyId),
      ),
    )
    .limit(1);
  if (!orderRow) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const [latest] = await db
    .select({
      id: routeStops.id,
      status: routeStops.status,
      attemptNumber: routeStops.attemptNumber,
      address: routeStops.address,
      latitude: routeStops.latitude,
      longitude: routeStops.longitude,
      timeWindowStart: routeStops.timeWindowStart,
      timeWindowEnd: routeStops.timeWindowEnd,
      notes: routeStops.notes,
      failureReason: routeStops.failureReason,
      createdAt: routeStops.createdAt,
    })
    .from(routeStops)
    .where(
      and(
        eq(routeStops.orderId, orderId),
        eq(routeStops.companyId, tenantCtx.companyId),
      ),
    )
    .orderBy(desc(routeStops.createdAt))
    .limit(1);

  return NextResponse.json({ data: latest ?? null });
}
