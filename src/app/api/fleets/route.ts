import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  fleets,
  vehicleFleets,
  vehicles,
} from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { logCreate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import { fleetQuerySchema, fleetSchema } from "@/lib/validations/fleet";

import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.FLEET, Action.READ);
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const { searchParams } = new URL(request.url);
    const query = fleetQuerySchema.parse(Object.fromEntries(searchParams));

    const conditions = [];

    if (query.active === false) {
      conditions.push(eq(fleets.active, false));
    } else {
      // Default: only show active records
      conditions.push(eq(fleets.active, true));
    }
    if (query.type) {
      conditions.push(eq(fleets.type, query.type));
    }

    // Apply tenant filtering
    const whereClause = withTenantFilter(
      fleets,
      conditions,
      tenantCtx.companyId,
    );

    const [fleetsData, totalResult] = await Promise.all([
      db
        .select()
        .from(fleets)
        .where(whereClause)
        .orderBy(desc(fleets.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(fleets)
        .where(whereClause),
    ]);

    // Get related vehicles for each fleet
    const fleetIds = fleetsData.map((f) => f.id);

    const fleetVehicles: Record<
      string,
      Array<{ id: string; name: string; plate: string | null }>
    > = {};

    if (fleetIds.length > 0) {
      const vehicleRelations = await db
        .select({
          fleetId: vehicleFleets.fleetId,
          vehicleId: vehicleFleets.vehicleId,
          vehicleName: vehicles.name,
          vehiclePlate: vehicles.plate,
        })
        .from(vehicleFleets)
        .innerJoin(vehicles, eq(vehicleFleets.vehicleId, vehicles.id))
        .where(
          and(
            inArray(vehicleFleets.fleetId, fleetIds),
            eq(vehicleFleets.active, true),
          ),
        );

      for (const rel of vehicleRelations) {
        if (!fleetVehicles[rel.fleetId]) {
          fleetVehicles[rel.fleetId] = [];
        }
        fleetVehicles[rel.fleetId].push({
          id: rel.vehicleId,
          name: rel.vehicleName,
          plate: rel.vehiclePlate,
        });
      }
    }

    const data = fleetsData.map((fleet) => {
      const vehicles = fleetVehicles[fleet.id] || [];
      return {
        ...fleet,
        vehicles,
        vehicleIds: vehicles.map((v) => v.id),
        vehicleCount: vehicles.length,
      };
    });

    return NextResponse.json({
      data,
      meta: {
        total: Number(totalResult[0]?.count ?? 0),
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (error) {
    console.error("Error fetching fleets:", error);
    return NextResponse.json(
      { error: "Error fetching fleets" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.FLEET, Action.CREATE);
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const body = await request.json();
    const validatedData = fleetSchema.parse(body);

    // Check for duplicate fleet name within the same company
    const existingFleet = await db
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

    if (existingFleet.length > 0) {
      return NextResponse.json(
        { error: "Ya existe una flota activa con este nombre en la empresa" },
        { status: 400 },
      );
    }

    // Extract M:N relationship IDs. userIds is accepted for backwards
    // compatibility with older clients but ignored — user↔fleet mapping lives
    // on users.primaryFleetId + userSecondaryFleets, edited from /users.
    const { vehicleIds, ...fleetData } = validatedData;

    const [newFleet] = await db
      .insert(fleets)
      .values({
        name: fleetData.name,
        description: fleetData.description,
        type: fleetData.type,
        active: fleetData.active,
        companyId: tenantCtx.companyId,
        updatedAt: new Date(),
      })
      .returning();

    if (vehicleIds && vehicleIds.length > 0) {
      await db.insert(vehicleFleets).values(
        vehicleIds.map((vehicleId) => ({
          companyId: tenantCtx.companyId,
          vehicleId,
          fleetId: newFleet.id,
          active: true,
        })),
      );
    }

    let responseVehicles: Array<{
      id: string;
      name: string;
      plate: string | null;
    }> = [];

    if (vehicleIds && vehicleIds.length > 0) {
      const vehicleData = await db
        .select({ id: vehicles.id, name: vehicles.name, plate: vehicles.plate })
        .from(vehicles)
        .where(inArray(vehicles.id, vehicleIds));
      responseVehicles = vehicleData;
    }

    await logCreate("fleet", newFleet.id, { ...newFleet, vehicleIds });

    return NextResponse.json(
      {
        ...newFleet,
        vehicles: responseVehicles,
        vehicleCount: responseVehicles.length,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating fleet:", error);
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
      { error: "Error creating fleet" },
      { status: 500 },
    );
  }
}
