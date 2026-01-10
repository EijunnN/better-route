import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { companySchema, companyQuerySchema } from "@/lib/validations/company";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { withTenantFilter, verifyTenantAccess, getAuditLogContext } from "@/db/tenant-aware";
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

export async function GET(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 }
      );
    }

    setTenantContext(tenantCtx);

    const { searchParams } = new URL(request.url);
    const query = companyQuerySchema.parse(Object.fromEntries(searchParams));

    const conditions = [];

    if (query.active !== undefined) {
      conditions.push(eq(companies.active, query.active));
    }
    if (query.country) {
      conditions.push(eq(companies.country, query.country));
    }
    if (query.startDate) {
      conditions.push(gte(companies.createdAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      conditions.push(lte(companies.createdAt, new Date(query.endDate)));
    }

    // Apply tenant filtering - users can only see their own company
    const whereClause = withTenantFilter(companies, conditions);

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(companies)
        .where(whereClause)
        .orderBy(desc(companies.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      db.select({ count: companies.id }).from(companies).where(whereClause),
    ]);

    return NextResponse.json({
      data,
      meta: {
        total: totalResult.length,
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (error) {
    console.error("Error fetching companies:", error);
    return NextResponse.json(
      { error: "Error fetching companies" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 }
      );
    }

    setTenantContext(tenantCtx);

    const body = await request.json();
    const validatedData = companySchema.parse(body);

    // Check if user has permission to create companies
    // For now, we assume this is an admin operation

    const existingCompany = await db
      .select()
      .from(companies)
      .where(eq(companies.legalName, validatedData.legalName))
      .limit(1);

    if (existingCompany.length > 0 && existingCompany[0].active) {
      return NextResponse.json(
        { error: "Ya existe una empresa activa con este nombre legal" },
        { status: 400 }
      );
    }

    const existingEmail = await db
      .select()
      .from(companies)
      .where(and(eq(companies.email, validatedData.email), eq(companies.active, true)))
      .limit(1);

    if (existingEmail.length > 0) {
      return NextResponse.json(
        { error: "El correo electrónico ya está en uso por otra empresa activa" },
        { status: 400 }
      );
    }

    const [newCompany] = await db
      .insert(companies)
      .values({
        ...validatedData,
        updatedAt: new Date(),
      })
      .returning();

    return NextResponse.json(newCompany, { status: 201 });
  } catch (error) {
    console.error("Error creating company:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Error creating company" },
      { status: 500 }
    );
  }
}
