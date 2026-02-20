import { desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vehicleSkills } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { logCreate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  vehicleSkillQuerySchema,
  vehicleSkillSchema,
} from "@/lib/validations/vehicle-skill";

import { extractTenantContext } from "@/lib/routing/route-helpers";

export async function GET(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { searchParams } = new URL(request.url);
    const query = vehicleSkillQuerySchema.parse(
      Object.fromEntries(searchParams),
    );

    const conditions: SQL<unknown>[] = [];

    if (query.category) {
      conditions.push(eq(vehicleSkills.category, query.category));
    }
    if (query.active !== undefined) {
      conditions.push(eq(vehicleSkills.active, query.active));
    }
    if (query.search) {
      const searchCondition = or(
        ilike(vehicleSkills.name, `%${query.search}%`),
        ilike(vehicleSkills.code, `%${query.search}%`),
        ilike(vehicleSkills.description, `%${query.search}%`),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    // Apply tenant filtering
    const whereClause = withTenantFilter(
      vehicleSkills,
      conditions.filter(Boolean),
    );

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(vehicleSkills)
        .where(whereClause)
        .orderBy(desc(vehicleSkills.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      db
        .select({ count: vehicleSkills.id })
        .from(vehicleSkills)
        .where(whereClause),
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
    console.error("Error fetching vehicle skills:", error);
    return NextResponse.json(
      { error: "Error fetching vehicle skills" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const body = await request.json();
    const validatedData = vehicleSkillSchema.parse(body);

    // Check for duplicate code (globally unique)
    const existingSkill = await db
      .select()
      .from(vehicleSkills)
      .where(eq(vehicleSkills.code, validatedData.code))
      .limit(1);

    if (existingSkill.length > 0) {
      return NextResponse.json(
        { error: "Ya existe una habilidad con este código" },
        { status: 400 },
      );
    }

    const [newSkill] = await db
      .insert(vehicleSkills)
      .values({
        ...validatedData,
        companyId: tenantCtx.companyId,
        updatedAt: new Date(),
      })
      .returning();

    // Log creation
    await logCreate("vehicle_skill", newSkill.id, newSkill);

    return NextResponse.json(newSkill, { status: 201 });
  } catch (error) {
    console.error("Error creating vehicle skill:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Error creating vehicle skill" },
      { status: 500 },
    );
  }
}
