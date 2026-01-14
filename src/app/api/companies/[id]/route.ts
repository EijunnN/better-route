import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companies } from "@/db/schema";
import {
  TenantAccessDeniedError,
  verifyTenantAccess,
  withTenantFilter,
} from "@/db/tenant-aware";
import { Action, EntityType } from "@/lib/authorization";
import {
  checkPermissionOrError,
  handleError,
  notFoundResponse,
  setupAuthContext,
  unauthorizedResponse,
} from "@/lib/route-helpers";
import { setTenantContext } from "@/lib/tenant";
import { updateCompanySchema } from "@/lib/validations/company";

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

    // Apply tenant filtering
    const whereClause = withTenantFilter(companies, [eq(companies.id, id)]);

    const [company] = await db
      .select()
      .from(companies)
      .where(whereClause)
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
    const body = await request.json();
    const validatedData = updateCompanySchema.parse({ ...body, id });

    // Apply tenant filtering when fetching existing company
    const existingWhereClause = withTenantFilter(companies, [
      eq(companies.id, id),
    ]);

    const existingCompany = await db
      .select()
      .from(companies)
      .where(existingWhereClause)
      .limit(1);

    if (existingCompany.length === 0) {
      return notFoundResponse("Company");
    }

    // Verify tenant access
    verifyTenantAccess(existingCompany[0].id);

    if (
      validatedData.legalName &&
      validatedData.legalName !== existingCompany[0].legalName
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

    if (
      validatedData.email &&
      validatedData.email !== existingCompany[0].email
    ) {
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
      .where(existingWhereClause)
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

    // Apply tenant filtering when fetching existing company
    const whereClause = withTenantFilter(companies, [eq(companies.id, id)]);

    const existingCompany = await db
      .select()
      .from(companies)
      .where(whereClause)
      .limit(1);

    if (existingCompany.length === 0) {
      return notFoundResponse("Company");
    }

    // Verify tenant access
    verifyTenantAccess(existingCompany[0].id);

    await db
      .update(companies)
      .set({
        active: false,
        updatedAt: new Date(),
      })
      .where(whereClause);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error, "deleting company");
  }
}
