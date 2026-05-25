import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companyDeliveryPolicy, USER_ROLES } from "@/db/schema";
import { getAuthenticatedUser } from "@/lib/auth/auth-api";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import {
  ALLOWED_TRANSITIONS,
  SYSTEM_STATE_ORDER,
} from "@/lib/workflow/states";

/**
 * GET /api/mobile/driver/delivery-policy
 *
 * Returns the authenticated driver's company delivery policy plus the
 * crystalized state machine (states + transitions) so the mobile app
 * can render the status picker and validate transitions client-side
 * before submitting.
 *
 * The state machine itself is the same shape for every company on
 * every install — only the labels, colours, evidence requirements,
 * and failure-reason list vary per company.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ROUTE_STOP,
      Action.READ,
    );
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

    // Lazy-insert the policy row for legacy companies that predate the
    // auto-seed. Keeps the mobile client contract: GET always returns
    // a populated policy.
    let policy = await db.query.companyDeliveryPolicy.findFirst({
      where: eq(companyDeliveryPolicy.companyId, tenantCtx.companyId),
    });

    if (!policy) {
      const [inserted] = await db
        .insert(companyDeliveryPolicy)
        .values({ companyId: tenantCtx.companyId })
        .returning();
      policy = inserted;
    }

    return NextResponse.json({
      data: {
        policy,
        stateMachine: {
          states: SYSTEM_STATE_ORDER,
          transitions: ALLOWED_TRANSITIONS,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching delivery policy:", error);

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "No autorizado. Por favor inicie sesion." },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { error: "Error al obtener la política de entrega" },
      { status: 500 },
    );
  }
}
