import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationJobs, orders, vehicles } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  type DepotConfig,
  type OrderForOptimization,
  type VehicleForOptimization,
  optimizeRoutes as vroomOptimizeRoutes,
} from "@/lib/optimization/vroom-optimizer";

import { extractTenantContext } from "@/lib/routing/route-helpers";

import { safeParseJson } from "@/lib/utils/safe-json";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

interface RouteData {
  routeId: string;
  vehicleId: string;
  vehiclePlate: string;
  driverId?: string;
  driverName?: string;
  driverOrigin?: {
    latitude: string;
    longitude: string;
    address?: string;
  };
  stops: Array<{
    orderId: string;
    trackingId: string;
    sequence: number;
    address: string;
    latitude: string;
    longitude: string;
    estimatedArrival?: string;
    timeWindow?: {
      start: string;
      end: string;
    };
    groupedOrderIds?: string[];
    groupedTrackingIds?: string[];
  }>;
  totalDistance: number;
  totalDuration: number;
  totalWeight: number;
  totalVolume: number;
  utilizationPercentage: number;
  timeWindowViolations: number;
  geometry?: string;
}

interface OptimizationResult {
  routes: RouteData[];
  unassignedOrders: Array<{
    orderId: string;
    trackingId: string;
    reason: string;
    latitude?: string;
    longitude?: string;
    address?: string;
  }>;
  vehiclesWithoutRoutes?: Array<{
    id: string;
    plate: string;
    originLatitude?: string;
    originLongitude?: string;
  }>;
  metrics: {
    totalDistance: number;
    totalDuration: number;
    totalRoutes: number;
    totalStops: number;
    utilizationRate: number;
    timeWindowComplianceRate: number;
    balanceScore?: number;
  };
  summary: {
    optimizedAt: string;
    objective: string;
    processingTimeMs: number;
  };
  depot?: {
    latitude: number;
    longitude: number;
  };
}

