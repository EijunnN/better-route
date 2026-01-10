import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { updateCompanySchema } from "@/lib/validations/company";
import { eq, and } from "drizzle-orm";
import { withTenantFilter, verifyTenantAccess, TenantAccessDeniedError } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/tenant";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");

  if (!companyId) {
    return null;
  }

  return {
    companyId,
    userId: userId || undefined,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 }
      );
    }

    setTenantContext(tenantCtx);

    const { id } = await params;

    // Apply tenant filtering
    const whereClause = withTenantFilter(companies, [eq(companies.id, id)]);

    const [company] = await db
      .select()
      .from(companies)
      .where(whereClause)
      .limit(1);

    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(company);
  } catch (error) {
    console.error("Error fetching company:", error);
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "Error fetching company" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 }
      );
    }

    setTenantContext(tenantCtx);

    const { id } = await params;
    const body = await request.json();
    const validatedData = updateCompanySchema.parse({ ...body, id });

    // Apply tenant filtering when fetching existing company
    const existingWhereClause = withTenantFilter(companies, [eq(companies.id, id)]);

    const existingCompany = await db
      .select()
      .from(companies)
      .where(existingWhereClause)
      .limit(1);

    if (existingCompany.length === 0) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // Verify tenant access
    verifyTenantAccess(existingCompany[0].id);

    if (validatedData.legalName && validatedData.legalName !== existingCompany[0].legalName) {
      const duplicateLegalName = await db
        .select()
        .from(companies)
        .where(and(
          eq(companies.legalName, validatedData.legalName),
          eq(companies.active, true)
        ))
        .limit(1);

      if (duplicateLegalName.length > 0) {
        return NextResponse.json(
          { error: "Ya existe una empresa activa con este nombre legal" },
          { status: 400 }
        );
      }
    }

    if (validatedData.email && validatedData.email !== existingCompany[0].email) {
      const duplicateEmail = await db
        .select()
        .from(companies)
        .where(and(
          eq(companies.email, validatedData.email),
          eq(companies.active, true)
        ))
        .limit(1);

      if (duplicateEmail.length > 0) {
        return NextResponse.json(
          { error: "El correo electrónico ya está en uso por otra empresa activa" },
          { status: 400 }
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
    console.error("Error updating company:", error);
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Error updating company" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 }
      );
    }

    setTenantContext(tenantCtx);

    const { id } = await params;

    // Apply tenant filtering when fetching existing company
    const whereClause = withTenantFilter(companies, [eq(companies.id, id)]);

    const existingCompany = await db
      .select()
      .from(companies)
      .where(whereClause)
      .limit(1);

    if (existingCompany.length === 0) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
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
    console.error("Error deleting company:", error);
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "Error deleting company" },
      { status: 500 }
    );
  }
}
