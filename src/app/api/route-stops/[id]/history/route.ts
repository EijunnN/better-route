import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { routeStopHistory, routeStops } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/tenant";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

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
