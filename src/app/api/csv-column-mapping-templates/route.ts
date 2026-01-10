import { NextRequest, NextResponse } from "next/server";
import { setTenantContext, requireTenantContext } from "@/lib/tenant";
import { db } from "@/db";
import { csvColumnMappingTemplates } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { csvColumnMappingTemplateSchema } from "@/lib/validations/csv-column-mapping";
import { z } from "zod";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// GET - List all column mapping templates for the company
export async function GET(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 }
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
          eq(csvColumnMappingTemplates.active, true)
        )
      )
      .orderBy(csvColumnMappingTemplates.createdAt);

    // Parse JSON fields
    const parsedTemplates = templates.map((template) => ({
      ...template,
      columnMapping: JSON.parse(template.columnMapping),
      requiredFields: JSON.parse(template.requiredFields),
    }));

    return NextResponse.json(parsedTemplates);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch templates" },
      { status: 500 }
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
        { status: 401 }
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
          eq(csvColumnMappingTemplates.name, validatedData.name)
        )
      );

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Template with this name already exists" },
        { status: 409 }
      );
    }

    // Create template
    const template = await db
      .insert(csvColumnMappingTemplates)
      .values({
        companyId: context.companyId,
        name: validatedData.name,
        description: validatedData.description || null,
        columnMapping: JSON.stringify(validatedData.columnMapping),
        requiredFields: JSON.stringify(validatedData.requiredFields),
        active: validatedData.active ?? true,
      })
      .returning();

    // Parse JSON fields for response
    const parsedTemplate = {
      ...template[0],
      columnMapping: JSON.parse(template[0].columnMapping),
      requiredFields: JSON.parse(template[0].requiredFields),
    };

    return NextResponse.json(parsedTemplate, { status: 201 });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || "Failed to create template" },
      { status: 500 }
    );
  }
}
