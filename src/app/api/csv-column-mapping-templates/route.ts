import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { csvColumnMappingTemplates } from "@/db/schema";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";
import { csvColumnMappingTemplateSchema } from "@/lib/validations/csv-column-mapping";

import { extractTenantContext } from "@/lib/routing/route-helpers";

import { safeParseJson } from "@/lib/utils/safe-json";
// GET - List all column mapping templates for the company
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
    const context = requireTenantContext();

    const templates = await db
      .select()
      .from(csvColumnMappingTemplates)
      .where(
        and(
          eq(csvColumnMappingTemplates.companyId, context.companyId),
          eq(csvColumnMappingTemplates.active, true),
        ),
      )
      .orderBy(csvColumnMappingTemplates.createdAt);

    // Parse JSON fields
    const parsedTemplates = templates.map((template) => ({
      ...template,
      columnMapping: safeParseJson(template.columnMapping),
      requiredFields: safeParseJson(template.requiredFields),
    }));

    return NextResponse.json(parsedTemplates);
  } catch (error) {
    console.error("[CSV Templates GET] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST - Create a new column mapping template
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
    const context = requireTenantContext();

    const body = await request.json();
    const validatedData = csvColumnMappingTemplateSchema.parse(body);

    // Check if template with same name already exists
    const existing = await db
      .select()
      .from(csvColumnMappingTemplates)
      .where(
        and(
          eq(csvColumnMappingTemplates.companyId, context.companyId),
          eq(csvColumnMappingTemplates.name, validatedData.name),
        ),
      );

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Template with this name already exists" },
        { status: 409 },
      );
    }

    // Create template
    const template = await db
      .insert(csvColumnMappingTemplates)
      .values({
        companyId: context.companyId,
        name: validatedData.name,
        description: validatedData.description || null,
        columnMapping: validatedData.columnMapping,
        requiredFields: validatedData.requiredFields,
        active: validatedData.active ?? true,
      })
      .returning();

    // Parse JSON fields for response
    const parsedTemplate = {
      ...template[0],
      columnMapping: safeParseJson(template[0].columnMapping),
      requiredFields: safeParseJson(template[0].requiredFields),
    };

    return NextResponse.json(parsedTemplate, { status: 201 });
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
    console.error("[CSV Templates POST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
