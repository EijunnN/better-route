import { and, desc, eq, sql, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  driverLocations,
  optimizationJobs,
  routeStops,
  USER_ROLES,
  users,
  vehicles,
} from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/infra/tenant";

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

    // If no confirmed job, return drivers without route info but with location
    if (!confirmedJob) {
      // Get latest locations even without route
      const driverIds = allDrivers.map((d) => d.id);
      const latestLocs = driverIds.length > 0
        ? await db
            .select({
              driverId: driverLocations.driverId,
              latitude: driverLocations.latitude,
              longitude: driverLocations.longitude,
              accuracy: driverLocations.accuracy,
              speed: driverLocations.speed,
              heading: driverLocations.heading,
              isMoving: driverLocations.isMoving,
              batteryLevel: driverLocations.batteryLevel,
              recordedAt: driverLocations.recordedAt,
            })
            .from(driverLocations)
            .where(
              and(
                eq(driverLocations.companyId, tenantCtx.companyId),
                inArray(driverLocations.driverId, driverIds),
              )
            )
            .orderBy(desc(driverLocations.recordedAt))
        : [];

      const locMap = new Map<string, typeof latestLocs[0]>();
      for (const loc of latestLocs) {
        if (!locMap.has(loc.driverId)) {
          locMap.set(loc.driverId, loc);
        }
      }

      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

      const driversData = allDrivers.map((driver) => {
        const location = locMap.get(driver.id);
        const isLocationRecent = location && location.recordedAt > fiveMinAgo;

        return {
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
          currentLocation: location
            ? {
                latitude: parseFloat(location.latitude),
                longitude: parseFloat(location.longitude),
                accuracy: location.accuracy,
                speed: location.speed,
                heading: location.heading,
                isMoving: location.isMoving,
                batteryLevel: location.batteryLevel,
                recordedAt: location.recordedAt.toISOString(),
                isRecent: isLocationRecent,
              }
            : null,
        };
      });

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

    // Get latest location for each driver (last 5 minutes to be considered "active")
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const driverIds = allDrivers.map((d) => d.id);

    // Get most recent location for each driver using a subquery
    const latestLocations = driverIds.length > 0
      ? await db
          .select({
            driverId: driverLocations.driverId,
            latitude: driverLocations.latitude,
            longitude: driverLocations.longitude,
            accuracy: driverLocations.accuracy,
            speed: driverLocations.speed,
            heading: driverLocations.heading,
            isMoving: driverLocations.isMoving,
            batteryLevel: driverLocations.batteryLevel,
            recordedAt: driverLocations.recordedAt,
          })
          .from(driverLocations)
          .where(
            and(
              eq(driverLocations.companyId, tenantCtx.companyId),
              inArray(driverLocations.driverId, driverIds),
            )
          )
          .orderBy(desc(driverLocations.recordedAt))
      : [];

    // Create a map of driver ID to their most recent location
    const locationMap = new Map<string, typeof latestLocations[0]>();
    for (const loc of latestLocations) {
      // Only keep the first (most recent) location for each driver
      if (!locationMap.has(loc.driverId)) {
        locationMap.set(loc.driverId, loc);
      }
    }

    // Build driver data with route info
    const driverStopsMap = new Map(driverStops.map((ds) => [ds.userId, ds]));

    const driversData = allDrivers.map((driver) => {
      const stopData = driverStopsMap.get(driver.id);
      const vehicle = stopData ? vehicleMap.get(stopData.vehicleId) : null;
      const location = locationMap.get(driver.id);
      const hasRoute = !!stopData;
      const totalStops = Number(stopData?.totalStops || 0);
      const completedStops = Number(stopData?.completedStops || 0);
      const failedStops = Number(stopData?.failedStops || 0);

      // Check if location is recent (within last 5 minutes)
      const isLocationRecent = location && location.recordedAt > fiveMinutesAgo;

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
      // Alert if driver has route but no recent location
      if (hasRoute && !isLocationRecent) {
        alerts.push("Sin señal GPS reciente");
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
        // New: current location data
        currentLocation: location
          ? {
              latitude: parseFloat(location.latitude),
              longitude: parseFloat(location.longitude),
              accuracy: location.accuracy,
              speed: location.speed,
              heading: location.heading,
              isMoving: location.isMoving,
              batteryLevel: location.batteryLevel,
              recordedAt: location.recordedAt.toISOString(),
              isRecent: isLocationRecent,
            }
          : null,
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