// POST - Swap all routes between two vehicles
export async function POST(
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
  const { id: jobId } = await params;

  try {
    const authResult = await requireRoutePermission(request, EntityType.PLAN, Action.UPDATE);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const { vehicleAId, vehicleBId } = body;

    if (!vehicleAId || !vehicleBId) {
      return NextResponse.json(
        { error: "vehicleAId and vehicleBId are required" },
        { status: 400 },
      );
    }

    if (vehicleAId === vehicleBId) {
      return NextResponse.json(
        { error: "Cannot swap a vehicle with itself" },
        { status: 400 },
      );
    }

    // Get the current job and result
    const job = await db.query.optimizationJobs.findFirst({
      where: and(
        eq(optimizationJobs.id, jobId),
        withTenantFilter(optimizationJobs, [], tenantCtx.companyId),
      ),
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (!job.result) {
      return NextResponse.json(
        { error: "Job has no results to modify" },
        { status: 400 },
      );
    }

    let result: OptimizationResult;
    try {
      result = safeParseJson(job.result);
    } catch {
      return NextResponse.json(
        { error: "Invalid job result format" },
        { status: 500 },
      );
    }

    // Find routes for both vehicles
    const routeAIndex = result.routes.findIndex(
      (r) => r.vehicleId === vehicleAId,
    );
    const routeBIndex = result.routes.findIndex(
      (r) => r.vehicleId === vehicleBId,
    );

    if (routeAIndex === -1) {
      return NextResponse.json(
        { error: "Vehicle A not found in job routes" },
        { status: 404 },
      );
    }

    if (routeBIndex === -1) {
      return NextResponse.json(
        { error: "Vehicle B not found in job routes" },
        { status: 404 },
      );
    }

    const routeA = result.routes[routeAIndex];
    const routeB = result.routes[routeBIndex];

    // Swap stops between the two routes
    const stopsA = routeA.stops;
    const stopsB = routeB.stops;
    routeA.stops = stopsB;
    routeB.stops = stopsA;

    // Recalculate sequences for both routes
    routeA.stops.forEach((stop, idx) => {
      stop.sequence = idx + 1;
    });
    routeB.stops.forEach((stop, idx) => {
      stop.sequence = idx + 1;
    });

    // Reoptimize both routes via VROOM
    const affectedRouteIds = [routeA.routeId, routeB.routeId];

    // Collect all order IDs from both routes for DB lookup
    const allOrderIds = affectedRouteIds.flatMap((routeId) => {
      const route = result.routes.find((r) => r.routeId === routeId);
      if (!route) return [];
      return route.stops.flatMap((s) => s.groupedOrderIds || [s.orderId]);
    });

    if (allOrderIds.length > 0) {
      // Get orders from database
      const orderData = await db.query.orders.findMany({
        where: and(
          inArray(orders.id, allOrderIds),
          withTenantFilter(orders, [], tenantCtx.companyId),
        ),
      });

      // Get vehicle data for both vehicles
      const vehicleData = await db.query.vehicles.findMany({
        where: and(
          inArray(vehicles.id, [vehicleAId, vehicleBId]),
          withTenantFilter(vehicles, [], tenantCtx.companyId),
        ),
      });

      // Reoptimize each affected route
      for (const routeId of affectedRouteIds) {
        const route = result.routes.find((r) => r.routeId === routeId);
        if (!route || route.stops.length === 0) continue;

        const vehicleInfo = vehicleData.find((v) => v.id === route.vehicleId);
        if (!vehicleInfo) continue;

        const routeOrderIds = route.stops.flatMap(
          (s) => s.groupedOrderIds || [s.orderId],
        );
        const routeOrders = orderData.filter((o) =>
          routeOrderIds.includes(o.id),
        );

        if (routeOrders.length === 0) continue;

        // Build VROOM input for single-vehicle optimization
        const ordersForOptim: OrderForOptimization[] = routeOrders.map((o) => ({
          id: o.id,
          trackingId: o.trackingId,
          address: o.address,
          latitude: parseFloat(String(o.latitude)),
          longitude: parseFloat(String(o.longitude)),
          weightRequired: o.weightRequired || 0,
          volumeRequired: o.volumeRequired || 0,
          serviceTime: 300, // Default 5 minutes
          priority: 1,
        }));

        const vehicleForOptim: VehicleForOptimization = {
          id: vehicleInfo.id,
          plate: vehicleInfo.plate || vehicleInfo.id,
          maxWeight: vehicleInfo.weightCapacity || 1000,
          maxVolume: vehicleInfo.volumeCapacity || 10,
          originLatitude: parseFloat(
            String(
              vehicleInfo.originLatitude || result.depot?.latitude || -12.0464,
            ),
          ),
          originLongitude: parseFloat(
            String(
              vehicleInfo.originLongitude ||
                result.depot?.longitude ||
                -77.0428,
            ),
          ),
        };

        const depot: DepotConfig = {
          latitude: result.depot?.latitude || -12.0464,
          longitude: result.depot?.longitude || -77.0428,
        };

        try {
          const optimResult = await vroomOptimizeRoutes(
            ordersForOptim,
            [vehicleForOptim],
            { depot, objective: "DISTANCE" },
          );

          // Update route with optimized stops
          if (optimResult.routes.length > 0) {
            const optimRoute = optimResult.routes[0];

            // Map optimized stops back to our format
            const optimizedStops = optimRoute.stops.map((optStop, idx) => {
              const originalStop = route.stops.find(
                (s) =>
                  s.orderId === optStop.orderId ||
                  (s.groupedOrderIds &&
                    s.groupedOrderIds.includes(optStop.orderId)),
              );
              // Convert arrival time to ISO string if it's a number (timestamp)
              const arrivalTime = optStop.arrivalTime
                ? typeof optStop.arrivalTime === "number"
                  ? new Date(optStop.arrivalTime * 1000).toISOString()
                  : String(optStop.arrivalTime)
                : undefined;
              return {
                orderId: optStop.orderId,
                trackingId: originalStop?.trackingId || optStop.orderId,
                sequence: idx + 1,
                address: originalStop?.address || "",
                latitude: String(optStop.latitude),
                longitude: String(optStop.longitude),
                estimatedArrival: arrivalTime,
                groupedOrderIds: originalStop?.groupedOrderIds,
                groupedTrackingIds: originalStop?.groupedTrackingIds,
              };
            });

            route.stops = optimizedStops;
            route.totalDistance = optimRoute.totalDistance;
            route.totalDuration = optimRoute.totalDuration;
            route.totalWeight = optimRoute.totalWeight || 0;
            route.totalVolume = optimRoute.totalVolume || 0;
            route.geometry = optimRoute.geometry;
          }
        } catch (err) {
          console.error(`Error reoptimizing route ${routeId}:`, err);
          // Keep the route as-is if optimization fails
        }
      }
    }

    // Recalculate metrics
    result.metrics.totalRoutes = result.routes.length;
    result.metrics.totalStops = result.routes.reduce(
      (sum, r) => sum + r.stops.length,
      0,
    );
    result.metrics.totalDistance = result.routes.reduce(
      (sum, r) => sum + r.totalDistance,
      0,
    );
    result.metrics.totalDuration = result.routes.reduce(
      (sum, r) => sum + r.totalDuration,
      0,
    );

    // Update summary
    result.summary.optimizedAt = new Date().toISOString();

    // Save updated result to database
    await db
      .update(optimizationJobs)
      .set({
        result: result as unknown,
        updatedAt: new Date(),
      })
      .where(eq(optimizationJobs.id, jobId));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error swapping vehicles:", error);
    return NextResponse.json(
      { error: "Failed to swap vehicles" },
      { status: 500 },
    );
  }
}
