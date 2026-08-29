import { and, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vehicles, zones, zoneVehicles } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { logCreate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import { safeParseJson } from "@/lib/utils/safe-json";
import { zoneQuerySchema, zoneSchema } from "@/lib/validations/zone";
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ROUTE,
      Action.READ,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const { searchParams } = new URL(request.url);
    const query = zoneQuerySchema.parse(Object.fromEntries(searchParams));

    // Las borradas nunca se listan. `active` es la pausa operativa, no el
    // borrado: filtrar por ella escondería zonas que el usuario solo pausó.
    const conditions = [isNull(zones.deletedAt)];

    if (query.active !== undefined) {
      conditions.push(eq(zones.active, query.active));
    }
    if (query.type) {
      conditions.push(eq(zones.type, query.type));
    }
    if (query.isDefault !== undefined) {
      conditions.push(eq(zones.isDefault, query.isDefault));
    }
    if (query.search) {
      conditions.push(ilike(zones.name, `%${query.search}%`));
    }

    // Apply tenant filtering
    const whereClause = withTenantFilter(
      zones,
      conditions,
      tenantCtx.companyId,
    );

    const [zonesData, totalResult] = await Promise.all([
      db
        .select()
        .from(zones)
        .where(whereClause)
        .orderBy(desc(zones.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(zones)
        .where(whereClause),
    ]);

    // Get related vehicles for each zone
    const zoneIds = zonesData.map((z) => z.id);

    const zoneVehiclesMap: Record<
      string,
      Array<{
        id: string;
        name: string;
        plate: string | null;
        assignedDays: string[] | null;
      }>
    > = {};

    if (zoneIds.length > 0) {
      // Get vehicles for each zone
      const vehicleRelations = await db
        .select({
          zoneId: zoneVehicles.zoneId,
          vehicleId: zoneVehicles.vehicleId,
          vehicleName: vehicles.name,
          vehiclePlate: vehicles.plate,
          assignedDays: zoneVehicles.assignedDays,
        })
        .from(zoneVehicles)
        .innerJoin(vehicles, eq(zoneVehicles.vehicleId, vehicles.id))
        .where(
          and(
            inArray(zoneVehicles.zoneId, zoneIds),
            eq(zoneVehicles.active, true),
          ),
        );

      // Group vehicles by zone
      for (const rel of vehicleRelations) {
        if (!zoneVehiclesMap[rel.zoneId]) {
          zoneVehiclesMap[rel.zoneId] = [];
        }
        zoneVehiclesMap[rel.zoneId].push({
          id: rel.vehicleId,
          name: rel.vehicleName,
          plate: rel.vehiclePlate,
          assignedDays: rel.assignedDays,
        });
      }
    }

    const data = zonesData.map((zone) => ({
      ...zone,
      activeDays: zone.activeDays ? safeParseJson(zone.activeDays) : null,
      vehicles: zoneVehiclesMap[zone.id] || [],
      vehicleCount: (zoneVehiclesMap[zone.id] || []).length,
    }));

    return NextResponse.json({
      data,
      meta: {
        total: Number(totalResult[0]?.count ?? 0),
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (error) {
    console.error("Error fetching zones:", error);
    return NextResponse.json(
      { error: "Error fetching zones" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ROUTE,
      Action.CREATE,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const body = await request.json();
    const validatedData = zoneSchema.parse(body);

    // Check for duplicate zone name within the same company
    const existingZone = await db
      .select()
      .from(zones)
      .where(
        and(
          eq(zones.companyId, tenantCtx.companyId),
          eq(zones.name, validatedData.name),
          isNull(zones.deletedAt),
        ),
      )
      .limit(1);

    if (existingZone.length > 0) {
      return NextResponse.json(
        { error: "Ya existe una zona con este nombre en la empresa" },
        { status: 400 },
      );
    }

    // If this is being set as default, remove default from other zones
    if (validatedData.isDefault) {
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

    // Create the zone
    const [newZone] = await db
      .insert(zones)
      .values({
        name: validatedData.name,
        description: validatedData.description,
        type: validatedData.type,
        geometry: validatedData.geometry,
        color: validatedData.color,
        isDefault: validatedData.isDefault,
        activeDays: validatedData.activeDays || null,
        active: validatedData.active,
        companyId: tenantCtx.companyId,
        updatedAt: new Date(),
      })
      .returning();

    // Log creation
    await logCreate("zone", newZone.id, newZone);

    return NextResponse.json(
      {
        ...newZone,
        activeDays: newZone.activeDays
          ? safeParseJson(newZone.activeDays)
          : null,
        vehicles: [],
        vehicleCount: 0,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Error creating zone:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: (error as Error & { errors: unknown }).errors,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Error creating zone" }, { status: 500 });
  }
}
