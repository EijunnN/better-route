import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationJobs } from "@/db/schema";
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
        withTenantFilter(optimizationJobs),
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

    let parsedResult;
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
    const features: any[] = [];

    parsedResult.routes.forEach((route: any, routeIndex: number) => {
      const color = colors[routeIndex % colors.length];

      // Add route line feature
      if (route.stops && route.stops.length > 0) {
        const coordinates = route.stops.map((stop: any) => [
          parseFloat(stop.longitude),
          parseFloat(stop.latitude),
        ]);

        features.push({
          type: "Feature",
          properties: {
            type: "route",
            routeId: route.routeId,
            vehiclePlate: route.vehiclePlate,
            driverName: route.driverName || "Unassigned",
            color,
            totalStops: route.stops.length,
          },
          geometry: {
            type: "LineString",
            coordinates,
          },
        });

        // Add stop point features
        route.stops.forEach((stop: any, stopIndex: number) => {
          features.push({
            type: "Feature",
            properties: {
              type: "stop",
              routeId: route.routeId,
              vehiclePlate: route.vehiclePlate,
              driverName: route.driverName || "Unassigned",
              color,
              sequence: stop.sequence,
              trackingId: stop.trackingId,
              address: stop.address,
              status: getStopStatusForMap(stopIndex, route.stops.length),
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
    });

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

// Mock stop status for map visualization
function getStopStatusForMap(index: number, totalStops: number): string {
  const completedThreshold = Math.floor(totalStops * 0.5);
  if (index < completedThreshold) return "COMPLETED";
  if (index === completedThreshold) return "IN_PROGRESS";
  return "PENDING";
}
