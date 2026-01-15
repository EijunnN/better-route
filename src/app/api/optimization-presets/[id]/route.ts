import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationPresets } from "@/db/schema";
import { setTenantContext } from "@/lib/tenant";

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

/**
 * GET /api/optimization-presets/[id] - Get a specific preset
 */
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

    const preset = await db.query.optimizationPresets.findFirst({
      where: and(
        eq(optimizationPresets.id, id),
        eq(optimizationPresets.companyId, tenantCtx.companyId),
      ),
    });

    if (!preset) {
      return NextResponse.json(
        { error: "Preset not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: preset });
  } catch (error) {
    console.error("Error fetching optimization preset:", error);
    return NextResponse.json(
      { error: "Error fetching optimization preset" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/optimization-presets/[id] - Update a preset
 */
export async function PUT(
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

    // Check if preset exists
    const existingPreset = await db.query.optimizationPresets.findFirst({
      where: and(
        eq(optimizationPresets.id, id),
        eq(optimizationPresets.companyId, tenantCtx.companyId),
      ),
    });

    if (!existingPreset) {
      return NextResponse.json(
        { error: "Preset not found" },
        { status: 404 },
      );
    }

    // If this preset is being set as default, unset other defaults
    if (body.isDefault && !existingPreset.isDefault) {
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
      .update(optimizationPresets)
      .set({
        name: body.name ?? existingPreset.name,
        description: body.description ?? existingPreset.description,
        balanceVisits: body.balanceVisits ?? existingPreset.balanceVisits,
        minimizeVehicles: body.minimizeVehicles ?? existingPreset.minimizeVehicles,
        openStart: body.openStart ?? existingPreset.openStart,
        openEnd: body.openEnd ?? existingPreset.openEnd,
        mergeSimilar: body.mergeSimilar ?? existingPreset.mergeSimilar,
        mergeSimilarV2: body.mergeSimilarV2 ?? existingPreset.mergeSimilarV2,
        oneRoutePerVehicle: body.oneRoutePerVehicle ?? existingPreset.oneRoutePerVehicle,
        simplify: body.simplify ?? existingPreset.simplify,
        bigVrp: body.bigVrp ?? existingPreset.bigVrp,
        flexibleTimeWindows: body.flexibleTimeWindows ?? existingPreset.flexibleTimeWindows,
        mergeByDistance: body.mergeByDistance ?? existingPreset.mergeByDistance,
        maxDistanceKm: body.maxDistanceKm ?? existingPreset.maxDistanceKm,
        vehicleRechargeTime: body.vehicleRechargeTime ?? existingPreset.vehicleRechargeTime,
        trafficFactor: body.trafficFactor ?? existingPreset.trafficFactor,
        isDefault: body.isDefault ?? existingPreset.isDefault,
        updatedAt: new Date(),
      })
      .where(eq(optimizationPresets.id, id))
      .returning();

    return NextResponse.json({ data: preset });
  } catch (error) {
    console.error("Error updating optimization preset:", error);
    return NextResponse.json(
      { error: "Error updating optimization preset" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/optimization-presets/[id] - Soft delete a preset
 */
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

    // Check if preset exists
    const existingPreset = await db.query.optimizationPresets.findFirst({
      where: and(
        eq(optimizationPresets.id, id),
        eq(optimizationPresets.companyId, tenantCtx.companyId),
      ),
    });

    if (!existingPreset) {
      return NextResponse.json(
        { error: "Preset not found" },
        { status: 404 },
      );
    }

    // Soft delete
    await db
      .update(optimizationPresets)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(optimizationPresets.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting optimization preset:", error);
    return NextResponse.json(
      { error: "Error deleting optimization preset" },
      { status: 500 },
    );
  }
}
