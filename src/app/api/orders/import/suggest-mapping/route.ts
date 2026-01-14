import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { csvColumnMappingTemplates } from "@/db/schema";
import {
  suggestColumnMapping,
  validateRequiredFieldsMapped,
} from "@/lib/csv-column-mapping";
import { requireTenantContext, setTenantContext } from "@/lib/tenant";
import { columnMappingSuggestionRequestSchema } from "@/lib/validations/csv-column-mapping";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// POST - Suggest column mapping for CSV headers
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
    const validatedData = columnMappingSuggestionRequestSchema.parse(body);

    // Get template mapping if templateId is provided
    let templateMapping: Record<string, string> | undefined;
    if (validatedData.templateId) {
      const template = await db
        .select()
        .from(csvColumnMappingTemplates)
        .where(
          and(
            eq(csvColumnMappingTemplates.id, validatedData.templateId),
            eq(csvColumnMappingTemplates.companyId, context.companyId),
            eq(csvColumnMappingTemplates.active, true),
          ),
        );

      if (template.length > 0) {
        templateMapping = JSON.parse(template[0].columnMapping);
      }
    }

    // Generate suggestions
    const suggestions = suggestColumnMapping(
      validatedData.csvHeaders,
      undefined,
      templateMapping,
    );

    // Validate required fields are mapped
    const requiredFieldsValidation = validateRequiredFieldsMapped(
      suggestions.suggestedMapping,
    );

    return NextResponse.json({
      ...suggestions,
      requiredFieldsValidation,
    });
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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate suggestions",
      },
      { status: 500 },
    );
  }
}
