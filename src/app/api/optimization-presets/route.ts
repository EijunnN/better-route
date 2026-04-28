import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationPresets } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import { createPresetSchema } from "@/lib/validations/optimization-preset";

/**
 * GET /api/optimization-presets - List all optimization presets
 */
export async function GET(request: NextRequest) {
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
    const authResult = await requireRoutePermission(
      request,
      EntityType.OPTIMIZATION_PRESET,
      Action.CREATE,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const body = await request.json();

    // Validate via Zod so adding a column requires updating the
    // schema, not the handler — same contract as the PUT route.
    const parseResult = createPresetSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parseResult.error.issues },
        { status: 400 },
      );
    }
    const parsed = parseResult.data;

    const presetValues = {
      ...parsed,
      companyId: tenantCtx.companyId,
      active: true,
    };

    let preset;

    // If this preset is set as default, wrap in transaction to ensure
    // only one default per company at any time
    if (parsed.isDefault) {
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
