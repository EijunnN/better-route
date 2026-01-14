import { and, eq, inArray, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  fleets,
  userFleetPermissions,
  users,
  vehicleFleets,
  vehicles,
} from "@/db/schema";
import { TenantAccessDeniedError, withTenantFilter } from "@/db/tenant-aware";
import { logDelete, logUpdate } from "@/lib/audit";
import { setTenantContext } from "@/lib/tenant";
import { updateFleetSchema } from "@/lib/validations/fleet";

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
    const whereClause = withTenantFilter(fleets, [eq(fleets.id, id)]);

    const [fleet] = await db.select().from(fleets).where(whereClause).limit(1);

    if (!fleet) {
      return NextResponse.json({ error: "Fleet not found" }, { status: 404 });
    }

    // Get related vehicles
    const relatedVehicles = await db
      .select({
        id: vehicles.id,
        name: vehicles.name,
        plate: vehicles.plate,
      })
      .from(vehicleFleets)
      .innerJoin(vehicles, eq(vehicleFleets.vehicleId, vehicles.id))
      .where(
        and(eq(vehicleFleets.fleetId, id), eq(vehicleFleets.active, true)),
      );

    // Get related users with permissions
    const relatedUsers = await db
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
      })
      .from(userFleetPermissions)
      .innerJoin(users, eq(userFleetPermissions.userId, users.id))
      .where(
        and(
          eq(userFleetPermissions.fleetId, id),
          eq(userFleetPermissions.active, true),
        ),
      );

    return NextResponse.json({
      ...fleet,
      vehicles: relatedVehicles,
      users: relatedUsers,
      vehicleIds: relatedVehicles.map((v) => v.id),
      userIds: relatedUsers.map((u) => u.id),
      vehicleCount: relatedVehicles.length,
      userCount: relatedUsers.length,
    });
  } catch (error) {
    console.error("Error fetching fleet:", error);
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error fetching fleet" },
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
    const body = await request.json();
    const validatedData = updateFleetSchema.parse({ ...body, id });

    // Apply tenant filtering when fetching existing fleet
    const existingWhereClause = withTenantFilter(fleets, [eq(fleets.id, id)]);

    const [existingFleet] = await db
      .select()
      .from(fleets)
      .where(existingWhereClause)
      .limit(1);

    if (!existingFleet) {
      return NextResponse.json({ error: "Fleet not found" }, { status: 404 });
    }

    // Check for duplicate fleet name within the same company (if name is being updated)
    if (validatedData.name && validatedData.name !== existingFleet.name) {
      const duplicateFleet = await db
        .select()
        .from(fleets)
        .where(
          and(
            eq(fleets.companyId, tenantCtx.companyId),
            eq(fleets.name, validatedData.name),
            eq(fleets.active, true),
          ),
        )
        .limit(1);

      if (duplicateFleet.length > 0) {
        return NextResponse.json(
          { error: "Ya existe una flota activa con este nombre en la empresa" },
          { status: 400 },
        );
      }
    }

    // Extract M:N relationship IDs
    const { id: _, vehicleIds, userIds, ...updateData } = validatedData;

    // Update fleet data
    const [updatedFleet] = await db
      .update(fleets)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(existingWhereClause)
      .returning();

    // Update vehicle relationships if provided
    if (vehicleIds !== undefined) {
      // Deactivate existing relationships
      await db
        .update(vehicleFleets)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(vehicleFleets.fleetId, id));

      // Create new relationships
      if (vehicleIds.length > 0) {
        // Check if relationships already exist and reactivate or create new ones
        for (const vehicleId of vehicleIds) {
          const existing = await db
            .select()
            .from(vehicleFleets)
            .where(
              and(
                eq(vehicleFleets.fleetId, id),
                eq(vehicleFleets.vehicleId, vehicleId),
              ),
            )
            .limit(1);

          if (existing.length > 0) {
            await db
              .update(vehicleFleets)
              .set({ active: true, updatedAt: new Date() })
              .where(eq(vehicleFleets.id, existing[0].id));
          } else {
            await db.insert(vehicleFleets).values({
              companyId: tenantCtx.companyId,
              vehicleId,
              fleetId: id,
              active: true,
            });
          }
        }
      }
    }

    // Update user permission relationships if provided
    if (userIds !== undefined) {
      // Deactivate existing relationships
      await db
        .update(userFleetPermissions)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(userFleetPermissions.fleetId, id));

      // Create new relationships
      if (userIds.length > 0) {
        for (const userId of userIds) {
          const existing = await db
            .select()
            .from(userFleetPermissions)
            .where(
              and(
                eq(userFleetPermissions.fleetId, id),
                eq(userFleetPermissions.userId, userId),
              ),
            )
            .limit(1);

          if (existing.length > 0) {
            await db
              .update(userFleetPermissions)
              .set({ active: true, updatedAt: new Date() })
              .where(eq(userFleetPermissions.id, existing[0].id));
          } else {
            await db.insert(userFleetPermissions).values({
              companyId: tenantCtx.companyId,
              userId,
              fleetId: id,
              active: true,
            });
          }
        }
      }
    }

    // Get updated relationships for response
    const relatedVehicles = await db
      .select({
        id: vehicles.id,
        name: vehicles.name,
        plate: vehicles.plate,
      })
      .from(vehicleFleets)
      .innerJoin(vehicles, eq(vehicleFleets.vehicleId, vehicles.id))
      .where(
        and(eq(vehicleFleets.fleetId, id), eq(vehicleFleets.active, true)),
      );

    const relatedUsers = await db
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
      })
      .from(userFleetPermissions)
      .innerJoin(users, eq(userFleetPermissions.userId, users.id))
      .where(
        and(
          eq(userFleetPermissions.fleetId, id),
          eq(userFleetPermissions.active, true),
        ),
      );

    // Log update
    await logUpdate("fleet", id, {
      before: existingFleet,
      after: {
        ...updatedFleet,
        vehicleIds: relatedVehicles.map((v) => v.id),
        userIds: relatedUsers.map((u) => u.id),
      },
    });

    return NextResponse.json({
      ...updatedFleet,
      vehicles: relatedVehicles,
      users: relatedUsers,
      vehicleCount: relatedVehicles.length,
      userCount: relatedUsers.length,
    });
  } catch (error: any) {
    console.error("Error updating fleet:", error);
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Error updating fleet" },
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

    // Apply tenant filtering when fetching existing fleet
    const whereClause = withTenantFilter(fleets, [eq(fleets.id, id)]);

    const [existingFleet] = await db
      .select()
      .from(fleets)
      .where(whereClause)
      .limit(1);

    if (!existingFleet) {
      return NextResponse.json({ error: "Fleet not found" }, { status: 404 });
    }

    // Check if there are active vehicles in this fleet via M:N
    const [activeVehicleCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(vehicleFleets)
      .where(
        and(eq(vehicleFleets.fleetId, id), eq(vehicleFleets.active, true)),
      );

    // Check if there are active user permissions
    const [activeUserCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(userFleetPermissions)
      .where(
        and(
          eq(userFleetPermissions.fleetId, id),
          eq(userFleetPermissions.active, true),
        ),
      );

    // Allow deletion but deactivate relationships first
    if (Number(activeVehicleCount.count) > 0) {
      await db
        .update(vehicleFleets)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(vehicleFleets.fleetId, id));
    }

    if (Number(activeUserCount.count) > 0) {
      await db
        .update(userFleetPermissions)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(userFleetPermissions.fleetId, id));
    }

    // Soft delete - set active to false
    await db
      .update(fleets)
      .set({
        active: false,
        updatedAt: new Date(),
      })
      .where(whereClause);

    // Log deletion
    await logDelete("fleet", id, existingFleet);

    return NextResponse.json({
      success: true,
      message: "Flota desactivada exitosamente",
      deactivatedVehicles: Number(activeVehicleCount.count),
      deactivatedPermissions: Number(activeUserCount.count),
    });
  } catch (error) {
    console.error("Error deleting fleet:", error);
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error deleting fleet" },
      { status: 500 },
    );
  }
}
