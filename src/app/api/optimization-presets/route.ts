import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationPresets } from "@/db/schema";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

/**
 * GET /api/optimization-presets - List all optimization presets
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.OPTIMIZATION_PRESET, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const presets = await db.query.optimizationPresets.findMany({
      where: and(
        eq(optimizationPresets.companyId, tenantCtx.companyId),
        eq(optimizationPresets.active, true),
      ),
      orderBy: [
        desc(optimizationPresets.isDefault),
        desc(optimizationPresets.createdAt),
      ],
    });

    return NextResponse.json({ data: presets });
  } catch (error) {
    console.error("Error fetching optimization presets:", error);
    return NextResponse.json(
      { error: "Error fetching optimization presets" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/optimization-presets - Create a new optimization preset
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.OPTIMIZATION_PRESET, Action.CREATE);
    if (authResult instanceof NextResponse) return authResult;

    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const body = await request.json();

    const presetValues = {
      companyId: tenantCtx.companyId,
      name: body.name,
      description: body.description,
      balanceVisits: body.balanceVisits ?? false,
      minimizeVehicles: body.minimizeVehicles ?? false,
      openStart: body.openStart ?? false,
      openEnd: body.openEnd ?? false,
      mergeSimilar: body.mergeSimilar ?? true,
      mergeSimilarV2: body.mergeSimilarV2 ?? false,
      oneRoutePerVehicle: body.oneRoutePerVehicle ?? true,
      simplify: body.simplify ?? true,
      bigVrp: body.bigVrp ?? true,
      flexibleTimeWindows: body.flexibleTimeWindows ?? false,
      mergeByDistance: body.mergeByDistance ?? false,
      groupSameLocation: body.groupSameLocation ?? true,
      maxDistanceKm: body.maxDistanceKm ?? 200,
      vehicleRechargeTime: body.vehicleRechargeTime ?? 0,
      trafficFactor: body.trafficFactor ?? 50,
      isDefault: body.isDefault ?? false,
      active: true,
    };

    let preset;

    // If this preset is set as default, wrap in transaction to ensure
    // only one default per company at any time
    if (body.isDefault) {
      [preset] = await db.transaction(async (tx) => {
        // Unset all other defaults for this company
        await tx
          .update(optimizationPresets)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(optimizationPresets.companyId, tenantCtx.companyId),
              eq(optimizationPresets.isDefault, true),
            ),
          );

        return await tx
          .insert(optimizationPresets)
          .values(presetValues)
          .returning();
      });
    } else {
      [preset] = await db
        .insert(optimizationPresets)
        .values(presetValues)
        .returning();
    }

    return NextResponse.json({ data: preset }, { status: 201 });
  } catch (error) {
    console.error("Error creating optimization preset:", error);
    return NextResponse.json(
      { error: "Error creating optimization preset" },
      { status: 500 },
    );
  }
}
