import { and, asc, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationJobs, orders, routeStops, users } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/tenant";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// GET - Get detailed driver information with route and stops
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Contexto de tenant faltante" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);
  const { id: driverId } = await params;

  try {
    // Get driver info
    const driver = await db.query.users.findFirst({
      where: and(
        withTenantFilter(users, [], tenantCtx.companyId),
        eq(users.id, driverId),
      ),
      columns: {
        id: true,
        name: true,
        email: true,
        phone: true,
        identification: true,
        driverStatus: true,
        primaryFleetId: true,
      },
      with: {
        primaryFleet: {
          columns: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    if (!driver) {
      return NextResponse.json(
        { error: "Conductor no encontrado" },
        { status: 404 },
      );
    }

    // Get the most recent confirmed optimization job
    const confirmedJob = await db.query.optimizationJobs.findFirst({
      where: and(
        withTenantFilter(optimizationJobs, [], tenantCtx.companyId),
        eq(optimizationJobs.status, "COMPLETED"),
      ),
      orderBy: [desc(optimizationJobs.createdAt)],
    });

    // Build driver response
    const driverResponse = {
      id: driver.id,
      name: driver.name,
      status: driver.driverStatus || "AVAILABLE",
      identification: driver.identification || "",
      email: driver.email,
      phone: driver.phone,
      fleet: {
        id: driver.primaryFleet?.id || "",
        name: driver.primaryFleet?.name || "Sin flota",
        type: driver.primaryFleet?.type || "LIGHT_LOAD",
      },
    };

    // If no confirmed job, return driver without route
    if (!confirmedJob) {
      return NextResponse.json({
        data: {
          driver: driverResponse,
          route: null,
        },
      });
    }

    // Get stops for this driver from the confirmed job
    const stops = await db.query.routeStops.findMany({
      where: and(
        eq(routeStops.jobId, confirmedJob.id),
        eq(routeStops.userId, driverId),
      ),
      orderBy: [asc(routeStops.sequence)],
      with: {
        order: {
          columns: {
            trackingId: true,
          },
        },
        vehicle: {
          columns: {
            id: true,
            plate: true,
            name: true,
            brand: true,
            model: true,
            maxOrders: true,
          },
        },
      },
    });

    // If driver has no stops in this job
    if (stops.length === 0) {
      return NextResponse.json({
        data: {
          driver: driverResponse,
          route: null,
        },
      });
    }

    // Get vehicle info from the first stop
    const vehicle = stops[0].vehicle;

    // Calculate route metrics
    let totalDistance = 0;
    let totalDuration = 0;
    let totalWeight = 0;
    let totalVolume = 0;
    let timeWindowViolations = 0;

    // Get additional order info for weight/volume
    const ordersData = await db.query.orders.findMany({
      where: and(
        withTenantFilter(orders, [], tenantCtx.companyId),
        eq(orders.active, true),
      ),
      columns: {
        id: true,
        weightRequired: true,
        volumeRequired: true,
      },
    });
    const orderMap = new Map(ordersData.map((o) => [o.id, o]));

    stops.forEach((stop) => {
      const order = orderMap.get(stop.orderId);
      if (order) {
        totalWeight += order.weightRequired || 0;
        totalVolume += order.volumeRequired || 0;
      }

      // Check for time window violations
      if (stop.completedAt && stop.timeWindowEnd) {
        if (stop.completedAt > stop.timeWindowEnd) {
          timeWindowViolations++;
        }
      } else if (
        stop.status === "PENDING" &&
        stop.timeWindowEnd &&
        new Date() > stop.timeWindowEnd
      ) {
        timeWindowViolations++;
      }
    });

    // Parse result from job for distance/duration metrics
    if (confirmedJob.result) {
      try {
        const parsedResult = JSON.parse(confirmedJob.result);
        const driverRoute = parsedResult.routes?.find(
          (r: { driverId?: string }) => r.driverId === driverId,
        );
        if (driverRoute) {
          totalDistance = driverRoute.totalDistance || 0;
          totalDuration = driverRoute.totalDuration || 0;
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Calculate utilization (simple estimate based on orders count)
    const maxOrders = vehicle?.maxOrders || 20; // Use vehicle's maxOrders or default
    const utilizationPercentage = Math.min(
      100,
      Math.round((stops.length / maxOrders) * 100),
    );

    // Build stops list
    const stopsData = stops.map((stop) => ({
      id: stop.id,
      orderId: stop.orderId,
      trackingId: stop.order?.trackingId || "",
      sequence: stop.sequence,
      address: stop.address,
      latitude: stop.latitude,
      longitude: stop.longitude,
      status: stop.status,
      estimatedArrival: stop.estimatedArrival?.toISOString(),
      completedAt: stop.completedAt?.toISOString() || null,
      startedAt: stop.startedAt?.toISOString() || null,
      notes: stop.notes,
      timeWindowStart: stop.timeWindowStart?.toISOString() || null,
      timeWindowEnd: stop.timeWindowEnd?.toISOString() || null,
    }));

    const routeId = stops[0].routeId;

    return NextResponse.json({
      data: {
        driver: driverResponse,
        route: {
          routeId,
          jobId: confirmedJob.id,
          vehicle: {
            id: vehicle?.id || "",
            plate: vehicle?.plate || vehicle?.name || "",
            brand: vehicle?.brand || "",
            model: vehicle?.model || "",
          },
          metrics: {
            totalDistance,
            totalDuration,
            totalWeight,
            totalVolume,
            utilizationPercentage,
            timeWindowViolations,
          },
          stops: stopsData,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching driver detail:", error);
    return NextResponse.json(
      { error: "Error al obtener detalle del conductor" },
      { status: 500 },
    );
  }
}
