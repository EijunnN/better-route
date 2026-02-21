import { and, count, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { fleets, vehicleFleets, vehicles } from "@/db/schema";
import { TenantAccessDeniedError, withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

/**
 * GET /api/fleets/[id]/vehicle-counts
 * Returns vehicle counts grouped by status for a specific fleet
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.FLEET, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { id } = await params;

    // Verify the fleet exists and belongs to the tenant's company
    const fleetWhereClause = withTenantFilter(
      fleets,
      [eq(fleets.id, id)],
      tenantCtx.companyId,
    );
    const [fleet] = await db
      .select()
      .from(fleets)
      .where(fleetWhereClause)
      .limit(1);

    if (!fleet) {
      return NextResponse.json({ error: "Fleet not found" }, { status: 404 });
    }

    // Get vehicle IDs belonging to this fleet via junction table
    const fleetVehicleRecords = await db
      .select({ vehicleId: vehicleFleets.vehicleId })
      .from(vehicleFleets)
      .where(
        and(eq(vehicleFleets.fleetId, id), eq(vehicleFleets.active, true)),
      );
    const vehicleIdsInFleet = fleetVehicleRecords.map((r) => r.vehicleId);

    // If no vehicles in fleet, return zeros
    if (vehicleIdsInFleet.length === 0) {
      return NextResponse.json({
        fleet: {
          id: fleet.id,
          name: fleet.name,
        },
        counts: {
          total: 0,
          byStatus: {
            AVAILABLE: 0,
            IN_MAINTENANCE: 0,
            ASSIGNED: 0,
            INACTIVE: 0,
          },
          utilizationRate: 0,
        },
      });
    }

    // Get vehicle counts by status for this fleet
    const statusCounts = await db
      .select({
        status: vehicles.status,
        count: count(),
      })
      .from(vehicles)
      .where(
        and(
          inArray(vehicles.id, vehicleIdsInFleet),
          eq(vehicles.companyId, tenantCtx.companyId),
          eq(vehicles.active, true),
        ),
      )
      .groupBy(vehicles.status);

    // Get total vehicles count
    const [totalResult] = await db
      .select({ count: count() })
      .from(vehicles)
      .where(
        and(
          inArray(vehicles.id, vehicleIdsInFleet),
          eq(vehicles.companyId, tenantCtx.companyId),
          eq(vehicles.active, true),
        ),
      );

    // Calculate utilization metrics using Map for O(1) lookups
    const statusCountMap = new Map(
      statusCounts.map((c) => [c.status, c.count]),
    );
    const assignedCount = statusCountMap.get("ASSIGNED") || 0;
    const availableCount = statusCountMap.get("AVAILABLE") || 0;
    const inMaintenanceCount = statusCountMap.get("IN_MAINTENANCE") || 0;
    const inactiveCount = statusCountMap.get("INACTIVE") || 0;

    const totalVehicles = totalResult.count;
    const utilizationRate =
      totalVehicles > 0 ? Math.round((assignedCount / totalVehicles) * 100) : 0;

    return NextResponse.json({
      fleet: {
        id: fleet.id,
        name: fleet.name,
        type: fleet.type,
      },
      counts: {
        total: totalVehicles,
        byStatus: {
          AVAILABLE: availableCount,
          IN_MAINTENANCE: inMaintenanceCount,
          ASSIGNED: assignedCount,
          INACTIVE: inactiveCount,
        },
        utilizationRate,
      },
    });
  } catch (error) {
    console.error("Error fetching fleet vehicle counts:", error);
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error fetching fleet vehicle counts" },
      { status: 500 },
    );
  }
}
