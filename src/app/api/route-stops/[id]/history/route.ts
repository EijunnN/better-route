import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { routeStopHistory, routeStops } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

// GET - Get history for a specific stop
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);
  const { id: stopId } = await params;

  try {
    const authResult = await requireRoutePermission(request, EntityType.ROUTE_STOP, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

    // Verify stop exists and belongs to tenant
    const stop = await db.query.routeStops.findFirst({
      where: and(
        eq(routeStops.id, stopId),
        withTenantFilter(routeStops, [], tenantCtx.companyId),
      ),
    });

    if (!stop) {
      return NextResponse.json({ error: "Stop not found" }, { status: 404 });
    }

    // Get history
    const history = await db.query.routeStopHistory.findMany({
      where: eq(routeStopHistory.routeStopId, stopId),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [desc(routeStopHistory.createdAt)],
    });

    return NextResponse.json({
      data: history,
      total: history.length,
    });
  } catch (error) {
    console.error("Error fetching stop history:", error);
    return NextResponse.json(
      { error: "Failed to fetch stop history" },
      { status: 500 },
    );
  }
}
