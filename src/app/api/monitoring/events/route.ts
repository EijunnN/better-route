import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { routeStops, routeStopHistory, users, vehicles, optimizationJobs } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContext } from "@/lib/routing/route-helpers";

// GET - Get recent stop events (completed, failed, skipped) in last 24 hours
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
    // Get the most recent confirmed job
    const confirmedJob = await db.query.optimizationJobs.findFirst({
      where: and(
        withTenantFilter(optimizationJobs, [], tenantCtx.companyId),
        eq(optimizationJobs.status, "COMPLETED"),
      ),
      orderBy: [desc(optimizationJobs.createdAt)],
    });

    if (!confirmedJob) {
      return NextResponse.json({ data: [] });
    }

    // Get stops that have been updated in the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentStops = await db.query.routeStops.findMany({
      where: and(
        eq(routeStops.jobId, confirmedJob.id),
        inArray(routeStops.status, ["COMPLETED", "FAILED", "SKIPPED"]),
        gte(routeStops.updatedAt, twentyFourHoursAgo),
      ),
      columns: {
        id: true,
        routeId: true,
        sequence: true,
        address: true,
        latitude: true,
        longitude: true,
        status: true,
        failureReason: true,
        notes: true,
        completedAt: true,
        updatedAt: true,
        userId: true,
        vehicleId: true,
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
        vehicle: {
          columns: {
            id: true,
            plate: true,
          },
        },
      },
      orderBy: [desc(routeStops.updatedAt)],
      limit: 50,
    });

    // Transform to event format
    const events = recentStops.map((stop) => ({
      id: stop.id,
      type: stop.status as "COMPLETED" | "FAILED" | "SKIPPED",
      stopId: stop.id,
      trackingId: stop.order?.trackingId || "N/A",
      address: stop.address,
      driverName: stop.user?.name || "Sin asignar",
      vehiclePlate: stop.vehicle?.plate || "Sin vehículo",
      routeId: stop.routeId,
      sequence: stop.sequence,
      timestamp: (stop.completedAt || stop.updatedAt).toISOString(),
      failureReason: stop.failureReason,
      notes: stop.notes,
      latitude: stop.latitude,
      longitude: stop.longitude,
    }));

    return NextResponse.json({ data: events });
  } catch (error) {
    console.error("Error fetching monitoring events:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 },
    );
  }
}
