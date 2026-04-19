import { and, asc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  companyWorkflowStates,
  companyWorkflowTransitions,
  SYSTEM_STATES,
} from "@/db/schema";
import { handleError } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/permissions";

function assertSameTenant(
  user: { role: string; companyId: string | null },
  companyId: string,
): NextResponse | null {
  if (user.role === "ADMIN_SISTEMA") return null;
  if (user.companyId !== companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

// GET - List workflow states for a company ordered by position
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.COMPANY,
      Action.READ,
    );
    if (authResult instanceof NextResponse) return authResult;

    const { id: companyId } = await params;
    const tenantError = assertSameTenant(authResult, companyId);
    if (tenantError) return tenantError;

    const states = await db.query.companyWorkflowStates.findMany({
      where: and(
        eq(companyWorkflowStates.companyId, companyId),
        eq(companyWorkflowStates.active, true),
      ),
      orderBy: [asc(companyWorkflowStates.position)],
      with: {
        transitionsFrom: {
          where: eq(companyWorkflowTransitions.active, true),
          with: {
            toState: {
              columns: { id: true, code: true, label: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ data: states });
  } catch (error) {
    return handleError(error, "fetching workflow states");
  }
}

// POST - Create a new workflow state
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.COMPANY,
      Action.UPDATE,
    );
    if (authResult instanceof NextResponse) return authResult;

    const { id: companyId } = await params;
    const tenantError = assertSameTenant(authResult, companyId);
    if (tenantError) return tenantError;

    const body = await request.json();
    const {
      code,
      label,
      systemState,
      color,
      icon,
      position,
      requiresReason,
      requiresPhoto,
      requiresSignature,
      requiresNotes,
      reasonOptions,
      isTerminal,
      isDefault,
    } = body;

    if (!code || !label || !systemState) {
      return NextResponse.json(
        { error: "code, label, and systemState are required" },
        { status: 400 },
      );
    }

    // Validate systemState
    const validSystemStates = Object.keys(SYSTEM_STATES);
    if (!validSystemStates.includes(systemState)) {
      return NextResponse.json(
        {
          error: `Invalid systemState: ${systemState}`,
          validValues: validSystemStates,
        },
        { status: 400 },
      );
    }

    const [newState] = await db
      .insert(companyWorkflowStates)
      .values({
        companyId,
        code,
        label,
        systemState,
        color: color || "#6B7280",
        icon: icon || null,
        position: position ?? 0,
        requiresReason: requiresReason ?? false,
        requiresPhoto: requiresPhoto ?? false,
        requiresSignature: requiresSignature ?? false,
        requiresNotes: requiresNotes ?? false,
        reasonOptions: reasonOptions || null,
        isTerminal: isTerminal ?? false,
        isDefault: isDefault ?? false,
      })
      .returning();

    return NextResponse.json({ data: newState }, { status: 201 });
  } catch (error) {
    return handleError(error, "creating workflow state");
  }
}
