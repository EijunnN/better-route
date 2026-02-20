import { and, eq, type SQL, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { routeStops } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";

// POST - Create route stops from optimization job result
export async function POST(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    const body = await request.json();
    const { jobId, stops } = body;

    if (!jobId || !Array.isArray(stops) || stops.length === 0) {
      return NextResponse.json(
        { error: "jobId and stops array are required" },
        { status: 400 },
      );
    }

    // Validate each stop
    for (const stop of stops) {
      const userId = stop.driverId || stop.userId;
      if (
        !stop.routeId ||
        !userId ||
        !stop.vehicleId ||
        !stop.orderId ||
        !stop.address ||
        !stop.latitude ||
        !stop.longitude ||
        stop.sequence === undefined
      ) {
        return NextResponse.json(
          {
            error:
              "Each stop must have routeId, driverId/userId, vehicleId, orderId, address, latitude, longitude, and sequence",
          },
          { status: 400 },
        );
      }
    }

    // Delete existing stops for this job (if recreating)
    await db.delete(routeStops).where(eq(routeStops.jobId, jobId));

    // Insert new stops
    const insertedStops = await db
      .insert(routeStops)
      .values(
        stops.map((stop) => ({
          companyId: tenantCtx.companyId,
          jobId,
          routeId: stop.routeId,
          userId: stop.driverId || stop.userId,
          vehicleId: stop.vehicleId,
          orderId: stop.orderId,
          sequence: stop.sequence,
          address: stop.address,
          latitude: stop.latitude,
          longitude: stop.longitude,
          estimatedArrival: stop.estimatedArrival
            ? new Date(stop.estimatedArrival)
            : null,
          estimatedServiceTime: stop.estimatedServiceTime || null,
          timeWindowStart: stop.timeWindowStart
            ? new Date(stop.timeWindowStart)
            : null,
          timeWindowEnd: stop.timeWindowEnd
            ? new Date(stop.timeWindowEnd)
            : null,
          metadata: stop.metadata || null,
        })),
      )
      .returning();

    return NextResponse.json({
      data: insertedStops,
      count: insertedStops.length,
    });
  } catch (error) {
    console.error("Error creating route stops:", error);
    return NextResponse.json(
      { error: "Failed to create route stops" },
      { status: 500 },
    );
  }
}

// GET - List route stops with filters
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
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");
    const routeId = searchParams.get("routeId");
    const userId = searchParams.get("userId") || searchParams.get("driverId");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Build conditions
    const tenantFilter = withTenantFilter(routeStops, [], tenantCtx.companyId);
    const conditions: SQL<unknown>[] = tenantFilter ? [tenantFilter] : [];

    if (jobId) {
      conditions.push(eq(routeStops.jobId, jobId));
    }
    if (routeId) {
      conditions.push(eq(routeStops.routeId, routeId));
    }
    if (userId) {
      conditions.push(eq(routeStops.userId, userId));
    }
    if (status) {
      conditions.push(sql`${routeStops.status} = ${status}`);
    }

    // Get stops
    const stops = await db.query.routeStops.findMany({
      where: and(...conditions),
      orderBy: [routeStops.sequence],
      limit,
      offset,
      with: {
        user: true,
        vehicle: true,
        order: true,
      },
    });

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(routeStops)
      .where(and(...conditions));

    const total = countResult[0]?.count || 0;

    return NextResponse.json({
      data: stops,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching route stops:", error);
    return NextResponse.json(
      { error: "Failed to fetch route stops" },
      { status: 500 },
    );
  }
}
