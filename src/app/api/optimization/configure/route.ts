import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  DRIVER_STATUS,
  fleets,
  optimizationConfigurations,
  USER_ROLES,
  users,
  VEHICLE_STATUS,
  vehicles,
} from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { logCreate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  optimizationConfigQuerySchema,
  optimizationConfigSchema,
} from "@/lib/validations/optimization-config";

import { extractTenantContext } from "@/lib/routing/route-helpers";

import { safeParseJson } from "@/lib/utils/safe-json";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";
// GET - List optimization configurations
export async function GET(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);
  const { searchParams } = new URL(request.url);

  try {
    const authResult = await requireRoutePermission(request, EntityType.OPTIMIZATION_CONFIG, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

    const query = optimizationConfigQuerySchema.parse(
      Object.fromEntries(searchParams),
    );

    const conditions = [
      withTenantFilter(optimizationConfigurations, [], tenantCtx.companyId),
    ];

    if (query.status) {
      conditions.push(eq(optimizationConfigurations.status, query.status));
    }
    if (query.active !== undefined) {
      conditions.push(eq(optimizationConfigurations.active, query.active));
    }

    const configs = await db
      .select({
        id: optimizationConfigurations.id,
        name: optimizationConfigurations.name,
        depotLatitude: optimizationConfigurations.depotLatitude,
        depotLongitude: optimizationConfigurations.depotLongitude,
        depotAddress: optimizationConfigurations.depotAddress,
        selectedVehicleIds: optimizationConfigurations.selectedVehicleIds,
        selectedDriverIds: optimizationConfigurations.selectedDriverIds,
        objective: optimizationConfigurations.objective,
        capacityEnabled: optimizationConfigurations.capacityEnabled,
        workWindowStart: optimizationConfigurations.workWindowStart,
        workWindowEnd: optimizationConfigurations.workWindowEnd,
        serviceTimeMinutes: optimizationConfigurations.serviceTimeMinutes,
        timeWindowStrictness: optimizationConfigurations.timeWindowStrictness,
        penaltyFactor: optimizationConfigurations.penaltyFactor,
        maxRoutes: optimizationConfigurations.maxRoutes,
        status: optimizationConfigurations.status,
        active: optimizationConfigurations.active,
        createdAt: optimizationConfigurations.createdAt,
        updatedAt: optimizationConfigurations.updatedAt,
      })
      .from(optimizationConfigurations)
      .where(and(...conditions))
      .orderBy(desc(optimizationConfigurations.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(optimizationConfigurations)
      .where(and(...conditions));

    return NextResponse.json({
      data: configs,
      meta: {
        total: count,
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (error) {
    console.error("Error fetching optimization configurations:", error);
    return NextResponse.json(
      { error: "Failed to fetch configurations" },
      { status: 500 },
    );
  }
}

// POST - Create optimization configuration
export async function POST(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    const authResult = await requireRoutePermission(request, EntityType.OPTIMIZATION_CONFIG, Action.CREATE);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const data = optimizationConfigSchema.parse(body);

    // Parse and validate vehicle IDs
    let vehicleIds: string[] = [];
    if (data.selectedVehicleIds) {
      try {
        vehicleIds = safeParseJson(data.selectedVehicleIds);
        if (!Array.isArray(vehicleIds) || vehicleIds.length === 0) {
          return NextResponse.json(
            { error: "At least one vehicle must be selected" },
            { status: 400 },
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Invalid vehicle IDs format" },
          { status: 400 },
        );
      }
    }

    // Parse and validate driver IDs
    let driverIds: string[] = [];
    if (data.selectedDriverIds) {
      try {
        driverIds = safeParseJson(data.selectedDriverIds);
        if (!Array.isArray(driverIds) || driverIds.length === 0) {
          return NextResponse.json(
            { error: "At least one driver must be selected" },
            { status: 400 },
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Invalid driver IDs format" },
          { status: 400 },
        );
      }
    }

    // Determine if this is a preset (DRAFT) or full configuration
    const isPreset = data.status === "DRAFT";

    let vehiclesResult: Array<{
      id: string;
      plate: string | null;
      name: string;
      status: string | null;
    }> = [];
    let driversResult: Array<{
      id: string;
      name: string;
      status: string | null;
      licenseExpiry: Date | null;
      fleet: { id: string; name: string } | null;
    }> = [];

    // Only validate vehicles and drivers if not a preset
    if (!isPreset && vehicleIds.length > 0) {
      // Validate that all vehicles exist and are available
      vehiclesResult = await db
        .select({
          id: vehicles.id,
          plate: vehicles.plate,
          name: vehicles.name,
          status: vehicles.status,
        })
        .from(vehicles)
        .where(
          and(
            inArray(vehicles.id, vehicleIds),
            withTenantFilter(vehicles, [], tenantCtx.companyId),
            eq(vehicles.active, true),
          ),
        );

      if (vehiclesResult.length !== vehicleIds.length) {
        return NextResponse.json(
          { error: "Some selected vehicles not found or inactive" },
          { status: 400 },
        );
      }

      // Check for unavailable vehicles
      const unavailableVehicles = vehiclesResult.filter(
        (v) => v.status !== VEHICLE_STATUS.AVAILABLE,
      );
      if (unavailableVehicles.length > 0) {
        return NextResponse.json(
          {
            error: "Some vehicles are not available",
            unavailable: unavailableVehicles.map((v) => v.plate),
          },
          { status: 400 },
        );
      }
    }

    // Only validate drivers (users with CONDUCTOR role) if not a preset
    if (!isPreset && driverIds.length > 0) {
      // Validate that all drivers exist and are available
      driversResult = await db
        .select({
          id: users.id,
          name: users.name,
          status: users.driverStatus,
          licenseExpiry: users.licenseExpiry,
          fleet: {
            id: fleets.id,
            name: fleets.name,
          },
        })
        .from(users)
        .leftJoin(fleets, eq(users.primaryFleetId, fleets.id))
        .where(
          and(
            inArray(users.id, driverIds),
            withTenantFilter(users, [], tenantCtx.companyId),
            eq(users.active, true),
            eq(users.role, USER_ROLES.CONDUCTOR),
          ),
        );

      if (driversResult.length !== driverIds.length) {
        return NextResponse.json(
          { error: "Some selected drivers not found or inactive" },
          { status: 400 },
        );
      }

      // Check for unavailable drivers
      const unavailableDrivers = driversResult.filter(
        (d) => d.status !== DRIVER_STATUS.AVAILABLE,
      );
      if (unavailableDrivers.length > 0) {
        return NextResponse.json(
          {
            error: "Some drivers are not available",
            unavailable: unavailableDrivers.map((d) => d.name),
          },
          { status: 400 },
        );
      }

      // Check for expired licenses
      const now = new Date();
      const driversWithExpiredLicenses = driversResult.filter(
        (d) => d.licenseExpiry && new Date(d.licenseExpiry) < now,
      );
      if (driversWithExpiredLicenses.length > 0) {
        return NextResponse.json(
          {
            error: "Some drivers have expired licenses",
            expired: driversWithExpiredLicenses.map((d) => d.name),
          },
          { status: 400 },
        );
      }
    }

    // Validate depot coordinates (only if provided)
    if (data.depotLatitude || data.depotLongitude) {
      if (!data.depotLatitude || !data.depotLongitude) {
        return NextResponse.json(
          { error: "Both depot latitude and longitude must be provided together" },
          { status: 400 },
        );
      }
      const lat = parseFloat(data.depotLatitude);
      const lng = parseFloat(data.depotLongitude);
      if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return NextResponse.json(
          { error: "Invalid depot coordinates. Latitude must be -90 to 90, longitude -180 to 180." },
          { status: 400 },
        );
      }
    }

    // Create configuration
    const insertData: typeof optimizationConfigurations.$inferInsert = {
      companyId: tenantCtx.companyId,
      name: data.name,
      depotLatitude: data.depotLatitude || "0",
      depotLongitude: data.depotLongitude || "0",
      depotAddress: data.depotAddress || null,
      selectedVehicleIds: vehicleIds,
      selectedDriverIds: driverIds,
      objective: data.objective,
      capacityEnabled: data.capacityEnabled,
      workWindowStart: data.workWindowStart,
      workWindowEnd: data.workWindowEnd,
      serviceTimeMinutes: data.serviceTimeMinutes,
      timeWindowStrictness: data.timeWindowStrictness,
      penaltyFactor: data.penaltyFactor,
      maxRoutes: data.maxRoutes || null,
      status: data.status || "CONFIGURED",
      active: true,
    };

    const [config] = await db
      .insert(optimizationConfigurations)
      .values(insertData)
      .returning();

    // Log creation
    await logCreate("optimization_configuration", config.id, {
      name: data.name,
      vehicleCount: vehicleIds.length,
      driverCount: driverIds.length,
    });

    return NextResponse.json(
      {
        data: config,
        vehicles: vehiclesResult,
        drivers: driversResult,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && "name" in error) {
      return NextResponse.json(
        { error: "Validation error", details: error },
        { status: 400 },
      );
    }
    console.error("Error creating optimization configuration:", error);
    return NextResponse.json(
      { error: "Failed to create configuration" },
      { status: 500 },
    );
  }
}
