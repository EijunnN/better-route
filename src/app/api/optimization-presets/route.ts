import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationPresets } from "@/db/schema";
import { setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";

/**
 * GET /api/optimization-presets - List all optimization presets
 */
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
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const body = await request.json();

    // If this preset is set as default, unset other defaults
    if (body.isDefault) {
      await db
        .update(optimizationPresets)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(optimizationPresets.companyId, tenantCtx.companyId),
            eq(optimizationPresets.isDefault, true),
          ),
        );
    }

    const [preset] = await db
      .insert(optimizationPresets)
      .values({
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
      })
      .returning();

    return NextResponse.json({ data: preset }, { status: 201 });
  } catch (error) {
    console.error("Error creating optimization preset:", error);
    return NextResponse.json(
      { error: "Error creating optimization preset" },
      { status: 500 },
    );
  }
}
