import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { optimizationConfigurations } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { logDelete, logUpdate } from "@/lib/audit";
import { setTenantContext } from "@/lib/tenant";
import { optimizationConfigUpdateSchema } from "@/lib/validations/optimization-config";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// GET - Get single optimization configuration
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);
  const { id } = await params;

  try {
    const [config] = await db
      .select()
      .from(optimizationConfigurations)
      .where(
        and(
          eq(optimizationConfigurations.id, id),
          withTenantFilter(optimizationConfigurations),
        ),
      )
      .limit(1);

    if (!config) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: config });
  } catch (error) {
    console.error("Error fetching optimization configuration:", error);
    return NextResponse.json(
      { error: "Failed to fetch configuration" },
      { status: 500 },
    );
  }
}

// PATCH - Update optimization configuration
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);
  const { id } = await params;

  try {
    const body = await request.json();
    const data = optimizationConfigUpdateSchema.parse(body);

    // Check if configuration exists
    const [existing] = await db
      .select()
      .from(optimizationConfigurations)
      .where(
        and(
          eq(optimizationConfigurations.id, id),
          withTenantFilter(optimizationConfigurations),
        ),
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 },
      );
    }

    // Don't allow updates to configurations that are already being processed
    if (existing.status === "OPTIMIZING") {
      return NextResponse.json(
        {
          error:
            "Cannot modify configuration while optimization is in progress",
        },
        { status: 400 },
      );
    }

    // Update configuration
    const [updated] = await db
      .update(optimizationConfigurations)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(optimizationConfigurations.id, id))
      .returning();

    // Log update
    await logUpdate("optimization_configuration", id, {
      changes: data,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Error && "name" in error) {
      return NextResponse.json(
        { error: "Validation error", details: error },
        { status: 400 },
      );
    }
    console.error("Error updating optimization configuration:", error);
    return NextResponse.json(
      { error: "Failed to update configuration" },
      { status: 500 },
    );
  }
}

// DELETE - Delete optimization configuration
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Missing tenant context" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);
  const { id } = await params;

  try {
    // Check if configuration exists
    const [existing] = await db
      .select()
      .from(optimizationConfigurations)
      .where(
        and(
          eq(optimizationConfigurations.id, id),
          withTenantFilter(optimizationConfigurations),
        ),
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 },
      );
    }

    // Don't allow deletion of configurations that are being processed
    if (existing.status === "OPTIMIZING") {
      return NextResponse.json(
        {
          error:
            "Cannot delete configuration while optimization is in progress",
        },
        { status: 400 },
      );
    }

    await db
      .delete(optimizationConfigurations)
      .where(eq(optimizationConfigurations.id, id));

    // Log deletion
    await logDelete("optimization_configuration", id, {
      name: existing.name,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting optimization configuration:", error);
    return NextResponse.json(
      { error: "Failed to delete configuration" },
      { status: 500 },
    );
  }
}
