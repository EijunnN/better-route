import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companyFieldDefinitions } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import {
  checkPermissionOrError,
  handleError,
  notFoundResponse,
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
  { params }: { params: Promise<{ id: string; fieldId: string }> },
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

    const { id, fieldId } = await params;

    if (!canAccessCompany(authResult.user, id)) {
      return unauthorizedResponse();
    }

    const [definition] = await db
      .select()
      .from(companyFieldDefinitions)
      .where(
        and(
          eq(companyFieldDefinitions.id, fieldId),
          eq(companyFieldDefinitions.companyId, id),
        ),
      )
      .limit(1);

    if (!definition) {
      return notFoundResponse("Field definition");
    }

    return NextResponse.json(definition);
  } catch (error) {
    return handleError(error, "fetching field definition");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fieldId: string }> },
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

    const { id, fieldId } = await params;

    if (!canAccessCompany(authResult.user, id)) {
      return unauthorizedResponse();
    }

    const [existing] = await db
      .select()
      .from(companyFieldDefinitions)
      .where(
        and(
          eq(companyFieldDefinitions.id, fieldId),
          eq(companyFieldDefinitions.companyId, id),
        ),
      )
      .limit(1);

    if (!existing) {
      return notFoundResponse("Field definition");
    }

    const body = await request.json();

    const [updated] = await db
      .update(companyFieldDefinitions)
      .set({
        ...(body.label !== undefined && { label: body.label }),
        ...(body.fieldType !== undefined && { fieldType: body.fieldType }),
        ...(body.required !== undefined && { required: body.required }),
        ...(body.placeholder !== undefined && { placeholder: body.placeholder }),
        ...(body.options !== undefined && { options: body.options }),
        ...(body.defaultValue !== undefined && { defaultValue: body.defaultValue }),
        ...(body.position !== undefined && { position: body.position }),
        ...(body.showInList !== undefined && { showInList: body.showInList }),
        ...(body.showInMobile !== undefined && { showInMobile: body.showInMobile }),
        ...(body.showInCsv !== undefined && { showInCsv: body.showInCsv }),
        ...(body.validationRules !== undefined && { validationRules: body.validationRules }),
        ...(body.active !== undefined && { active: body.active }),
        updatedAt: new Date(),
      })
      .where(eq(companyFieldDefinitions.id, fieldId))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    return handleError(error, "updating field definition");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fieldId: string }> },
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

    const { id, fieldId } = await params;

    if (!canAccessCompany(authResult.user, id)) {
      return unauthorizedResponse();
    }

    const [existing] = await db
      .select()
      .from(companyFieldDefinitions)
      .where(
        and(
          eq(companyFieldDefinitions.id, fieldId),
          eq(companyFieldDefinitions.companyId, id),
        ),
      )
      .limit(1);

    if (!existing) {
      return notFoundResponse("Field definition");
    }

    // Soft delete
    const [deleted] = await db
      .update(companyFieldDefinitions)
      .set({
        active: false,
        updatedAt: new Date(),
      })
      .where(eq(companyFieldDefinitions.id, fieldId))
      .returning();

    return NextResponse.json(deleted);
  } catch (error) {
    return handleError(error, "deleting field definition");
  }
}
