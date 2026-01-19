import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationJobs, routeStops } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/tenant";

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
      },
      with: {
        order: {
          columns: {
            trackingId: true,
          },
        },
      },
    });

    // Create a map for quick lookup: routeId-sequence -> status
    const stopStatusMap = new Map<string, string>();
    dbStops.forEach((stop) => {
      const key = `${stop.routeId}-${stop.sequence}`;
      stopStatusMap.set(key, stop.status);
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

          features.push({
            type: "Feature",
            properties: {
              type: "route",
              routeId: route.routeId,
              vehiclePlate: route.vehiclePlate,
              driverName: route.driverName || "Sin asignar",
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
                driverName: route.driverName || "Sin asignar",
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
