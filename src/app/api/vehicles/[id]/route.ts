import { and, eq, inArray, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { fleets, vehicleFleetHistory, vehicleFleets, vehicles } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { logDelete, logUpdate } from "@/lib/audit";
import { setTenantContext } from "@/lib/tenant";
import { updateVehicleSchema } from "@/lib/validations/vehicle";

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

async function getVehicle(id: string, companyId: string) {
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.companyId, companyId)))
    .limit(1);

  return vehicle;
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
    const vehicle = await getVehicle(id, tenantCtx.companyId);

    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    return NextResponse.json(vehicle);
  } catch (error) {
    console.error("Error fetching vehicle:", error);
    return NextResponse.json(
      { error: "Error fetching vehicle" },
      { status: 500 },
    );
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
    const existingVehicle = await getVehicle(id, tenantCtx.companyId);

    if (!existingVehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = updateVehicleSchema.parse(body);

    // Check for duplicate plate if plate is being updated
    if (validatedData.plate && validatedData.plate !== existingVehicle.plate) {
      const duplicateVehicle = await db
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

      if (duplicateVehicle.length > 0) {
        return NextResponse.json(
          { error: "Ya existe un vehículo con esta matrícula en la empresa" },
          { status: 400 },
        );
      }
    }

    // Handle fleet IDs (M:N relationship via vehicleFleets)
    let fleetIdsToUpdate: string[] | null = null;
    if (validatedData.fleetIds !== undefined) {
      try {
        fleetIdsToUpdate = typeof validatedData.fleetIds === "string"
          ? JSON.parse(validatedData.fleetIds)
          : validatedData.fleetIds;

        // Validate that all fleet IDs exist and belong to this company
        if (fleetIdsToUpdate && fleetIdsToUpdate.length > 0) {
          const validFleets = await db
            .select({ id: fleets.id })
            .from(fleets)
            .where(
              and(
                inArray(fleets.id, fleetIdsToUpdate),
                eq(fleets.companyId, tenantCtx.companyId),
              ),
            );

          if (validFleets.length !== fleetIdsToUpdate.length) {
            return NextResponse.json(
              { error: "Una o más flotas no encontradas o no pertenecen a esta empresa" },
              { status: 400 },
            );
          }
        }
      } catch {
        return NextResponse.json(
          { error: "Formato inválido para fleetIds" },
          { status: 400 },
        );
      }
    }

    // Remove fleetIds from updateData as it's handled via junction table
    const { fleetIds: _, ...restValidatedData } = validatedData;
    const updateData: any = { ...restValidatedData };
    if (validatedData.insuranceExpiry !== undefined) {
      updateData.insuranceExpiry = validatedData.insuranceExpiry
        ? new Date(validatedData.insuranceExpiry)
        : null;
    }
    if (validatedData.inspectionExpiry !== undefined) {
      updateData.inspectionExpiry = validatedData.inspectionExpiry
        ? new Date(validatedData.inspectionExpiry)
        : null;
    }
    updateData.updatedAt = new Date();

    const [updatedVehicle] = await db
      .update(vehicles)
      .set(updateData)
      .where(eq(vehicles.id, id))
      .returning();

    // Update vehicleFleets M:N relationship if fleetIds was provided
    if (fleetIdsToUpdate !== null) {
      // Get current fleet IDs for this vehicle
      const currentVehicleFleets = await db
        .select({ fleetId: vehicleFleets.fleetId })
        .from(vehicleFleets)
        .where(
          and(
            eq(vehicleFleets.vehicleId, id),
            eq(vehicleFleets.companyId, tenantCtx.companyId),
          ),
        );
      const currentFleetIds = currentVehicleFleets.map((vf) => vf.fleetId);

      // Find fleets to add and remove
      const fleetsToAdd = fleetIdsToUpdate.filter((fid) => !currentFleetIds.includes(fid));
      const fleetsToRemove = currentFleetIds.filter((fid) => !fleetIdsToUpdate.includes(fid));

      // Remove old fleet associations
      if (fleetsToRemove.length > 0) {
        await db
          .delete(vehicleFleets)
          .where(
            and(
              eq(vehicleFleets.vehicleId, id),
              inArray(vehicleFleets.fleetId, fleetsToRemove),
            ),
          );

        // Record history for removed fleets
        for (const fleetId of fleetsToRemove) {
          await db.insert(vehicleFleetHistory).values({
            companyId: tenantCtx.companyId,
            vehicleId: id,
            previousFleetId: fleetId,
            newFleetId: null,
            userId: tenantCtx.userId,
            reason: body.reason || "Vehículo removido de la flota",
          });
        }
      }

      // Add new fleet associations
      if (fleetsToAdd.length > 0) {
        await db.insert(vehicleFleets).values(
          fleetsToAdd.map((fleetId) => ({
            companyId: tenantCtx.companyId,
            vehicleId: id,
            fleetId,
          })),
        );

        // Record history for added fleets
        for (const fleetId of fleetsToAdd) {
          await db.insert(vehicleFleetHistory).values({
            companyId: tenantCtx.companyId,
            vehicleId: id,
            previousFleetId: null,
            newFleetId: fleetId,
            userId: tenantCtx.userId,
            reason: body.reason || "Vehículo asignado a la flota",
          });
        }
      }
    }

    // Log update
    await logUpdate("vehicle", id, {
      before: existingVehicle,
      after: updatedVehicle,
    });

    // Get updated fleet associations
    const updatedVehicleFleets = await db
      .select({ fleetId: vehicleFleets.fleetId })
      .from(vehicleFleets)
      .where(eq(vehicleFleets.vehicleId, id));

    const response: any = {
      ...updatedVehicle,
      fleetIds: updatedVehicleFleets.map((vf) => vf.fleetId),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error updating vehicle:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Error updating vehicle" },
      { status: 500 },
    );
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
    const existingVehicle = await getVehicle(id, tenantCtx.companyId);

    if (!existingVehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    // Soft delete by setting active to false
    const [deletedVehicle] = await db
      .update(vehicles)
      .set({
        active: false,
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, id))
      .returning();

    // Log deletion
    await logDelete("vehicle", id, existingVehicle);

    return NextResponse.json(deletedVehicle);
  } catch (error) {
    console.error("Error deleting vehicle:", error);
    return NextResponse.json(
      { error: "Error deleting vehicle" },
      { status: 500 },
    );
  }
}
