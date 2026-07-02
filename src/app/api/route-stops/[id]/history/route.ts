import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { routeStopHistory, routeStops } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { withContractHeader } from "@/lib/mobile-contract";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

// GET - Get history for a specific stop
async function handleGet(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ROUTE_STOP,
      Action.READ,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);
    const { id: stopId } = await params;

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

export const GET = withContractHeader(handleGet);
