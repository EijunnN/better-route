import { type NextRequest, NextResponse } from "next/server";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  generateCsvTemplate,
  resolveProfileSchema,
} from "@/lib/orders/profile-schema";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

// GET - Download CSV template based on company profile
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ORDER,
      Action.READ,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv"; // csv | json
    const locale = (searchParams.get("locale") || "es") as "en" | "es";

    const schema = await resolveProfileSchema(tenantCtx.companyId);

    if (format === "json") {
      // UI consumes this to render the "what the CSV expects" preview.
      return NextResponse.json({
        data: {
          fields: schema.fields.map((f) => ({
            key: f.key,
            label: locale === "en" && f.labelEn ? f.labelEn : f.label,
            required: f.required,
            kind: f.kind,
            description: f.description,
            example: f.example,
            origin: f.origin,
          })),
          activeDimensions: schema.activeDimensions,
          requireOrderType: schema.requireOrderType,
          timeWindowPresets: schema.timeWindowPresets.map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
          })),
        },
      });
    }

    const csvContent = generateCsvTemplate(schema, { locale });

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ordenes_template.csv"`,
      },
    });
  } catch (error) {
    console.error("Error generating CSV template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
