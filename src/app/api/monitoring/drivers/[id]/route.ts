import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { drivers, fleets, vehicles, routeStops, optimizationJobs } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/tenant";
import { eq, and, desc, sql } from "drizzle-orm";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// GET - Get detailed route information for a specific driver
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json({ error: "Missing tenant context" }, { status: 401 });
  }

  setTenantContext(tenantCtx);
  const { id: driverId } = await params;

  try {
    // Get driver details
    const driver = await db.query.drivers.findFirst({
      where: and(
        eq(drivers.id, driverId),
        withTenantFilter(drivers)
      ),
      with: {
        fleet: true,
      },
    });

    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }

    // Get the most recent confirmed optimization job
    const confirmedJob = await db.query.optimizationJobs.findFirst({
      where: and(
        withTenantFilter(optimizationJobs),
        eq(optimizationJobs.status, "COMPLETED")
      ),
      orderBy: [desc(optimizationJobs.createdAt)],
    });

    let routeData = null;
    let vehicleData = null;

    if (confirmedJob) {
      // Try to get route stops from database first
      const dbStops = await db.query.routeStops.findMany({
        where: and(
          eq(routeStops.jobId, confirmedJob.id),
          eq(routeStops.driverId, driverId)
        ),
        with: {
          vehicle: true,
          order: true,
        },
        orderBy: [routeStops.sequence],
      });

      if (dbStops.length > 0) {
        // Use actual stop data from database
        const firstStop = dbStops[0];
        vehicleData = firstStop.vehicle;

        // Calculate metrics from actual stops
        const completedStops = dbStops.filter(s => s.status === "COMPLETED");
        const failedStops = dbStops.filter(s => s.status === "FAILED");
        const skippedStops = dbStops.filter(s => s.status === "SKIPPED");
        const inProgressStops = dbStops.filter(s => s.status === "IN_PROGRESS");

        // Get route info from job result or use first stop's routeId
        let routeInfo = null;
        if (confirmedJob?.result) {
          try {
            const parsedResult = JSON.parse(confirmedJob.result);
            routeInfo = parsedResult?.routes?.find((r: any) => r.driverId === driverId);
          } catch {
            // Ignore parse errors
          }
        }

        routeData = {
          routeId: firstStop.routeId,
          jobId: confirmedJob.id,
          vehicle: {
            id: vehicleData.id,
            plate: vehicleData.plate,
            brand: vehicleData.brand,
            model: vehicleData.model,
          },
          metrics: {
            totalDistance: routeInfo?.totalDistance || 0,
            totalDuration: routeInfo?.totalDuration || 0,
            totalWeight: routeInfo?.totalWeight || 0,
            totalVolume: routeInfo?.totalVolume || 0,
            utilizationPercentage: routeInfo?.utilizationPercentage || 0,
            timeWindowViolations: failedStops.length + skippedStops.length,
          },
          stops: dbStops.map(stop => ({
            id: stop.id,
            orderId: stop.orderId,
            trackingId: stop.order?.trackingId || `ORD-${stop.orderId.slice(0, 8)}`,
            sequence: stop.sequence,
            address: stop.address,
            latitude: stop.latitude,
            longitude: stop.longitude,
            status: stop.status,
            estimatedArrival: stop.estimatedArrival?.toISOString() || null,
            completedAt: stop.completedAt?.toISOString() || null,
            startedAt: stop.startedAt?.toISOString() || null,
            notes: stop.notes || null,
            timeWindowStart: stop.timeWindowStart?.toISOString() || null,
            timeWindowEnd: stop.timeWindowEnd?.toISOString() || null,
          })),
          assignmentQuality: routeInfo?.assignmentQuality,
        };
      } else if (confirmedJob?.result) {
        // Fallback to job result if no stops in database yet
        try {
          const parsedResult = JSON.parse(confirmedJob.result);
          const route = parsedResult?.routes?.find((r: any) => r.driverId === driverId);

          if (route) {
            // Get vehicle details
            vehicleData = await db.query.vehicles.findFirst({
              where: eq(vehicles.id, route.vehicleId),
            });

            // Build route data with stops (using mock status since no DB data yet)
            routeData = {
              routeId: route.routeId,
              jobId: confirmedJob.id,
              vehicle: {
                id: route.vehicleId,
                plate: route.vehiclePlate,
                brand: vehicleData?.brand || "Unknown",
                model: vehicleData?.model || "Unknown",
              },
              metrics: {
                totalDistance: route.totalDistance,
                totalDuration: route.totalDuration,
                totalWeight: route.totalWeight,
                totalVolume: route.totalVolume,
                utilizationPercentage: route.utilizationPercentage,
                timeWindowViolations: route.timeWindowViolations,
              },
              stops: route.stops.map((stop: any, index: number) => ({
                ...stop,
                status: "PENDING", // All stops start as PENDING
                estimatedArrival: stop.estimatedArrival || calculateEstimatedArrival(index),
                completedAt: null,
              })),
              assignmentQuality: route.assignmentQuality,
            };
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    return NextResponse.json({
      data: {
        driver: {
          id: driver.id,
          name: driver.name,
          status: driver.status,
          identification: driver.identification,
          email: driver.email,
          phone: driver.phone,
          fleet: {
            id: driver.fleet?.id,
            name: driver.fleet?.name,
            type: driver.fleet?.type,
          },
        },
        route: routeData,
      },
    });
  } catch (error) {
    console.error("Error fetching driver route detail:", error);
    return NextResponse.json(
      { error: "Failed to fetch driver route detail" },
      { status: 500 }
    );
  }
}

// Calculate estimated arrival time for a stop
function calculateEstimatedArrival(index: number): string {
  const baseTime = Date.now();
  const minutesPerStop = 15;
  return new Date(baseTime + index * minutesPerStop * 60 * 1000).toISOString();
}
