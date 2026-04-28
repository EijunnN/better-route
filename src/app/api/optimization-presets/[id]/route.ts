import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationPresets } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import { updatePresetSchema } from "@/lib/validations/optimization-preset";

/**
 * GET /api/optimization-presets/[id] - Get a specific preset
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.OPTIMIZATION_PRESET,
      Action.READ,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const { id } = await params;

    const preset = await db.query.optimizationPresets.findFirst({
      where: and(
        eq(optimizationPresets.id, id),
        eq(optimizationPresets.companyId, tenantCtx.companyId),
      ),
    });

    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
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
    const authResult = await requireRoutePermission(
      request,
      EntityType.OPTIMIZATION_PRESET,
      Action.UPDATE,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const { id } = await params;
    const body = await request.json();

    // Validate the body upfront. The route end fields (routeEndMode +
    // endDepot*) used to silently drop here because the previous
    // hand-written `updateValues` object simply omitted them — adding
    // a column to `optimizationPresets` required also remembering to
    // wire it up in two places. The Zod schema is the single contract
    // now: every column lives in `presetFields` and missing one is a
    // type error at the spread below.
    const parseResult = updatePresetSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parseResult.error.issues },
        { status: 400 },
      );
    }
    const parsed = parseResult.data;

    const existingPreset = await db.query.optimizationPresets.findFirst({
      where: and(
        eq(optimizationPresets.id, id),
        eq(optimizationPresets.companyId, tenantCtx.companyId),
      ),
    });

    if (!existingPreset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    // Only overwrite columns the caller actually sent. `parsed` came
    // from `.partial()`, so undefined fields are skipped via the
    // filter and Drizzle gets a clean SET clause.
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== undefined) updateValues[key] = value;
    }

    let preset;

    // If this preset is being set as default, wrap in transaction to ensure
    // only one default per company at any time
    if (parsed.isDefault === true && !existingPreset.isDefault) {
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
          .update(optimizationPresets)
          .set(updateValues)
          .where(eq(optimizationPresets.id, id))
          .returning();
      });
    } else {
      [preset] = await db
        .update(optimizationPresets)
        .set(updateValues)
        .where(eq(optimizationPresets.id, id))
        .returning();
    }

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
    const authResult = await requireRoutePermission(
      request,
      EntityType.OPTIMIZATION_PRESET,
      Action.DELETE,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
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
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
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
