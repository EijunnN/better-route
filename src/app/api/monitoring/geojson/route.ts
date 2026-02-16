import { and, desc, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { driverLocations, optimizationJobs, routeStops } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/infra/tenant";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// GET - Get GeoJSON data for monitoring map visualization
export async function GET(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
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

    if (!confirmedJob?.result) {
      return NextResponse.json({
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
    }

    let parsedResult: {
      routes?: Array<{
        routeId: string;
        vehiclePlate: string;
        driverName?: string;
        stops?: Array<{
          longitude: string;
          latitude: string;
          sequence: number;
          trackingId: string;
          address: string;
        }>;
      }>;
    } | null = null;
    try {
      parsedResult = JSON.parse(confirmedJob.result);
    } catch {
      return NextResponse.json({
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
    }

    if (!parsedResult?.routes || parsedResult.routes.length === 0) {
      return NextResponse.json({
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
    }

    // Get actual stop statuses from the database
    const dbStops = await db.query.routeStops.findMany({
      where: eq(routeStops.jobId, confirmedJob.id),
      columns: {
        routeId: true,
        sequence: true,
        status: true,
        latitude: true,
        longitude: true,
        address: true,
        userId: true,
      },
      with: {
        order: {
          columns: {
            trackingId: true,
          },
        },
        user: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Create maps for quick lookup
    const stopStatusMap = new Map<string, string>();
    const routeDriverMap = new Map<string, { id: string; name: string }>();

    dbStops.forEach((stop) => {
      const statusKey = `${stop.routeId}-${stop.sequence}`;
      stopStatusMap.set(statusKey, stop.status);

      // Map routeId to driver info (all stops in a route have the same driver)
      if (stop.user && !routeDriverMap.has(stop.routeId)) {
        routeDriverMap.set(stop.routeId, {
          id: stop.user.id,
          name: stop.user.name,
        });
      }
    });

    // Color palette for routes
    const colors = [
      "#3b82f6", // blue
      "#ef4444", // red
      "#22c55e", // green
      "#f59e0b", // amber
      "#8b5cf6", // purple
      "#ec4899", // pink
      "#14b8a6", // teal
      "#f97316", // orange
    ];

    // Build GeoJSON features
    const features: GeoJSON.Feature[] = [];

    parsedResult.routes.forEach(
      (
        route: {
          routeId: string;
          vehiclePlate: string;
          driverName?: string;
          stops?: Array<{
            longitude: string;
            latitude: string;
            sequence: number;
            trackingId: string;
            address: string;
          }>;
        },
        routeIndex: number,
      ) => {
        const color = colors[routeIndex % colors.length];

        // Add route line feature
        if (route.stops && route.stops.length > 0) {
          const stops = route.stops;
          const coordinates = stops.map((stop) => [
            parseFloat(stop.longitude),
            parseFloat(stop.latitude),
          ]);

          // Get driver info from DB (more reliable than job result)
          const driverInfo = routeDriverMap.get(route.routeId);
          const driverId = driverInfo?.id || null;
          const driverName = driverInfo?.name || route.driverName || "Sin asignar";

          features.push({
            type: "Feature",
            properties: {
              type: "route",
              routeId: route.routeId,
              vehiclePlate: route.vehiclePlate,
              driverId,
              driverName,
              color,
              totalStops: stops.length,
            },
            geometry: {
              type: "LineString",
              coordinates,
            },
          });

          // Add stop point features
          stops.forEach((stop) => {
            // Get real status from database, fallback to PENDING if not found
            const statusKey = `${route.routeId}-${stop.sequence}`;
            const realStatus = stopStatusMap.get(statusKey) || "PENDING";

            features.push({
              type: "Feature",
              properties: {
                type: "stop",
                routeId: route.routeId,
                vehiclePlate: route.vehiclePlate,
                driverId,
                driverName,
                color,
                sequence: stop.sequence,
                trackingId: stop.trackingId,
                address: stop.address,
                status: realStatus,
              },
              geometry: {
                type: "Point",
                coordinates: [
                  parseFloat(stop.longitude),
                  parseFloat(stop.latitude),
                ],
              },
            });
          });
        }
      },
    );

    // Get current driver locations (last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const driverIds = [...routeDriverMap.values()].map((d) => d.id);

    if (driverIds.length > 0) {
      const latestLocations = await db
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
        .orderBy(desc(driverLocations.recordedAt));

      // Create a map of driver ID to their most recent location
      const locationMap = new Map<string, typeof latestLocations[0]>();
      for (const loc of latestLocations) {
        if (!locationMap.has(loc.driverId)) {
          locationMap.set(loc.driverId, loc);
        }
      }

      // Find route info for each driver
      const driverRouteMap = new Map<string, { routeId: string; vehiclePlate: string; color: string }>();
      parsedResult.routes.forEach((route, routeIndex) => {
        const driverInfo = routeDriverMap.get(route.routeId);
        if (driverInfo) {
          driverRouteMap.set(driverInfo.id, {
            routeId: route.routeId,
            vehiclePlate: route.vehiclePlate,
            color: colors[routeIndex % colors.length],
          });
        }
      });

      // Add driver location features
      locationMap.forEach((location, driverId) => {
        const driverInfo = [...routeDriverMap.values()].find((d) => d.id === driverId);
        const routeInfo = driverRouteMap.get(driverId);
        const isRecent = location.recordedAt > tenMinutesAgo;

        features.push({
          type: "Feature",
          properties: {
            type: "driver_location",
            driverId,
            driverName: driverInfo?.name || "Desconocido",
            routeId: routeInfo?.routeId || null,
            vehiclePlate: routeInfo?.vehiclePlate || null,
            color: routeInfo?.color || "#6b7280", // gray if no route
            speed: location.speed,
            heading: location.heading,
            isMoving: location.isMoving,
            batteryLevel: location.batteryLevel,
            accuracy: location.accuracy,
            recordedAt: location.recordedAt.toISOString(),
            isRecent,
          },
          geometry: {
            type: "Point",
            coordinates: [
              parseFloat(location.longitude),
              parseFloat(location.latitude),
            ],
          },
        });
      });
    }

    return NextResponse.json({
      data: {
        type: "FeatureCollection",
        features,
      },
    });
  } catch (error) {
    console.error("Error fetching monitoring GeoJSON:", error);
    return NextResponse.json(
      { error: "Failed to fetch monitoring GeoJSON" },
      { status: 500 },
    );
  }
}
