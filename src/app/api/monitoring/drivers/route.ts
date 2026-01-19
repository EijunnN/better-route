import { and, desc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  optimizationJobs,
  routeStops,
  USER_ROLES,
  users,
  vehicles,
} from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/tenant";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// GET - Get list of drivers with their route status for monitoring
export async function GET(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Contexto de tenant faltante" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    // Get the most recent confirmed optimization job
    const confirmedJob = await db.query.optimizationJobs.findFirst({
      where: and(
        withTenantFilter(optimizationJobs, [], tenantCtx.companyId),
        eq(optimizationJobs.status, "COMPLETED"),
      ),
      orderBy: [desc(optimizationJobs.createdAt)],
    });

    // Get all drivers (users with CONDUCTOR role) from the company
    const allDrivers = await db.query.users.findMany({
      where: and(
        withTenantFilter(users, [], tenantCtx.companyId),
        eq(users.role, USER_ROLES.CONDUCTOR),
        eq(users.active, true),
      ),
      columns: {
        id: true,
        name: true,
        driverStatus: true,
        primaryFleetId: true,
      },
      with: {
        primaryFleet: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    });

    // If no confirmed job, return drivers without route info
    if (!confirmedJob) {
      const driversData = allDrivers.map((driver) => ({
        id: driver.id,
        name: driver.name,
        status: driver.driverStatus || "AVAILABLE",
        fleetId: driver.primaryFleetId || "",
        fleetName: driver.primaryFleet?.name || "Sin flota",
        hasRoute: false,
        routeId: null,
        vehiclePlate: null,
        progress: {
          completedStops: 0,
          totalStops: 0,
          percentage: 0,
        },
        alerts: [],
      }));

      return NextResponse.json({ data: driversData });
    }

    // Get route stops grouped by driver for the confirmed job
    const driverStops = await db
      .select({
        userId: routeStops.userId,
        routeId: routeStops.routeId,
        vehicleId: routeStops.vehicleId,
        totalStops: sql<number>`count(*)`,
        completedStops: sql<number>`count(*) filter (where ${routeStops.status} = 'COMPLETED')`,
        inProgressStops: sql<number>`count(*) filter (where ${routeStops.status} = 'IN_PROGRESS')`,
        failedStops: sql<number>`count(*) filter (where ${routeStops.status} = 'FAILED')`,
      })
      .from(routeStops)
      .where(eq(routeStops.jobId, confirmedJob.id))
      .groupBy(routeStops.userId, routeStops.routeId, routeStops.vehicleId);

    // Get vehicle info
    const vehicleIds = [...new Set(driverStops.map((s) => s.vehicleId))];
    const vehiclesData =
      vehicleIds.length > 0
        ? await db.query.vehicles.findMany({
            where: and(
              withTenantFilter(vehicles, [], tenantCtx.companyId),
              sql`${vehicles.id} IN ${vehicleIds}`,
            ),
            columns: {
              id: true,
              plate: true,
              name: true,
            },
          })
        : [];

    const vehicleMap = new Map(vehiclesData.map((v) => [v.id, v]));

    // Build driver data with route info
    const driverStopsMap = new Map(driverStops.map((ds) => [ds.userId, ds]));

    const driversData = allDrivers.map((driver) => {
      const stopData = driverStopsMap.get(driver.id);
      const vehicle = stopData ? vehicleMap.get(stopData.vehicleId) : null;
      const hasRoute = !!stopData;
      const totalStops = Number(stopData?.totalStops || 0);
      const completedStops = Number(stopData?.completedStops || 0);
      const failedStops = Number(stopData?.failedStops || 0);

      // Generate alerts based on status
      const alerts: string[] = [];
      if (!driver.primaryFleetId) {
        alerts.push("Sin flota asignada");
      }
      if (failedStops > 0) {
        alerts.push(`${failedStops} parada(s) fallida(s)`);
      }
      if (driver.driverStatus === "ABSENT") {
        alerts.push("Conductor ausente");
      }
      if (driver.driverStatus === "UNAVAILABLE") {
        alerts.push("Conductor no disponible");
      }

      return {
        id: driver.id,
        name: driver.name,
        status: driver.driverStatus || "AVAILABLE",
        fleetId: driver.primaryFleetId || "",
        fleetName: driver.primaryFleet?.name || "Sin flota",
        hasRoute,
        routeId: stopData?.routeId || null,
        vehiclePlate: vehicle?.plate || vehicle?.name || null,
        progress: {
          completedStops,
          totalStops,
          percentage:
            totalStops > 0
              ? Math.round((completedStops / totalStops) * 100)
              : 0,
        },
        alerts,
      };
    });

    // Sort: drivers with routes first, then by name
    driversData.sort((a, b) => {
      if (a.hasRoute && !b.hasRoute) return -1;
      if (!a.hasRoute && b.hasRoute) return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ data: driversData });
  } catch (error) {
    console.error("Error fetching monitoring drivers:", error);
    return NextResponse.json(
      { error: "Error al obtener conductores de monitoreo" },
      { status: 500 },
    );
  }
}
