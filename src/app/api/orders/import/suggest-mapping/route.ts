import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { csvColumnMappingTemplates } from "@/db/schema";
import {
  suggestColumnMapping,
  validateRequiredFieldsMapped,
} from "@/lib/orders/csv-column-mapping";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";
import { columnMappingSuggestionRequestSchema } from "@/lib/validations/csv-column-mapping";
import { EntityType, Action } from "@/lib/auth/authorization";

import { extractTenantContext } from "@/lib/routing/route-helpers";

import { safeParseJson } from "@/lib/utils/safe-json";
// POST - Suggest column mapping for CSV headers
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.ORDER, Action.IMPORT);
    if (authResult instanceof NextResponse) return authResult;

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
        templateMapping = safeParseJson(template[0].columnMapping);
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
    console.error("[Suggest Mapping] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
