import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vehicles, fleets } from "@/db/schema";
import { vehicleAvailabilityQuerySchema } from "@/lib/validations/vehicle-status";
import { VEHICLE_STATUS } from "@/lib/validations/vehicle";
import { eq, and, or, gte, lte } from "drizzle-orm";
import { setTenantContext } from "@/lib/tenant";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");

  if (!companyId) {
    return null;
  }

  return {
    companyId,
    userId: userId || undefined,
  };
}

/**
 * GET /api/vehicles/available
 * Returns vehicles that are available during a specific date range
 * This is a simplified version - actual availability would consider
 * existing planifications/routes in that time range
 */
export async function GET(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 }
      );
    }

    setTenantContext(tenantCtx);

    const searchParams = request.nextUrl.searchParams;
    const queryParams = vehicleAvailabilityQuerySchema.parse({
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
      fleetId: searchParams.get("fleetId"),
      limit: searchParams.get("limit") || "50",
      offset: searchParams.get("offset") || "0",
    });

    // Parse dates
    const startDate = new Date(queryParams.startDate);
    const endDate = new Date(queryParams.endDate);

    // Build query conditions
    const conditions = [
      eq(vehicles.companyId, tenantCtx.companyId),
      eq(vehicles.active, true),
      // Vehicle must be in AVAILABLE status
      eq(vehicles.status, "AVAILABLE" as const),
    ];

    // Filter by fleet if specified
    if (queryParams.fleetId) {
      conditions.push(eq(vehicles.fleetId, queryParams.fleetId));
    }

    // Fetch available vehicles
    const availableVehicles = await db
      .select({
        id: vehicles.id,
        plate: vehicles.plate,
        brand: vehicles.brand,
        model: vehicles.model,
        year: vehicles.year,
        type: vehicles.type,
        status: vehicles.status,
        weightCapacity: vehicles.weightCapacity,
        volumeCapacity: vehicles.volumeCapacity,
        refrigerated: vehicles.refrigerated,
        heated: vehicles.heated,
        lifting: vehicles.lifting,
        licenseRequired: vehicles.licenseRequired,
        fleetId: vehicles.fleetId,
        fleetName: fleets.name,
        fleetType: fleets.type,
      })
      .from(vehicles)
      .leftJoin(fleets, eq(vehicles.fleetId, fleets.id))
      .where(and(...conditions))
      .limit(queryParams.limit)
      .offset(queryParams.offset);

    // Get total count
    const countResult = await db
      .select({ count: vehicles.id })
      .from(vehicles)
      .where(and(...conditions));

    const total = countResult.length;

    // TODO: Filter out vehicles that have planifications in the date range
    // This would require joining with a planifications/routes table
    // For now, we return all AVAILABLE vehicles

    return NextResponse.json({
      vehicles: availableVehicles,
      total,
      limit: queryParams.limit,
      offset: queryParams.offset,
      dateRange: {
        startDate: queryParams.startDate,
        endDate: queryParams.endDate,
      },
    });
  } catch (error) {
    console.error("Error fetching available vehicles:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Error fetching available vehicles" },
      { status: 500 }
    );
  }
}
