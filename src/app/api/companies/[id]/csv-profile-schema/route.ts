import { type NextRequest, NextResponse } from "next/server";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  generateCsvTemplate,
  resolveProfileSchema,
} from "@/lib/orders/profile-schema";

/**
 * GET /api/companies/[id]/csv-profile-schema
 *
 * Returns the unified CSV ProfileSchema for the given company. The import UI
 * consumes this BEFORE the user picks a file so we can:
 *   - show required / optional columns with examples
 *   - validate the CSV headers live when a file is dragged in
 *   - generate a downloadable template straight from the response
 *
 * Access control: authenticated caller with `company:read`. An ADMIN_SISTEMA
 * can target any company via the path param; any other role may only request
 * their own company (cross-tenant rejected).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id: targetCompanyId }, authResult] = await Promise.all([
    params,
    requireRoutePermission(request, EntityType.COMPANY, Action.READ),
  ]);

  if (authResult instanceof NextResponse) return authResult;

  if (
    authResult.role !== "ADMIN_SISTEMA" &&
    authResult.companyId !== targetCompanyId
  ) {
    return NextResponse.json(
      {
        error: "Cannot access another company's schema",
        code: "TENANT_MISMATCH",
      },
      { status: 403 },
    );
  }

  setTenantContext({ companyId: targetCompanyId, userId: authResult.userId });

  try {
    const schema = await resolveProfileSchema(targetCompanyId);
    // Optional: include a ready-to-download template so the UI doesn't need
    // a second call for "download example CSV".
    const template = generateCsvTemplate(schema);
    return NextResponse.json({ data: { schema, template } });
  } catch (error) {
    console.error("Error resolving CSV profile schema:", error);
    return NextResponse.json(
      { error: "Failed to resolve profile schema" },
      { status: 500 },
    );
  }
}
