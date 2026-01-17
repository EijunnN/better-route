import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationJobs, orders, vehicles } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/tenant";
import {
  type DepotConfig,
  type OrderForOptimization,
  type VehicleForOptimization,
  optimizeRoutes as vroomOptimizeRoutes,
} from "@/lib/vroom-optimizer";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

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

// POST - Reassign orders to different vehicle (supports multiple orders)
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
    const body = await request.json();
    const { orders: ordersToReassign, targetVehicleId } = body;

    // Support both single order (legacy) and multiple orders
    const ordersList: Array<{ orderId: string; sourceRouteId: string | null }> =
      ordersToReassign || (body.orderId ? [{ orderId: body.orderId, sourceRouteId: body.sourceRouteId }] : []);

    if (ordersList.length === 0 || !targetVehicleId) {
      return NextResponse.json(
        { error: "orders and targetVehicleId are required" },
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
      result = JSON.parse(job.result);
    } catch {
      return NextResponse.json(
        { error: "Invalid job result format" },
        { status: 500 },
      );
    }

    // Get the target vehicle info
    const targetVehicle = await db.query.vehicles.findFirst({
      where: and(
        eq(vehicles.id, targetVehicleId),
        withTenantFilter(vehicles, [], tenantCtx.companyId),
      ),
    });

    if (!targetVehicle) {
      return NextResponse.json(
        { error: "Target vehicle not found" },
        { status: 404 },
      );
    }

    // Find or create target route
    let targetRouteIndex = result.routes.findIndex(
      (r) => r.vehicleId === targetVehicleId,
    );

    if (targetRouteIndex === -1) {
      const newRoute: RouteData = {
        routeId: `route-${targetVehicleId}-${Date.now()}`,
        vehicleId: targetVehicleId,
        vehiclePlate: targetVehicle.plate || targetVehicleId,
        stops: [],
        totalDistance: 0,
        totalDuration: 0,
        totalWeight: 0,
        totalVolume: 0,
        utilizationPercentage: 0,
        timeWindowViolations: 0,
      };
      result.routes.push(newRoute);
      targetRouteIndex = result.routes.length - 1;

      // Remove from vehiclesWithoutRoutes if present
      if (result.vehiclesWithoutRoutes) {
        result.vehiclesWithoutRoutes = result.vehiclesWithoutRoutes.filter(
          (v) => v.id !== targetVehicleId,
        );
      }
    }

    const targetRoute = result.routes[targetRouteIndex];
    const affectedSourceRouteIds = new Set<string>();

    // Process each order to reassign
    for (const orderReq of ordersList) {
      const { orderId, sourceRouteId } = orderReq;
      let orderFound = false;

      // Check in routes
      if (sourceRouteId) {
        const sourceRouteIndex = result.routes.findIndex((r) => r.routeId === sourceRouteId);
        if (sourceRouteIndex !== -1) {
          const route = result.routes[sourceRouteIndex];
          const stopIndex = route.stops.findIndex((s) => {
            if (s.groupedOrderIds && s.groupedOrderIds.includes(orderId)) return true;
            return s.orderId === orderId;
          });

          if (stopIndex !== -1) {
            const stop = route.stops[stopIndex];
            // Add to target route
            targetRoute.stops.push({
              orderId: stop.orderId,
              trackingId: stop.trackingId,
              sequence: targetRoute.stops.length + 1,
              address: stop.address,
              latitude: stop.latitude,
              longitude: stop.longitude,
              groupedOrderIds: stop.groupedOrderIds,
              groupedTrackingIds: stop.groupedTrackingIds,
            });
            // Remove from source route
            route.stops.splice(stopIndex, 1);
            affectedSourceRouteIds.add(sourceRouteId);
            orderFound = true;
          }
        }
      }

      // Check in unassigned orders if not found in routes
      if (!orderFound) {
        const unassignedIndex = result.unassignedOrders.findIndex(
          (o) => o.orderId === orderId,
        );
        if (unassignedIndex !== -1) {
          const unassigned = result.unassignedOrders[unassignedIndex];
          targetRoute.stops.push({
            orderId: unassigned.orderId,
            trackingId: unassigned.trackingId,
            sequence: targetRoute.stops.length + 1,
            address: unassigned.address || "",
            latitude: unassigned.latitude || "",
            longitude: unassigned.longitude || "",
          });
          // Remove from unassigned
          result.unassignedOrders.splice(unassignedIndex, 1);
          orderFound = true;
        }
      }

      if (!orderFound) {
        console.warn(`Order ${orderId} not found, skipping`);
      }
    }

    // Recalculate sequences for affected source routes
    for (const sourceRouteId of affectedSourceRouteIds) {
      const route = result.routes.find((r) => r.routeId === sourceRouteId);
      if (route) {
        route.stops.forEach((stop, idx) => {
          stop.sequence = idx + 1;
        });
      }
    }

    // Now reoptimize the affected routes
    // Collect all affected route IDs (source routes + target route)
    const affectedRouteIds: string[] = [
      ...Array.from(affectedSourceRouteIds).filter((routeId) => {
        const route = result.routes.find((r) => r.routeId === routeId);
        return route && route.stops.length > 0;
      }),
      result.routes[targetRouteIndex].routeId,
    ];

    // Get order details for reoptimization
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

      // Get vehicle data
      const vehicleIds = affectedRouteIds.map((routeId) => {
        const route = result.routes.find((r) => r.routeId === routeId);
        return route?.vehicleId;
      }).filter((id): id is string => !!id);

      const vehicleData = await db.query.vehicles.findMany({
        where: and(
          inArray(vehicles.id, vehicleIds),
          withTenantFilter(vehicles, [], tenantCtx.companyId),
        ),
      });

      // Reoptimize each affected route
      for (const routeId of affectedRouteIds) {
        const route = result.routes.find((r) => r.routeId === routeId);
        if (!route || route.stops.length === 0) continue;

        const vehicleInfo = vehicleData.find((v) => v.id === route.vehicleId);
        if (!vehicleInfo) continue;

        const routeOrderIds = route.stops.flatMap((s) => s.groupedOrderIds || [s.orderId]);
        const routeOrders = orderData.filter((o) => routeOrderIds.includes(o.id));

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
          originLatitude: parseFloat(String(vehicleInfo.originLatitude || result.depot?.latitude || -12.0464)),
          originLongitude: parseFloat(String(vehicleInfo.originLongitude || result.depot?.longitude || -77.0428)),
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
                (s) => s.orderId === optStop.orderId ||
                       (s.groupedOrderIds && s.groupedOrderIds.includes(optStop.orderId)),
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

    // Remove empty routes from source routes
    for (const sourceRouteId of affectedSourceRouteIds) {
      const routeIndex = result.routes.findIndex((r) => r.routeId === sourceRouteId);
      if (routeIndex !== -1 && result.routes[routeIndex].stops.length === 0) {
        const emptyRoute = result.routes[routeIndex];

        // Add vehicle back to vehiclesWithoutRoutes
        if (!result.vehiclesWithoutRoutes) {
          result.vehiclesWithoutRoutes = [];
        }
        result.vehiclesWithoutRoutes.push({
          id: emptyRoute.vehicleId,
          plate: emptyRoute.vehiclePlate,
        });

        result.routes.splice(routeIndex, 1);
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
        result: JSON.stringify(result),
        updatedAt: new Date(),
      })
      .where(eq(optimizationJobs.id, jobId));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error reassigning order:", error);
    return NextResponse.json(
      { error: "Failed to reassign order" },
      { status: 500 },
    );
  }
}
