import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  companyWorkflowStates,
  companyWorkflowTransitions,
  USER_ROLES,
} from "@/db/schema";
import { setTenantContext } from "@/lib/infra/tenant";
import { getAuthenticatedUser } from "@/lib/auth/auth-api";
import { extractTenantContext } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

/**
 * GET /api/mobile/driver/workflow-states
 *
 * Returns workflow states for the authenticated driver's company.
 * Includes which states can transition TO each state (transitionsFrom).
 */
export async function GET(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Contexto de tenant faltante" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    const authResult = await requireRoutePermission(request, EntityType.ROUTE_STOP, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

    const authUser = await getAuthenticatedUser(request);

    if (authUser.role !== USER_ROLES.CONDUCTOR) {
      return NextResponse.json(
        { error: "Este endpoint es solo para conductores" },
        { status: 403 },
      );
    }

    // Get all active workflow states for this company
    const states = await db.query.companyWorkflowStates.findMany({
      where: and(
        eq(companyWorkflowStates.companyId, tenantCtx.companyId),
        eq(companyWorkflowStates.active, true),
      ),
      orderBy: (ws, { asc }) => [asc(ws.position)],
    });

    // Get all active transitions for this company
    const transitions = await db.query.companyWorkflowTransitions.findMany({
      where: and(
        eq(companyWorkflowTransitions.companyId, tenantCtx.companyId),
        eq(companyWorkflowTransitions.active, true),
      ),
    });

    // Build a map: toStateId -> [fromStateId, ...]
    const transitionsFromMap = new Map<string, string[]>();
    for (const t of transitions) {
      const existing = transitionsFromMap.get(t.toStateId) || [];
      existing.push(t.fromStateId);
      transitionsFromMap.set(t.toStateId, existing);
    }

    const data = states.map((state) => ({
      id: state.id,
      code: state.code,
      label: state.label,
      systemState: state.systemState,
      color: state.color,
      icon: state.icon,
      position: state.position,
      requiresReason: state.requiresReason,
      requiresPhoto: state.requiresPhoto,
      requiresSignature: state.requiresSignature,
      requiresNotes: state.requiresNotes,
      reasonOptions: state.reasonOptions,
      isTerminal: state.isTerminal,
      transitionsFrom: transitionsFromMap.get(state.id) || [],
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error fetching workflow states:", error);

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "No autorizado. Por favor inicie sesion." },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { error: "Error al obtener los estados de workflow" },
      { status: 500 },
    );
  }
}
