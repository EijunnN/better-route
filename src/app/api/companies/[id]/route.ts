import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { Action, EntityType } from "@/lib/authorization";
import {
  checkPermissionOrError,
  handleError,
  notFoundResponse,
  setupAuthContext,
  unauthorizedResponse,
} from "@/lib/route-helpers";
import { updateCompanySchema } from "@/lib/validations/company";

// Companies don't use tenant filtering - they ARE the tenants
// ADMIN_SISTEMA can access all companies, others only their own
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

    // Check if user can read companies
    const permError = checkPermissionOrError(
      authResult.user,
      EntityType.COMPANY,
      Action.READ,
    );
    if (permError) return permError;

    const { id } = await params;

    // Check access to this specific company
    if (!canAccessCompany(authResult.user, id)) {
      return unauthorizedResponse();
    }

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (!company) {
      return notFoundResponse("Company");
    }

    return NextResponse.json(company);
  } catch (error) {
    return handleError(error, "fetching company");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    // Check if user can update companies
    const permError = checkPermissionOrError(
      authResult.user,
      EntityType.COMPANY,
      Action.UPDATE,
    );
    if (permError) return permError;

    const { id } = await params;

    // Check access to this specific company
    if (!canAccessCompany(authResult.user, id)) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const validatedData = updateCompanySchema.parse({ ...body, id });

    const [existingCompany] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (!existingCompany) {
      return notFoundResponse("Company");
    }

    if (
      validatedData.legalName &&
      validatedData.legalName !== existingCompany.legalName
    ) {
      const duplicateLegalName = await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.legalName, validatedData.legalName),
            eq(companies.active, true),
          ),
        )
        .limit(1);

      if (duplicateLegalName.length > 0) {
        return NextResponse.json(
          { error: "Ya existe una empresa activa con este nombre legal" },
          { status: 400 },
        );
      }
    }

    if (validatedData.email && validatedData.email !== existingCompany.email) {
      const duplicateEmail = await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.email, validatedData.email),
            eq(companies.active, true),
          ),
        )
        .limit(1);

      if (duplicateEmail.length > 0) {
        return NextResponse.json(
          {
            error:
              "El correo electrónico ya está en uso por otra empresa activa",
          },
          { status: 400 },
        );
      }
    }

    const { id: _, ...updateData } = validatedData;

    const [updatedCompany] = await db
      .update(companies)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, id))
      .returning();

    return NextResponse.json(updatedCompany);
  } catch (error) {
    return handleError(error, "updating company");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    // Check if user can delete companies (sensitive action)
    const permError = checkPermissionOrError(
      authResult.user,
      EntityType.COMPANY,
      Action.DELETE,
    );
    if (permError) return permError;

    const { id } = await params;

    // Check access to this specific company
    if (!canAccessCompany(authResult.user, id)) {
      return unauthorizedResponse();
    }

    const [existingCompany] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (!existingCompany) {
      return notFoundResponse("Company");
    }

    await db
      .update(companies)
      .set({
        active: false,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, "deleting company");
  }
}
