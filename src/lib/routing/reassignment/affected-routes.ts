import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { routeStops } from "@/db/schema";
import type { AffectedRoute } from "./types";

/**
 * Get affected routes when a driver is absent
 */
export async function getAffectedRoutesForAbsentDriver(
  companyId: string,
  absentDriverId: string,
  jobId?: string,
): Promise<AffectedRoute[]> {
  const conditions = and(
    eq(routeStops.companyId, companyId),
    eq(routeStops.userId, absentDriverId),
  );

  // Filter by specific job if provided
  const jobConditions = jobId
    ? and(conditions, eq(routeStops.jobId, jobId))
    : conditions;

  const stops = await db.query.routeStops.findMany({
    where: jobConditions,
    with: {
      job: true,
      vehicle: true,
      order: true,
    },
  });

  // Group stops by route
  const routesMap = new Map<string, AffectedRoute>();

  for (const stop of stops) {
    const routeId = stop.routeId;

    if (!routesMap.has(routeId)) {
      routesMap.set(routeId, {
        routeId,
        vehicleId: stop.vehicleId,
        vehiclePlate: stop.vehicle?.plate || "Unknown",
        stops: [],
        totalStops: 0,
        pendingStops: 0,
        inProgressStops: 0,
      });
    }

    const route = routesMap.get(routeId);
    if (!route) continue;
    route.stops.push({
      id: stop.id,
      orderId: stop.orderId,
      sequence: stop.sequence,
      address: stop.address,
      latitude: stop.latitude,
      longitude: stop.longitude,
      status: stop.status,
      timeWindowStart: stop.timeWindowStart,
      timeWindowEnd: stop.timeWindowEnd,
      estimatedArrival: stop.estimatedArrival,
    });

    route.totalStops++;
    if (stop.status === "PENDING") {
      route.pendingStops++;
    } else if (stop.status === "IN_PROGRESS") {
      route.inProgressStops++;
    }
  }

  return Array.from(routesMap.values());
}
