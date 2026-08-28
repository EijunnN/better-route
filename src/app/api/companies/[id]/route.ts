import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import {
  assertSameTenant,
  handleError,
  notFoundResponse,
} from "@/lib/routing/route-helpers";
import { updateCompanySchema } from "@/lib/validations/company";

// Companies don't use tenant filtering - they ARE the tenants. The company
// being acted upon is the `[id]` in the path, so tenancy is enforced with
// assertSameTenant (ADMIN_SISTEMA: any; others: only their own).

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // The target tenant is the `[id]` in the path, not the x-company-id
    // header — same reasoning as the listing in ../route.ts: setupAuthContext
    // would demand a header from ADMIN_SISTEMA (whose JWT has no companyId)
    // and reject the request as unauthenticated.
    const user = await requireRoutePermission(
      request,
      EntityType.COMPANY,
      Action.READ,
    );
    if (user instanceof NextResponse) return user;

    const { id } = await params;

    const tenantError = assertSameTenant(user, id);
    if (tenantError) return tenantError;

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
    const user = await requireRoutePermission(
      request,
      EntityType.COMPANY,
      Action.UPDATE,
    );
    if (user instanceof NextResponse) return user;

    const { id } = await params;

    const tenantError = assertSameTenant(user, id);
    if (tenantError) return tenantError;

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
    // Deleting a company is a sensitive, cross-tenant action
    const user = await requireRoutePermission(
      request,
      EntityType.COMPANY,
      Action.DELETE,
    );
    if (user instanceof NextResponse) return user;

    const { id } = await params;

    const tenantError = assertSameTenant(user, id);
    if (tenantError) return tenantError;

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
