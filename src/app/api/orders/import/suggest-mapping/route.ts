import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { csvColumnMappingTemplates } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import {
  resolveProfileSchema,
  validateCsvHeaders,
} from "@/lib/orders/profile-schema";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import { safeParseJson } from "@/lib/utils/safe-json";
import { columnMappingSuggestionRequestSchema } from "@/lib/validations/csv-column-mapping";

// POST - Suggest column mapping for CSV headers against the company profile.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ORDER,
      Action.IMPORT,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    const body = await request.json();
    const validatedData = columnMappingSuggestionRequestSchema.parse(body);

    const schema = await resolveProfileSchema(context.companyId);
    const autoResult = validateCsvHeaders(validatedData.csvHeaders, schema);

    // Overlay saved template mapping on top of the schema auto-resolver —
    // template entries take precedence.
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

    const suggestedMapping = { ...autoResult.mapping, ...(templateMapping ?? {}) };

    // Re-compute missing required keys against the final mapping.
    const mappedKeys = new Set(Object.values(suggestedMapping));
    const missingRequired = schema.fields
      .filter((f) => f.required && !mappedKeys.has(f.key))
      .map((f) => ({ key: f.key, label: f.label }));

    return NextResponse.json({
      suggestedMapping,
      unmappedHeaders: autoResult.extra,
      ambiguous: autoResult.ambiguous,
      requiredFieldsValidation: {
        allMapped: missingRequired.length === 0,
        missing: missingRequired,
      },
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
