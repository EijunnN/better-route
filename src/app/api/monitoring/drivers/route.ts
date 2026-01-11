import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { drivers, fleets, optimizationJobs, routeStops } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/tenant";
import { eq, and, desc, sql } from "drizzle-orm";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// GET - Get all drivers with their monitoring status
//
// Story 11.3: Actualización Inmediata de Vistas de Monitoreo
// This endpoint provides real-time driver status that reflects
// reassignments immediately after they are executed.
export async function GET(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json({ error: "Missing tenant context" }, { status: 401 });
  }

  setTenantContext(tenantCtx);

  try {
    const { searchParams } = new URL(request.url);
    const includeReassigned = searchParams.get("includeReassigned") === "true";
    const updatedSince = searchParams.get("updatedSince");

    // Get the most recent confirmed optimization job
    const confirmedJob = await db.query.optimizationJobs.findFirst({
      where: and(
        withTenantFilter(optimizationJobs),
        eq(optimizationJobs.status, "COMPLETED")
      ),
      orderBy: [desc(optimizationJobs.createdAt)],
    });

    // Parse routes from job result
    let routesByDriver = new Map<string, any>();
    if (confirmedJob?.result) {
      try {
        const parsedResult = JSON.parse(confirmedJob.result);
        if (parsedResult?.routes) {
          parsedResult.routes.forEach((route: any) => {
            if (route.driverId) {
              routesByDriver.set(route.driverId, route);
            }
          });
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Get all drivers with their fleet info
    // Apply updatedSince filter if provided to get recently updated drivers
    let driverConditions = [withTenantFilter(drivers)];
    if (updatedSince) {
      const sinceDate = new Date(updatedSince);
      driverConditions.push(sql`${drivers.updatedAt} >= ${sinceDate}`);
    }

    const allDrivers = await db.query.drivers.findMany({
      where: and(...driverConditions),
      with: {
        fleet: true,
      },
    });

    // Build driver monitoring data with actual route stop counts
    const driverMonitoringData = await Promise.all(
      allDrivers.map(async (driver) => {
        const route = routesByDriver.get(driver.id);

        // Get actual stop counts from routeStops table
        // This ensures reassignments are reflected immediately
        const driverStops = await db.query.routeStops.findMany({
          where: and(
            eq(routeStops.driverId, driver.id),
            eq(routeStops.companyId, tenantCtx.companyId)
          ),
        });

        const totalStops = driverStops.length;
        const completedStops = driverStops.filter(s => s.status === "COMPLETED").length;
        const inProgressStops = driverStops.filter(s => s.status === "IN_PROGRESS").length;
        const pendingStops = driverStops.filter(s => s.status === "PENDING").length;

        // If driver was recently reassigned (updatedSince check), flag it
        const wasRecentlyReassigned = updatedSince && driver.updatedAt >= new Date(updatedSince);

        return {
          id: driver.id,
          name: driver.name,
          status: driver.status,
          fleetId: driver.fleetId,
          fleetName: driver.fleet?.name || "Unknown",
          hasRoute: totalStops > 0,
          routeId: route?.routeId || null,
          vehiclePlate: route?.vehiclePlate || null,
          updatedAt: driver.updatedAt,
          recentlyReassigned: wasRecentlyReassigned,
          progress: {
            completedStops,
            inProgressStops,
            pendingStops,
            totalStops,
            percentage: totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0,
          },
          alerts: getDriverAlerts(driver, route, driverStops),
        };
      })
    );

    // Sort drivers: those with routes first, then by status
    driverMonitoringData.sort((a, b) => {
      // Prioritize recently reassigned drivers
      if (a.recentlyReassigned && !b.recentlyReassigned) return -1;
      if (!a.recentlyReassigned && b.recentlyReassigned) return 1;
      // Then by route presence
      if (a.hasRoute && !b.hasRoute) return -1;
      if (!a.hasRoute && b.hasRoute) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      data: driverMonitoringData,
      meta: {
        fetchedAt: new Date().toISOString(),
        includeReassigned,
        updatedSince,
      },
    }, {
      headers: {
        // Short cache to allow real-time updates
        "Cache-Control": "max-age=5",
      },
    });
  } catch (error) {
    console.error("Error fetching driver monitoring data:", error);
    return NextResponse.json(
      { error: "Failed to fetch driver monitoring data" },
      { status: 500 }
    );
  }
}

function getDriverAlerts(driver: any, route: any, driverStops: any[] = []): string[] {
  const alerts: string[] = [];

  // Check for license expiry
  if (driver.licenseExpiry) {
    const expiryDate = new Date(driver.licenseExpiry);
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry < 0) {
      alerts.push("License expired");
    } else if (daysUntilExpiry < 30) {
      alerts.push(`License expires in ${daysUntilExpiry} days`);
    }
  }

  // Check for route delays
  if (route?.timeWindowViolations && route.timeWindowViolations > 0) {
    alerts.push(`${route.timeWindowViolations} time window violations`);
  }

  // Check for driver status issues
  if (driver.status === "ABSENT") {
    alerts.push("Driver marked as absent - reassignment recommended");
  }

  if (driver.status === "UNAVAILABLE") {
    alerts.push("Driver unavailable");
  }

  // Check for recently reassigned stops (from reassignment)
  const reassignedStops = driverStops.filter(s => s.updatedAt && new Date(s.updatedAt) > new Date(Date.now() - 5 * 60 * 1000));
  if (reassignedStops.length > 0) {
    alerts.push(`${reassignedStops.length} stops recently reassigned - route updated`);
  }

  return alerts;
}
