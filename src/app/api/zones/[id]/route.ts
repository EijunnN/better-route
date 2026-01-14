import { and, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vehicles, zones, zoneVehicles } from "@/db/schema";
import { TenantAccessDeniedError, withTenantFilter } from "@/db/tenant-aware";
import { logDelete, logUpdate } from "@/lib/audit";
import { setTenantContext } from "@/lib/tenant";
import { updateZoneSchema } from "@/lib/validations/zone";

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

    const { id } = await params;

    // Apply tenant filtering
    const whereClause = withTenantFilter(zones, [eq(zones.id, id)]);

    const [zone] = await db.select().from(zones).where(whereClause).limit(1);

    if (!zone) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    // Get related vehicles
    const relatedVehicles = await db
      .select({
        id: vehicles.id,
        name: vehicles.name,
        plate: vehicles.plate,
        assignedDays: zoneVehicles.assignedDays,
      })
      .from(zoneVehicles)
      .innerJoin(vehicles, eq(zoneVehicles.vehicleId, vehicles.id))
      .where(and(eq(zoneVehicles.zoneId, id), eq(zoneVehicles.active, true)));

    // Parse geometry and activeDays
    let parsedGeometry = null;
    try {
      parsedGeometry = JSON.parse(zone.geometry);
    } catch {
      // Keep as null if parsing fails
    }

    return NextResponse.json({
      ...zone,
      parsedGeometry,
      activeDays: zone.activeDays ? JSON.parse(zone.activeDays) : null,
      vehicles: relatedVehicles.map((v) => ({
        ...v,
        assignedDays: v.assignedDays ? JSON.parse(v.assignedDays) : null,
      })),
      vehicleIds: relatedVehicles.map((v) => v.id),
      vehicleCount: relatedVehicles.length,
    });
  } catch (error) {
    console.error("Error fetching zone:", error);
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error fetching zone" }, { status: 500 });
  }
}

export async function PATCH(
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

    const { id } = await params;
    const body = await request.json();
    const validatedData = updateZoneSchema.parse({ ...body, id });

    // Apply tenant filtering when fetching existing zone
    const existingWhereClause = withTenantFilter(zones, [eq(zones.id, id)]);

    const [existingZone] = await db
      .select()
      .from(zones)
      .where(existingWhereClause)
      .limit(1);

    if (!existingZone) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    // Check for duplicate zone name within the same company (if name is being updated)
    if (validatedData.name && validatedData.name !== existingZone.name) {
      const duplicateZone = await db
        .select()
        .from(zones)
        .where(
          and(
            eq(zones.companyId, tenantCtx.companyId),
            eq(zones.name, validatedData.name),
            eq(zones.active, true),
          ),
        )
        .limit(1);

      if (duplicateZone.length > 0) {
        return NextResponse.json(
          { error: "Ya existe una zona activa con este nombre en la empresa" },
          { status: 400 },
        );
      }
    }

    // If this is being set as default, remove default from other zones
    if (validatedData.isDefault && !existingZone.isDefault) {
      await db
        .update(zones)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(zones.companyId, tenantCtx.companyId),
            eq(zones.isDefault, true),
          ),
        );
    }

    // Build update data
    const { id: _, activeDays, ...updateFields } = validatedData;

    // Update zone data
    const [updatedZone] = await db
      .update(zones)
      .set({
        ...updateFields,
        activeDays:
          activeDays !== undefined
            ? activeDays
              ? JSON.stringify(activeDays)
              : null
            : undefined,
        updatedAt: new Date(),
      })
      .where(existingWhereClause)
      .returning();

    // Get updated relationships for response
    const relatedVehicles = await db
      .select({
        id: vehicles.id,
        name: vehicles.name,
        plate: vehicles.plate,
        assignedDays: zoneVehicles.assignedDays,
      })
      .from(zoneVehicles)
      .innerJoin(vehicles, eq(zoneVehicles.vehicleId, vehicles.id))
      .where(and(eq(zoneVehicles.zoneId, id), eq(zoneVehicles.active, true)));

    // Parse geometry for response
    let parsedGeometry = null;
    try {
      parsedGeometry = JSON.parse(updatedZone.geometry);
    } catch {
      // Keep as null if parsing fails
    }

    // Log update
    await logUpdate("zone", id, {
      before: existingZone,
      after: updatedZone,
    });

    return NextResponse.json({
      ...updatedZone,
      parsedGeometry,
      activeDays: updatedZone.activeDays
        ? JSON.parse(updatedZone.activeDays)
        : null,
      vehicles: relatedVehicles.map((v) => ({
        ...v,
        assignedDays: v.assignedDays ? JSON.parse(v.assignedDays) : null,
      })),
      vehicleCount: relatedVehicles.length,
    });
  } catch (error: unknown) {
    console.error("Error updating zone:", error);
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
    return NextResponse.json({ error: "Error updating zone" }, { status: 500 });
  }
}

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

    const { id } = await params;

    // Apply tenant filtering when fetching existing zone
    const whereClause = withTenantFilter(zones, [eq(zones.id, id)]);

    const [existingZone] = await db
      .select()
      .from(zones)
      .where(whereClause)
      .limit(1);

    if (!existingZone) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    // Check if there are active vehicle assignments in this zone
    const [activeVehicleCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(zoneVehicles)
      .where(and(eq(zoneVehicles.zoneId, id), eq(zoneVehicles.active, true)));

    // Deactivate vehicle relationships first
    if (Number(activeVehicleCount.count) > 0) {
      await db
        .update(zoneVehicles)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(zoneVehicles.zoneId, id));
    }

    // Soft delete - set active to false
    await db
      .update(zones)
      .set({
        active: false,
        isDefault: false, // Remove default status if it was default
        updatedAt: new Date(),
      })
      .where(whereClause);

    // Log deletion
    await logDelete("zone", id, existingZone);

    return NextResponse.json({
      success: true,
      message: "Zona desactivada exitosamente",
      deactivatedVehicles: Number(activeVehicleCount.count),
    });
  } catch (error) {
    console.error("Error deleting zone:", error);
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error deleting zone" }, { status: 500 });
  }
}
