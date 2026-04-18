import { and, asc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companyFieldDefinitions, USER_ROLES } from "@/db/schema";
import { setTenantContext } from "@/lib/infra/tenant";
import { getAuthenticatedUser } from "@/lib/auth/auth-api";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.ORDER, Action.READ);
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    const authUser = await getAuthenticatedUser(request);

    if (authUser.role !== USER_ROLES.CONDUCTOR) {
      return NextResponse.json(
        { error: "Este endpoint es solo para conductores" },
        { status: 403 },
      );
    }

    const data = await db
      .select()
      .from(companyFieldDefinitions)
      .where(
        and(
          eq(companyFieldDefinitions.companyId, tenantCtx.companyId),
          eq(companyFieldDefinitions.active, true),
          eq(companyFieldDefinitions.showInMobile, true),
        ),
      )
      .orderBy(asc(companyFieldDefinitions.position));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error fetching field definitions for driver:", error);

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "No autorizado. Por favor inicie sesion." },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { error: "Error al obtener las definiciones de campos" },
      { status: 500 },
    );
  }
}
