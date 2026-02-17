import { and, desc, eq, gte, lte } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { Action, EntityType } from "@/lib/auth/authorization";
import {
  checkPermissionOrError,
  handleError,
  setupAuthContext,
  unauthorizedResponse,
} from "@/lib/routing/route-helpers";
import { companyQuerySchema, companySchema } from "@/lib/validations/company";

export async function GET(request: NextRequest) {
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

    // ADMIN_SISTEMA can see all companies, others can only see their own
    const isSystemAdmin = authResult.user.role === "ADMIN_SISTEMA";
    const whereClause = isSystemAdmin
      ? conditions.length > 0
        ? and(...conditions)
        : undefined
      : withTenantFilter(companies, conditions);

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
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    // Check if user can create companies
    const permError = checkPermissionOrError(
      authResult.user,
      EntityType.COMPANY,
      Action.CREATE,
    );
    if (permError) return permError;

    const body = await request.json();
    const validatedData = companySchema.parse(body);

    const existingCompany = await db
      .select()
      .from(companies)
      .where(eq(companies.legalName, validatedData.legalName))
      .limit(1);

    if (existingCompany.length > 0 && existingCompany[0].active) {
      return NextResponse.json(
        { error: "Ya existe una empresa activa con este nombre legal" },
        { status: 400 },
      );
    }

    const existingEmail = await db
      .select()
      .from(companies)
      .where(
        and(
          eq(companies.email, validatedData.email),
          eq(companies.active, true),
        ),
      )
      .limit(1);

    if (existingEmail.length > 0) {
      return NextResponse.json(
        {
          error: "El correo electrónico ya está en uso por otra empresa activa",
        },
        { status: 400 },
      );
    }

    const [newCompany] = await db
      .insert(companies)
      .values({
        ...validatedData,
        updatedAt: new Date(),
      })
      .returning();

    // Seed default workflow states for the new company
    try {
      const { seedDefaultWorkflowStates } = await import(
        "@/lib/workflow/seed-defaults"
      );
      await seedDefaultWorkflowStates(newCompany.id);
    } catch (error) {
      console.error(
        "Warning: Failed to seed workflow states for new company:",
        error,
      );
    }

    // Seed default field definitions for the new company
    try {
      const { seedDefaultFieldDefinitions } = await import(
        "@/lib/custom-fields/seed-defaults"
      );
      await seedDefaultFieldDefinitions(newCompany.id);
    } catch (error) {
      console.error(
        "Warning: Failed to seed field definitions for new company:",
        error,
      );
    }

    return NextResponse.json(newCompany, { status: 201 });
  } catch (error) {
    return handleError(error, "creating company");
  }
}
