import { and, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  fleets,
  vehicleFleets,
  vehicles,
} from "@/db/schema";
import { TenantAccessDeniedError, withTenantFilter } from "@/db/tenant-aware";
import { logDelete, logUpdate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import { updateFleetSchema } from "@/lib/validations/fleet";

import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.FLEET, Action.READ);
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const { id } = await params;

    const whereClause = withTenantFilter(
      fleets,
      [eq(fleets.id, id)],
      tenantCtx.companyId,
    );

    const [fleet] = await db.select().from(fleets).where(whereClause).limit(1);

    if (!fleet) {
      return NextResponse.json({ error: "Fleet not found" }, { status: 404 });
    }

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

    return NextResponse.json({
      ...fleet,
      vehicles: relatedVehicles,
      vehicleIds: relatedVehicles.map((v) => v.id),
      vehicleCount: relatedVehicles.length,
    });
  } catch (error) {
    after(() => console.error("Error fetching fleet:", error));
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
    const authResult = await requireRoutePermission(request, EntityType.FLEET, Action.UPDATE);
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const { id } = await params;
    const body = await request.json();
    const validatedData = updateFleetSchema.parse({ ...body, id });

    const existingWhereClause = withTenantFilter(
      fleets,
      [eq(fleets.id, id)],
      tenantCtx.companyId,
    );

    const [existingFleet] = await db
      .select()
      .from(fleets)
      .where(existingWhereClause)
      .limit(1);

    if (!existingFleet) {
      return NextResponse.json({ error: "Fleet not found" }, { status: 404 });
    }

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

    // userIds is accepted for backwards compatibility but ignored — user↔fleet
    // mapping lives on primaryFleetId/userSecondaryFleets, managed in /users.
    const { id: _, vehicleIds, ...updateData } = validatedData;

    const [updatedFleet] = await db
      .update(fleets)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(existingWhereClause)
      .returning();

    if (vehicleIds !== undefined) {
      await db
        .update(vehicleFleets)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(vehicleFleets.fleetId, id));

      if (vehicleIds.length > 0) {
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

    after(async () => {
      await logUpdate("fleet", id, {
        before: existingFleet,
        after: {
          ...updatedFleet,
          vehicleIds: relatedVehicles.map((v) => v.id),
        },
      });
    });

    return NextResponse.json({
      ...updatedFleet,
      vehicles: relatedVehicles,
      vehicleCount: relatedVehicles.length,
    });
  } catch (error) {
    after(() => console.error("Error updating fleet:", error));
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: (error as { errors?: unknown }).errors,
        },
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
    const authResult = await requireRoutePermission(request, EntityType.FLEET, Action.DELETE);
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const { id } = await params;

    const whereClause = withTenantFilter(
      fleets,
      [eq(fleets.id, id)],
      tenantCtx.companyId,
    );

    const [existingFleet] = await db
      .select()
      .from(fleets)
      .where(whereClause)
      .limit(1);

    if (!existingFleet) {
      return NextResponse.json({ error: "Fleet not found" }, { status: 404 });
    }

    const [activeVehicleCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(vehicleFleets)
      .where(
        and(eq(vehicleFleets.fleetId, id), eq(vehicleFleets.active, true)),
      );

    if (Number(activeVehicleCount.count) > 0) {
      await db
        .update(vehicleFleets)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(vehicleFleets.fleetId, id));
    }

    await db
      .update(fleets)
      .set({
        active: false,
        updatedAt: new Date(),
      })
      .where(whereClause);

    after(async () => {
      await logDelete("fleet", id, existingFleet);
    });

    return NextResponse.json({
      success: true,
      message: "Flota desactivada exitosamente",
      deactivatedVehicles: Number(activeVehicleCount.count),
    });
  } catch (error) {
    after(() => console.error("Error deleting fleet:", error));
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error deleting fleet" },
      { status: 500 },
    );
  }
}
