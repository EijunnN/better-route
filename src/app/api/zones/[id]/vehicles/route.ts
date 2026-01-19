import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vehicles, zones, zoneVehicles } from "@/db/schema";
import { TenantAccessDeniedError, withTenantFilter } from "@/db/tenant-aware";
import { logCreate, logUpdate } from "@/lib/audit";
import { setTenantContext } from "@/lib/tenant";
import { bulkZoneVehicleSchema } from "@/lib/validations/zone";

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

// GET - Get all vehicles assigned to this zone
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { id: zoneId } = await params;

    // Verify zone exists and belongs to tenant
    const whereClause = withTenantFilter(
      zones,
      [eq(zones.id, zoneId)],
      tenantCtx.companyId,
    );
    const [zone] = await db.select().from(zones).where(whereClause).limit(1);

    if (!zone) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    // Get all active vehicle assignments for this zone
    const assignments = await db
      .select({
        id: zoneVehicles.id,
        vehicleId: zoneVehicles.vehicleId,
        assignedDays: zoneVehicles.assignedDays,
        active: zoneVehicles.active,
        vehicleName: vehicles.name,
        vehiclePlate: vehicles.plate,
      })
      .from(zoneVehicles)
      .innerJoin(vehicles, eq(zoneVehicles.vehicleId, vehicles.id))
      .where(
        and(eq(zoneVehicles.zoneId, zoneId), eq(zoneVehicles.active, true)),
      );

    return NextResponse.json({
      zoneId,
      zoneName: zone.name,
      vehicles: assignments.map((a) => ({
        id: a.vehicleId,
        name: a.vehicleName,
        plate: a.vehiclePlate,
        assignedDays: a.assignedDays ? JSON.parse(a.assignedDays) : null,
        assignmentId: a.id,
      })),
      count: assignments.length,
    });
  } catch (error) {
    console.error("Error fetching zone vehicles:", error);
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error fetching zone vehicles" },
      { status: 500 },
    );
  }
}

// POST - Bulk assign vehicles to this zone (replaces existing assignments)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { id: zoneId } = await params;
    const body = await request.json();
    const validatedData = bulkZoneVehicleSchema.parse({ ...body, zoneId });

    // Verify zone exists and belongs to tenant
    const whereClause = withTenantFilter(
      zones,
      [eq(zones.id, zoneId)],
      tenantCtx.companyId,
    );
    const [zone] = await db.select().from(zones).where(whereClause).limit(1);

    if (!zone) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    // Verify all vehicles exist and belong to tenant
    if (validatedData.vehicleIds.length > 0) {
      const vehicleWhereClause = withTenantFilter(
        vehicles,
        [inArray(vehicles.id, validatedData.vehicleIds)],
        tenantCtx.companyId,
      );
      const existingVehicles = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(vehicleWhereClause);

      const existingIds = new Set(existingVehicles.map((v) => v.id));
      const missingIds = validatedData.vehicleIds.filter(
        (id) => !existingIds.has(id),
      );

      if (missingIds.length > 0) {
        return NextResponse.json(
          {
            error: "Some vehicles not found or do not belong to this company",
            missingIds,
          },
          { status: 400 },
        );
      }
    }

    // Deactivate all existing assignments for this zone
    await db
      .update(zoneVehicles)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(zoneVehicles.zoneId, zoneId));

    // Create or reactivate assignments
    const assignedDaysJson = validatedData.assignedDays
      ? JSON.stringify(validatedData.assignedDays)
      : null;

    const createdAssignments = [];

    for (const vehicleId of validatedData.vehicleIds) {
      // Check if assignment already exists
      const existing = await db
        .select()
        .from(zoneVehicles)
        .where(
          and(
            eq(zoneVehicles.zoneId, zoneId),
            eq(zoneVehicles.vehicleId, vehicleId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        // Reactivate existing assignment
        const [updated] = await db
          .update(zoneVehicles)
          .set({
            active: true,
            assignedDays: assignedDaysJson,
            updatedAt: new Date(),
          })
          .where(eq(zoneVehicles.id, existing[0].id))
          .returning();
        createdAssignments.push(updated);

        await logUpdate("zone_vehicle", existing[0].id, {
          before: existing[0],
          after: updated,
        });
      } else {
        // Create new assignment
        const [created] = await db
          .insert(zoneVehicles)
          .values({
            companyId: tenantCtx.companyId,
            zoneId,
            vehicleId,
            assignedDays: assignedDaysJson,
            active: true,
          })
          .returning();
        createdAssignments.push(created);

        await logCreate("zone_vehicle", created.id, created);
      }
    }

    // Get vehicle details for response
    let vehicleDetails: Array<{
      id: string;
      name: string;
      plate: string | null;
    }> = [];
    if (validatedData.vehicleIds.length > 0) {
      vehicleDetails = await db
        .select({
          id: vehicles.id,
          name: vehicles.name,
          plate: vehicles.plate,
        })
        .from(vehicles)
        .where(inArray(vehicles.id, validatedData.vehicleIds));
    }

    return NextResponse.json(
      {
        zoneId,
        zoneName: zone.name,
        vehicles: vehicleDetails.map((v) => ({
          ...v,
          assignedDays: validatedData.assignedDays,
        })),
        count: createdAssignments.length,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Error assigning vehicles to zone:", error);
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: (error as Error & { errors: unknown }).errors,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Error assigning vehicles to zone" },
      { status: 500 },
    );
  }
}

// DELETE - Remove all vehicle assignments from this zone
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { id: zoneId } = await params;

    // Verify zone exists and belongs to tenant
    const whereClause = withTenantFilter(
      zones,
      [eq(zones.id, zoneId)],
      tenantCtx.companyId,
    );
    const [zone] = await db.select().from(zones).where(whereClause).limit(1);

    if (!zone) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    // Deactivate all assignments for this zone
    await db
      .update(zoneVehicles)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(eq(zoneVehicles.zoneId, zoneId), eq(zoneVehicles.active, true)),
      );

    return NextResponse.json({
      success: true,
      message: "All vehicle assignments removed from zone",
      zoneId,
      zoneName: zone.name,
    });
  } catch (error) {
    console.error("Error removing zone vehicles:", error);
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error removing zone vehicles" },
      { status: 500 },
    );
  }
}
