import { and, asc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companyFieldDefinitions, companyOptimizationProfiles } from "@/db/schema";
import { parseProfile } from "@/lib/optimization/capacity-mapper";
import {
  generateCsvTemplate,
  getFieldDocumentation,
  CSV_TEMPLATES,
  type CsvCustomFieldInfo,
} from "@/lib/orders/dynamic-csv-fields";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// GET - Download CSV template based on company profile
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

    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv"; // csv or json
    const locale = (searchParams.get("locale") || "es") as "en" | "es";
    const templateType = searchParams.get("template"); // LOGISTICS, HIGH_VALUE, SIMPLE, or null for company profile

    // Get company profile
    let profile = null;

    if (!templateType) {
      const profiles = await db
        .select()
        .from(companyOptimizationProfiles)
        .where(
          and(
            eq(companyOptimizationProfiles.companyId, context.companyId),
            eq(companyOptimizationProfiles.active, true),
          ),
        );

      if (profiles.length > 0) {
        profile = parseProfile(profiles[0]);
      }
    }

    // Fetch custom field definitions for this company (showInCsv + active)
    const customFieldDefs = await db
      .select({
        code: companyFieldDefinitions.code,
        label: companyFieldDefinitions.label,
        fieldType: companyFieldDefinitions.fieldType,
        required: companyFieldDefinitions.required,
      })
      .from(companyFieldDefinitions)
      .where(
        and(
          eq(companyFieldDefinitions.companyId, context.companyId),
          eq(companyFieldDefinitions.entity, "orders"),
          eq(companyFieldDefinitions.showInCsv, true),
          eq(companyFieldDefinitions.active, true),
        ),
      )
      .orderBy(asc(companyFieldDefinitions.position));

    const customFields: CsvCustomFieldInfo[] = customFieldDefs;

    // Generate template based on format
    if (format === "json") {
      // Return field documentation for UI
      const fields = getFieldDocumentation(profile, locale);
      const templates = Object.entries(CSV_TEMPLATES).map(([key, value]) => ({
        id: key,
        ...value,
      }));

      return NextResponse.json({
        data: {
          fields,
          templates,
          customFields,
          profile: profile
            ? {
                activeDimensions: profile.activeDimensions,
                enableOrderType: profile.enableOrderType,
              }
            : null,
        },
      });
    }

    // Generate CSV content
    const csvContent = generateCsvTemplate(profile, locale, customFields);

    // Return as downloadable CSV file
    const filename = templateType
      ? `ordenes_template_${templateType.toLowerCase()}.csv`
      : "ordenes_template.csv";

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error generating CSV template:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate template" },
      { status: 500 },
    );
  }
}
