import { and, eq, inArray, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vehicleFleets, vehicles } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { logCreate } from "@/lib/audit";
import { setTenantContext } from "@/lib/tenant";
import { vehicleQuerySchema, vehicleSchema } from "@/lib/validations/vehicle";

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

    const { searchParams } = new URL(request.url);
    const query = vehicleQuerySchema.parse(Object.fromEntries(searchParams));

    const conditions = [];

    // Filter by fleet using junction table
    let vehicleIdsInFleet: string[] | null = null;
    if (query.fleetId) {
      const vehiclesInFleet = await db
        .select({ vehicleId: vehicleFleets.vehicleId })
        .from(vehicleFleets)
        .where(
          and(
            eq(vehicleFleets.fleetId, query.fleetId),
            eq(vehicleFleets.companyId, tenantCtx.companyId),
          ),
        );
      vehicleIdsInFleet = vehiclesInFleet.map((v) => v.vehicleId);

      if (vehicleIdsInFleet.length === 0) {
        // No vehicles in this fleet
        return NextResponse.json({
          data: [],
          meta: {
            total: 0,
            limit: query.limit,
            offset: query.offset,
          },
        });
      }

      conditions.push(inArray(vehicles.id, vehicleIdsInFleet));
    }

    if (query.status) {
      conditions.push(eq(vehicles.status, query.status));
    }
    if (query.type) {
      conditions.push(eq(vehicles.type, query.type));
    }
    if (query.active !== undefined) {
      conditions.push(eq(vehicles.active, query.active));
    }

    // Apply tenant filtering
    const whereClause = withTenantFilter(vehicles, conditions);

    // Use query API to include fleet associations
    const data = await db.query.vehicles.findMany({
      where: whereClause,
      orderBy: (vehicles, { asc }) => [asc(vehicles.name)],
      limit: query.limit,
      offset: query.offset,
      with: {
        vehicleFleets: {
          with: {
            fleet: true,
          },
        },
        assignedDriver: true,
      },
    });

    // Transform to include fleet IDs
    const vehiclesWithFleets = data.map((vehicle) => ({
      ...vehicle,
      fleetIds: vehicle.vehicleFleets?.map((vf) => vf.fleetId) || [],
      fleets:
        vehicle.vehicleFleets?.map((vf) => ({
          id: vf.fleet?.id,
          name: vf.fleet?.name,
        })) || [],
    }));

    const totalResult = await db
      .select({ count: vehicles.id })
      .from(vehicles)
      .where(whereClause);

    return NextResponse.json({
      data: vehiclesWithFleets,
      meta: {
        total: totalResult.length,
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (error) {
    console.error("Error fetching vehicles:", error);
    return NextResponse.json(
      { error: "Error fetching vehicles" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const body = await request.json();
    const validatedData = vehicleSchema.parse(body);

    // Extract fleetIds from validated data
    let fleetIds: string[] = [];
    if (validatedData.fleetIds) {
      try {
        fleetIds =
          typeof validatedData.fleetIds === "string"
            ? JSON.parse(validatedData.fleetIds)
            : validatedData.fleetIds;
      } catch {
        return NextResponse.json(
          { error: "Formato inválido para fleetIds" },
          { status: 400 },
        );
      }
    }

    // Check for duplicate plate within the same company (only if plate is provided)
    if (validatedData.plate) {
      const existingVehicle = await db
        .select()
        .from(vehicles)
        .where(
          and(
            eq(vehicles.companyId, tenantCtx.companyId),
            eq(vehicles.plate, validatedData.plate),
            or(eq(vehicles.active, true), eq(vehicles.active, false)),
          ),
        )
        .limit(1);

      if (existingVehicle.length > 0) {
        return NextResponse.json(
          { error: "Ya existe un vehículo con esta matrícula en la empresa" },
          { status: 400 },
        );
      }
    }

    // Remove fleetIds from data for insert (handled via junction table)
    const { fleetIds: _, ...vehicleInsertData } = validatedData;

    const [newVehicle] = await db
      .insert(vehicles)
      .values({
        ...vehicleInsertData,
        companyId: tenantCtx.companyId,
        insuranceExpiry: vehicleInsertData.insuranceExpiry
          ? new Date(vehicleInsertData.insuranceExpiry)
          : null,
        inspectionExpiry: vehicleInsertData.inspectionExpiry
          ? new Date(vehicleInsertData.inspectionExpiry)
          : null,
        workdayStart: vehicleInsertData.workdayStart || null,
        workdayEnd: vehicleInsertData.workdayEnd || null,
        breakTimeStart: vehicleInsertData.breakTimeStart || null,
        breakTimeEnd: vehicleInsertData.breakTimeEnd || null,
        updatedAt: new Date(),
      })
      .returning();

    // Create fleet associations if fleetIds were provided
    if (fleetIds.length > 0) {
      await db.insert(vehicleFleets).values(
        fleetIds.map((fleetId) => ({
          companyId: tenantCtx.companyId,
          vehicleId: newVehicle.id,
          fleetId,
        })),
      );
    }

    // Log creation
    await logCreate("vehicle", newVehicle.id, newVehicle);

    // Return vehicle with fleet associations
    const result = {
      ...newVehicle,
      fleetIds,
    };

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating vehicle:", error);
    if (error instanceof Error && error.name === "ZodError") {
      const zodError = error as unknown as {
        issues: Array<{ path: (string | number)[]; message: string }>;
      };
      return NextResponse.json(
        {
          error: "Validation failed",
          details: zodError.issues?.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Error creating vehicle" },
      { status: 500 },
    );
  }
}
