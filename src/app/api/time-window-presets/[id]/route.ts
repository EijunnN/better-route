import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { timeWindowPresets } from "@/db/schema";
import { verifyTenantAccess, withTenantFilter } from "@/db/tenant-aware";
import { logDelete, logUpdate } from "@/lib/audit";
import { requireTenantContext, setTenantContext } from "@/lib/tenant";
import { updateTimeWindowPresetSchema } from "@/lib/validations/time-window-preset";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

async function getTimeWindowPreset(id: string, companyId: string) {
  const whereClause = withTenantFilter(timeWindowPresets, [
    eq(timeWindowPresets.id, id),
  ]);
  const [record] = await db
    .select()
    .from(timeWindowPresets)
    .where(whereClause)
    .limit(1);
  return record;
}

// GET - Get by ID
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
    const record = await getTimeWindowPreset(id, tenantCtx.companyId);

    if (!record) {
      return NextResponse.json(
        { error: "Time window preset not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(record);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch time window preset" },
      { status: 500 },
    );
  }
}

// PATCH - Update
export async function PATCH(
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
    const existing = await getTimeWindowPreset(id, tenantCtx.companyId);

    if (!existing) {
      return NextResponse.json(
        { error: "Time window preset not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const validatedData = updateTimeWindowPresetSchema.parse(body);

    // Check for uniqueness of name if name is being changed
    if (validatedData.name && validatedData.name !== existing.name) {
      const context = requireTenantContext();
      const nameConflict = await db
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

      if (nameConflict.length > 0) {
        return NextResponse.json(
          { error: "A time window preset with this name already exists" },
          { status: 409 },
        );
      }
    }

    // Remove id from validatedData before update
    const { id: _, ...updateData } = validatedData;

    const [updated] = await db
      .update(timeWindowPresets)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(timeWindowPresets.id, id))
      .returning();

    await logUpdate("time_window_preset", id, {
      before: existing,
      after: updated,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message || "Failed to update time window preset" },
      { status: 500 },
    );
  }
}

// DELETE - Soft delete
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
    const existing = await getTimeWindowPreset(id, tenantCtx.companyId);

    if (!existing) {
      return NextResponse.json(
        { error: "Time window preset not found" },
        { status: 404 },
      );
    }

    await db
      .update(timeWindowPresets)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(timeWindowPresets.id, id));

    await logDelete("time_window_preset", id, existing);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to delete time window preset" },
      { status: 500 },
    );
  }
}
