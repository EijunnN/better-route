import { and, desc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userSkills, users, vehicleSkills } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { logCreate } from "@/lib/infra/audit";
import { setTenantContext } from "@/lib/infra/tenant";
import {
  isExpired,
  isExpiringSoon,
  userSkillQuerySchema,
  userSkillSchema,
} from "@/lib/validations/user-skill";

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
    const query = userSkillQuerySchema.parse(Object.fromEntries(searchParams));

    const conditions = [];

    if (query.active !== undefined) {
      conditions.push(eq(userSkills.active, query.active));
    }
    if (query.userId) {
      conditions.push(eq(userSkills.userId, query.userId));
    }
    if (query.skillId) {
      conditions.push(eq(userSkills.skillId, query.skillId));
    }

    // Apply tenant filtering
    const whereClause = withTenantFilter(userSkills, conditions);

    const [userSkillsData, totalResult] = await Promise.all([
      db
        .select({
          id: userSkills.id,
          companyId: userSkills.companyId,
          userId: userSkills.userId,
          skillId: userSkills.skillId,
          obtainedAt: userSkills.obtainedAt,
          expiresAt: userSkills.expiresAt,
          active: userSkills.active,
          createdAt: userSkills.createdAt,
          updatedAt: userSkills.updatedAt,
          user: {
            id: users.id,
            name: users.name,
            identification: users.identification,
          },
          skill: {
            id: vehicleSkills.id,
            code: vehicleSkills.code,
            name: vehicleSkills.name,
            category: vehicleSkills.category,
            description: vehicleSkills.description,
          },
        })
        .from(userSkills)
        .innerJoin(users, eq(userSkills.userId, users.id))
        .innerJoin(vehicleSkills, eq(userSkills.skillId, vehicleSkills.id))
        .where(whereClause)
        .orderBy(desc(userSkills.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(userSkills)
        .where(whereClause),
    ]);

    // Add expiry status and filter by status if requested
    let data = userSkillsData.map((us) => {
      const expiresAtStr = us.expiresAt?.toISOString() || null;
      let expiryStatus = "valid";
      if (expiresAtStr) {
        if (isExpired(expiresAtStr)) {
          expiryStatus = "expired";
        } else if (isExpiringSoon(expiresAtStr)) {
          expiryStatus = "expiring_soon";
        }
      }
      return {
        ...us,
        obtainedAt: us.obtainedAt.toISOString(),
        expiresAt: expiresAtStr,
        expiryStatus,
      };
    });

    // Filter by expiry status if requested
    if (query.status) {
      data = data.filter((us) => us.expiryStatus === query.status);
    }

    return NextResponse.json({
      data,
      meta: {
        total: Number(totalResult[0]?.count ?? 0),
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (error) {
    console.error("Error fetching user skills:", error);
    return NextResponse.json(
      { error: "Error fetching user skills" },
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
    const validatedData = userSkillSchema.parse(body);

    // Check if this user already has this skill assigned
    const existingSkill = await db
      .select()
      .from(userSkills)
      .where(
        and(
          eq(userSkills.companyId, tenantCtx.companyId),
          eq(userSkills.userId, validatedData.userId),
          eq(userSkills.skillId, validatedData.skillId),
          eq(userSkills.active, true),
        ),
      )
      .limit(1);

    if (existingSkill.length > 0) {
      return NextResponse.json(
        {
          error: "Este usuario ya tiene esta habilidad asignada y activa",
        },
        { status: 400 },
      );
    }

    // Verify user exists and is a conductor
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, validatedData.userId),
          eq(users.companyId, tenantCtx.companyId),
        ),
      )
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 400 },
      );
    }

    // Verify skill exists
    const [skill] = await db
      .select()
      .from(vehicleSkills)
      .where(
        and(
          eq(vehicleSkills.id, validatedData.skillId),
          eq(vehicleSkills.companyId, tenantCtx.companyId),
        ),
      )
      .limit(1);

    if (!skill) {
      return NextResponse.json(
        { error: "Habilidad no encontrada" },
        { status: 400 },
      );
    }

    // Create the user skill
    const [newUserSkill] = await db
      .insert(userSkills)
      .values({
        companyId: tenantCtx.companyId,
        userId: validatedData.userId,
        skillId: validatedData.skillId,
        obtainedAt: validatedData.obtainedAt
          ? new Date(validatedData.obtainedAt)
          : new Date(),
        expiresAt: validatedData.expiresAt
          ? new Date(validatedData.expiresAt)
          : null,
        active: validatedData.active,
        updatedAt: new Date(),
      })
      .returning();

    // Log creation
    await logCreate("user_skill", newUserSkill.id, newUserSkill);

    return NextResponse.json(
      {
        ...newUserSkill,
        obtainedAt: newUserSkill.obtainedAt.toISOString(),
        expiresAt: newUserSkill.expiresAt?.toISOString() || null,
        user: {
          id: user.id,
          name: user.name,
          identification: user.identification,
        },
        skill: {
          id: skill.id,
          code: skill.code,
          name: skill.name,
          category: skill.category,
          description: skill.description,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Error creating user skill:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: (error as Error & { errors: unknown }).errors,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Error creating user skill" },
      { status: 500 },
    );
  }
}
