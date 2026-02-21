import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { timeWindowPresets } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { logCreate } from "@/lib/infra/audit";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";
import {
  timeWindowPresetQuerySchema,
  timeWindowPresetSchema,
} from "@/lib/validations/time-window-preset";

import { extractTenantContext } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

// GET - List with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.TIME_WINDOW_PRESET, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { searchParams } = new URL(request.url);
    const query = timeWindowPresetQuerySchema.parse(
      Object.fromEntries(searchParams),
    );

    const conditions = [];

    if (query.type) {
      conditions.push(eq(timeWindowPresets.type, query.type));
    }

    if (query.strictness) {
      conditions.push(eq(timeWindowPresets.strictness, query.strictness));
    }

    if (query.active === false) {
      conditions.push(eq(timeWindowPresets.active, false));
    } else {
      // Default: only show active records
      conditions.push(eq(timeWindowPresets.active, true));
    }

    const whereClause = withTenantFilter(
      timeWindowPresets,
      conditions,
      tenantCtx.companyId,
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(timeWindowPresets)
        .where(whereClause)
        .orderBy(desc(timeWindowPresets.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      db
        .select({ count: timeWindowPresets.id })
        .from(timeWindowPresets)
        .where(whereClause),
    ]);

    return NextResponse.json({
      data,
      meta: { total: totalResult.length },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch time window presets",
      },
      { status: 400 },
    );
  }
}

// POST - Create
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.TIME_WINDOW_PRESET, Action.CREATE);
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
    const validatedData = timeWindowPresetSchema.parse(body);

    // Check for uniqueness of name within the company
    const context = requireTenantContext();
    const existing = await db
      .select()
      .from(timeWindowPresets)
      .where(
        and(
          eq(timeWindowPresets.companyId, context.companyId),
          eq(timeWindowPresets.name, validatedData.name),
          eq(timeWindowPresets.active, true),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "A time window preset with this name already exists" },
        { status: 409 },
      );
    }

    const [newRecord] = await db
      .insert(timeWindowPresets)
      .values({
        ...validatedData,
        companyId: tenantCtx.companyId,
      })
      .returning();

    await logCreate("time_window_preset", newRecord.id, newRecord);

    return NextResponse.json(newRecord, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: (error as { errors?: unknown }).errors,
        },
        { status: 400 },
      );
    }
    console.error("[Time Window Preset POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
