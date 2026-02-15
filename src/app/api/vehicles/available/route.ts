import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vehicleFleets, vehicles } from "@/db/schema";
import { setTenantContext } from "@/lib/infra/tenant";
import { vehicleAvailabilityQuerySchema } from "@/lib/validations/vehicle-status";

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
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const searchParams = request.nextUrl.searchParams;
    const queryParams = vehicleAvailabilityQuerySchema.parse({
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      fleetId: searchParams.get("fleetId") || undefined,
      limit: searchParams.get("limit") || "50",
      offset: searchParams.get("offset") || "0",
    });

    // Build query conditions
    const conditions = [
      eq(vehicles.companyId, tenantCtx.companyId),
      eq(vehicles.active, true),
      // Vehicle must be in AVAILABLE status
      eq(vehicles.status, "AVAILABLE" as const),
    ];

    // If fleetId is specified, get vehicle IDs that belong to that fleet
    let vehicleIdsInFleet: string[] | null = null;
    if (queryParams.fleetId) {
      const vehiclesInFleet = await db
        .select({ vehicleId: vehicleFleets.vehicleId })
        .from(vehicleFleets)
        .where(
          and(
            eq(vehicleFleets.fleetId, queryParams.fleetId),
            eq(vehicleFleets.companyId, tenantCtx.companyId),
          ),
        );
      vehicleIdsInFleet = vehiclesInFleet.map((v) => v.vehicleId);

      if (vehicleIdsInFleet.length === 0) {
        // No vehicles in this fleet
        return NextResponse.json({
          data: [],
          vehicles: [],
          total: 0,
          limit: queryParams.limit,
          offset: queryParams.offset,
          dateRange:
            queryParams.startDate && queryParams.endDate
              ? {
                  startDate: queryParams.startDate,
                  endDate: queryParams.endDate,
                }
              : null,
        });
      }

      conditions.push(inArray(vehicles.id, vehicleIdsInFleet));
    }

    // Fetch available vehicles
    const availableVehicles = await db.query.vehicles.findMany({
      where: and(...conditions),
      limit: queryParams.limit,
      offset: queryParams.offset,
      with: {
        vehicleFleets: {
          with: {
            fleet: true,
          },
        },
        assignedDriver: true,
      },
    });

    // Transform to include fleet info
    const vehiclesWithFleets = availableVehicles.map((vehicle) => ({
      id: vehicle.id,
      name: vehicle.name,
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      type: vehicle.type,
      status: vehicle.status,
      weightCapacity: vehicle.weightCapacity,
      volumeCapacity: vehicle.volumeCapacity,
      maxValueCapacity: vehicle.maxValueCapacity,
      maxUnitsCapacity: vehicle.maxUnitsCapacity,
      maxOrders: vehicle.maxOrders,
      loadType: vehicle.loadType,
      refrigerated: vehicle.refrigerated,
      heated: vehicle.heated,
      lifting: vehicle.lifting,
      licenseRequired: vehicle.licenseRequired,
      // Origin location for map display
      originLatitude: vehicle.originLatitude,
      originLongitude: vehicle.originLongitude,
      originAddress: vehicle.originAddress,
      fleetIds: vehicle.vehicleFleets?.map((vf) => vf.fleetId) || [],
      fleets:
        vehicle.vehicleFleets?.map((vf) => ({
          id: vf.fleet?.id,
          name: vf.fleet?.name,
        })) || [],
      assignedDriver: vehicle.assignedDriver
        ? {
            id: vehicle.assignedDriver.id,
            name: vehicle.assignedDriver.name,
          }
        : null,
    }));

    // Get total count
    const countResult = await db
      .select({ count: vehicles.id })
      .from(vehicles)
      .where(and(...conditions));

    const total = countResult.length;

    return NextResponse.json({
      data: vehiclesWithFleets,
      vehicles: vehiclesWithFleets,
      total,
      limit: queryParams.limit,
      offset: queryParams.offset,
      dateRange:
        queryParams.startDate && queryParams.endDate
          ? {
              startDate: queryParams.startDate,
              endDate: queryParams.endDate,
            }
          : null,
    });
  } catch (error) {
    console.error("Error fetching available vehicles:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Error fetching available vehicles" },
      { status: 500 },
    );
  }
}
