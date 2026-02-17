import { and, asc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companyFieldDefinitions } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import {
  checkPermissionOrError,
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const permError = checkPermissionOrError(
      authResult.user,
      EntityType.COMPANY,
      Action.READ,
    );
    if (permError) return permError;

    const { id } = await params;

    if (!canAccessCompany(authResult.user, id)) {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const entity = searchParams.get("entity");

    const conditions = [eq(companyFieldDefinitions.companyId, id)];

    if (entity) {
      conditions.push(eq(companyFieldDefinitions.entity, entity));
    }

    const data = await db
      .select()
      .from(companyFieldDefinitions)
      .where(and(...conditions))
      .orderBy(asc(companyFieldDefinitions.position));

    return NextResponse.json({ data });
  } catch (error) {
    return handleError(error, "fetching field definitions");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const permError = checkPermissionOrError(
      authResult.user,
      EntityType.COMPANY,
      Action.UPDATE,
    );
    if (permError) return permError;

    const { id } = await params;

    if (!canAccessCompany(authResult.user, id)) {
      return unauthorizedResponse();
    }

    const body = await request.json();

    // Validate required fields
    if (!body.code || !body.label || !body.entity) {
      return NextResponse.json(
        { error: "code, label, and entity are required" },
        { status: 400 },
      );
    }

    // Check code uniqueness within company+entity
    const existing = await db
      .select()
      .from(companyFieldDefinitions)
      .where(
        and(
          eq(companyFieldDefinitions.companyId, id),
          eq(companyFieldDefinitions.entity, body.entity),
          eq(companyFieldDefinitions.code, body.code),
          eq(companyFieldDefinitions.active, true),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: `Ya existe un campo con el código "${body.code}" para esta entidad` },
        { status: 409 },
      );
    }

    const [newDefinition] = await db
      .insert(companyFieldDefinitions)
      .values({
        companyId: id,
        entity: body.entity,
        code: body.code,
        label: body.label,
        fieldType: body.fieldType || "text",
        required: body.required ?? false,
        placeholder: body.placeholder || null,
        options: body.options || null,
        defaultValue: body.defaultValue || null,
        position: body.position ?? 0,
        showInList: body.showInList ?? false,
        showInMobile: body.showInMobile ?? true,
        showInCsv: body.showInCsv ?? true,
        validationRules: body.validationRules || null,
      })
      .returning();

    return NextResponse.json(newDefinition, { status: 201 });
  } catch (error) {
    return handleError(error, "creating field definition");
  }
}
