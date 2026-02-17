import { and, asc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  companyWorkflowStates,
  companyWorkflowTransitions,
  SYSTEM_STATES,
} from "@/db/schema";
import {
  handleError,
  setupAuthContext,
  unauthorizedResponse,
} from "@/lib/routing/route-helpers";

function canAccessCompany(
  user: { role: string; companyId: string | null },
  companyId: string,
): boolean {
  if (user.role === "ADMIN_SISTEMA") return true;
  return user.companyId === companyId;
}

// GET - List workflow states for a company ordered by position
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const { id: companyId } = await params;

    if (!canAccessCompany(authResult.user, companyId)) {
      return unauthorizedResponse();
    }

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
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const { id: companyId } = await params;

    if (!canAccessCompany(authResult.user, companyId)) {
      return unauthorizedResponse();
    }

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
