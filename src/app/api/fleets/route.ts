import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  fleets,
  userFleetPermissions,
  users,
  vehicleFleets,
  vehicles,
} from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { logCreate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import { fleetQuerySchema, fleetSchema } from "@/lib/validations/fleet";

import { extractTenantContext } from "@/lib/routing/route-helpers";

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
    const query = fleetQuerySchema.parse(Object.fromEntries(searchParams));

    const conditions = [];

    if (query.active !== undefined) {
      conditions.push(eq(fleets.active, query.active));
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

    // Get related vehicles and users for each fleet
    const fleetIds = fleetsData.map((f) => f.id);

    const fleetVehicles: Record<
      string,
      Array<{ id: string; name: string; plate: string | null }>
    > = {};
    const fleetUsers: Record<
      string,
      Array<{ id: string; name: string; role: string }>
    > = {};

    if (fleetIds.length > 0) {
      // Get vehicles for each fleet
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

      // Group vehicles by fleet
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

      // Get users for each fleet
      const userRelations = await db
        .select({
          fleetId: userFleetPermissions.fleetId,
          userId: userFleetPermissions.userId,
          userName: users.name,
          userRole: users.role,
        })
        .from(userFleetPermissions)
        .innerJoin(users, eq(userFleetPermissions.userId, users.id))
        .where(
          and(
            inArray(userFleetPermissions.fleetId, fleetIds),
            eq(userFleetPermissions.active, true),
          ),
        );

      // Group users by fleet
      for (const rel of userRelations) {
        if (!fleetUsers[rel.fleetId]) {
          fleetUsers[rel.fleetId] = [];
        }
        fleetUsers[rel.fleetId].push({
          id: rel.userId,
          name: rel.userName,
          role: rel.userRole,
        });
      }
    }

    // Combine data
    const data = fleetsData.map((fleet) => {
      const vehicles = fleetVehicles[fleet.id] || [];
      const users = fleetUsers[fleet.id] || [];
      return {
        ...fleet,
        vehicles,
        users,
        vehicleIds: vehicles.map((v) => v.id),
        userIds: users.map((u) => u.id),
        vehicleCount: vehicles.length,
        userCount: users.length,
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
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

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

    // Extract M:N relationship IDs
    const { vehicleIds, userIds, ...fleetData } = validatedData;

    // Create the fleet
    const [newFleet] = await db
      .insert(fleets)
      .values({
        name: fleetData.name,
        description: fleetData.description,
        type: fleetData.type,
        weightCapacity: fleetData.weightCapacity,
        volumeCapacity: fleetData.volumeCapacity,
        operationStart: fleetData.operationStart,
        operationEnd: fleetData.operationEnd,
        active: fleetData.active,
        companyId: tenantCtx.companyId,
        updatedAt: new Date(),
      })
      .returning();

    // Create vehicle-fleet relationships
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

    // Create user-fleet permission relationships
    if (userIds && userIds.length > 0) {
      await db.insert(userFleetPermissions).values(
        userIds.map((userId) => ({
          companyId: tenantCtx.companyId,
          userId,
          fleetId: newFleet.id,
          active: true,
        })),
      );
    }

    // Get the related vehicles and users for the response
    let responseVehicles: Array<{
      id: string;
      name: string;
      plate: string | null;
    }> = [];
    let responseUsers: Array<{ id: string; name: string; role: string }> = [];

    if (vehicleIds && vehicleIds.length > 0) {
      const vehicleData = await db
        .select({ id: vehicles.id, name: vehicles.name, plate: vehicles.plate })
        .from(vehicles)
        .where(inArray(vehicles.id, vehicleIds));
      responseVehicles = vehicleData;
    }

    if (userIds && userIds.length > 0) {
      const userData = await db
        .select({ id: users.id, name: users.name, role: users.role })
        .from(users)
        .where(inArray(users.id, userIds));
      responseUsers = userData;
    }

    // Log creation
    await logCreate("fleet", newFleet.id, { ...newFleet, vehicleIds, userIds });

    return NextResponse.json(
      {
        ...newFleet,
        vehicles: responseVehicles,
        users: responseUsers,
        vehicleCount: responseVehicles.length,
        userCount: responseUsers.length,
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
