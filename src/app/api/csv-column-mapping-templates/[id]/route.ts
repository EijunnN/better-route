import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { csvColumnMappingTemplates } from "@/db/schema";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";
import { updateCsvColumnMappingTemplateSchema } from "@/lib/validations/csv-column-mapping";
import { extractTenantContext } from "@/lib/routing/route-helpers";

import { safeParseJson } from "@/lib/utils/safe-json";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";
// GET - Get a specific column mapping template
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.ORDER, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const template = await db
      .select()
      .from(csvColumnMappingTemplates)
      .where(
        and(
          eq(csvColumnMappingTemplates.id, id),
          eq(csvColumnMappingTemplates.companyId, tenantCtx.companyId),
        ),
      );

    if (template.length === 0) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }

    // Parse JSON fields for response
    const parsedTemplate = {
      ...template[0],
      columnMapping: safeParseJson(template[0].columnMapping),
      requiredFields: safeParseJson(template[0].requiredFields),
    };

    return NextResponse.json(parsedTemplate);
  } catch (error) {
    console.error("[CSV Template GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// PATCH - Update a column mapping template
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.ORDER, Action.UPDATE);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    // Check if template exists
    const existing = await db
      .select()
      .from(csvColumnMappingTemplates)
      .where(
        and(
          eq(csvColumnMappingTemplates.id, id),
          eq(csvColumnMappingTemplates.companyId, tenantCtx.companyId),
        ),
      );

    if (existing.length === 0) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const validatedData = updateCsvColumnMappingTemplateSchema.parse(body);

    // If updating name, check for uniqueness
    if (validatedData.name && validatedData.name !== existing[0].name) {
      const nameConflict = await db
        .select()
        .from(csvColumnMappingTemplates)
        .where(
          and(
            eq(csvColumnMappingTemplates.companyId, tenantCtx.companyId),
            eq(csvColumnMappingTemplates.name, validatedData.name),
          ),
        );

      if (nameConflict.length > 0) {
        return NextResponse.json(
          { error: "Template with this name already exists" },
          { status: 409 },
        );
      }
    }

    // Build update object
    const updateData: Partial<typeof csvColumnMappingTemplates.$inferInsert> =
      {};
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.description !== undefined)
      updateData.description = validatedData.description;
    if (validatedData.columnMapping !== undefined) {
      updateData.columnMapping = validatedData.columnMapping;
    }
    if (validatedData.requiredFields !== undefined) {
      updateData.requiredFields = validatedData.requiredFields;
    }
    if (validatedData.active !== undefined)
      updateData.active = validatedData.active;
    updateData.updatedAt = new Date();

    // Update template
    const updated = await db
      .update(csvColumnMappingTemplates)
      .set(updateData)
      .where(
        and(
          eq(csvColumnMappingTemplates.id, id),
          eq(csvColumnMappingTemplates.companyId, tenantCtx.companyId),
        ),
      )
      .returning();

    // Parse JSON fields for response
    const parsedTemplate = {
      ...updated[0],
      columnMapping: safeParseJson(updated[0].columnMapping),
      requiredFields: safeParseJson(updated[0].requiredFields),
    };

    return NextResponse.json(parsedTemplate);
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
    console.error("[CSV Template PATCH] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// DELETE - Delete (deactivate) a column mapping template
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.ORDER, Action.DELETE);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    // Check if template exists
    const existing = await db
      .select()
      .from(csvColumnMappingTemplates)
      .where(
        and(
          eq(csvColumnMappingTemplates.id, id),
          eq(csvColumnMappingTemplates.companyId, tenantCtx.companyId),
        ),
      );

    if (existing.length === 0) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }

    // Soft delete (set active to false)
    await db
      .update(csvColumnMappingTemplates)
      .set({
        active: false,
        updatedAt: new Date(),
      })
      .where(eq(csvColumnMappingTemplates.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CSV Template DELETE] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
