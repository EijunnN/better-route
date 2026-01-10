import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { drivers, fleets } from "@/db/schema";
import { driverStatusByFleetQuerySchema } from "@/lib/validations/driver-status";
import { eq, and, sql } from "drizzle-orm";
import { setTenantContext } from "@/lib/tenant";
import { DRIVER_STATUS } from "@/db/schema";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");

  if (!companyId) {
    return null;
  }

  return { companyId };
}

/**
 * GET /api/drivers/status-by-fleet?fleetId=xxx
 * Retrieves driver status metrics by fleet
 * Implements Story 4.3: Gestión del Estado Operativo de Conductores
 *
 * Returns status counts for all drivers in a fleet, useful for dashboards
 */
export async function GET(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 }
      );
    }

    setTenantContext(tenantCtx);

    const { searchParams } = new URL(request.url);
    const fleetId = searchParams.get("fleetId");

    if (!fleetId) {
      return NextResponse.json(
        { error: "fleetId query parameter is required" },
        { status: 400 }
      );
    }

    // Verify fleet belongs to tenant
    const [fleet] = await db
      .select()
      .from(fleets)
      .where(
        and(
          eq(fleets.id, fleetId),
          eq(fleets.companyId, tenantCtx.companyId)
        )
      )
      .limit(1);

    if (!fleet) {
      return NextResponse.json(
        { error: "Fleet not found" },
        { status: 404 }
      );
    }

    // Get all drivers with their status for this fleet
    const fleetDrivers = await db
      .select({
        id: drivers.id,
        name: drivers.name,
        status: drivers.status,
        active: drivers.active,
      })
      .from(drivers)
      .where(
        and(
          eq(drivers.fleetId, fleetId),
          eq(drivers.companyId, tenantCtx.companyId),
          eq(drivers.active, true)
        )
      );

    // Calculate status counts
    const statusCounts: Record<keyof typeof DRIVER_STATUS, number> = {
      AVAILABLE: 0,
      ASSIGNED: 0,
      IN_ROUTE: 0,
      ON_PAUSE: 0,
      COMPLETED: 0,
      UNAVAILABLE: 0,
      ABSENT: 0,
    };

    const driversByStatus: Record<keyof typeof DRIVER_STATUS, typeof fleetDrivers> = {
      AVAILABLE: [],
      ASSIGNED: [],
      IN_ROUTE: [],
      ON_PAUSE: [],
      COMPLETED: [],
      UNAVAILABLE: [],
      ABSENT: [],
    };

    for (const driver of fleetDrivers) {
      const status = driver.status as keyof typeof DRIVER_STATUS;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      driversByStatus[status].push(driver);
    }

    // Calculate metrics
    const totalDrivers = fleetDrivers.length;
    const availableDrivers = statusCounts.AVAILABLE;
    const activeDrivers = statusCounts.ASSIGNED + statusCounts.IN_ROUTE + statusCounts.ON_PAUSE;
    const unavailableDrivers = statusCounts.UNAVAILABLE + statusCounts.ABSENT;

    return NextResponse.json({
      fleetId,
      fleetName: fleet.name,
      totalDrivers,
      availableDrivers,
      activeDrivers,
      unavailableDrivers,
      statusCounts,
      driversByStatus,
      utilizationRate: totalDrivers > 0 ? (activeDrivers / totalDrivers) * 100 : 0,
    });
  } catch (error) {
    console.error("Error fetching driver status by fleet:", error);
    return NextResponse.json(
      { error: "Error fetching driver status by fleet" },
      { status: 500 }
    );
  }
}
