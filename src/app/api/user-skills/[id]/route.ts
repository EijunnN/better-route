import { eq } from "drizzle-orm";
import { after } from "next/server";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userSkills, users, vehicleSkills } from "@/db/schema";
import { TenantAccessDeniedError, withTenantFilter } from "@/db/tenant-aware";
import { logDelete, logUpdate } from "@/lib/audit";
import { setTenantContext } from "@/lib/tenant";
import {
  isExpired,
  isExpiringSoon,
  updateUserSkillSchema,
} from "@/lib/validations/user-skill";

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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { id } = await params;

    // Apply tenant filtering
    const whereClause = withTenantFilter(userSkills, [eq(userSkills.id, id)], tenantCtx.companyId);

    const [userSkill] = await db
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
      .limit(1);

    if (!userSkill) {
      return NextResponse.json(
        { error: "User skill not found" },
        { status: 404 },
      );
    }

    const expiresAtStr = userSkill.expiresAt?.toISOString() || null;
    let expiryStatus = "valid";
    if (expiresAtStr) {
      if (isExpired(expiresAtStr)) {
        expiryStatus = "expired";
      } else if (isExpiringSoon(expiresAtStr)) {
        expiryStatus = "expiring_soon";
      }
    }

    return NextResponse.json({
      ...userSkill,
      obtainedAt: userSkill.obtainedAt.toISOString(),
      expiresAt: expiresAtStr,
      expiryStatus,
    });
  } catch (error) {
    after(() => console.error("Error fetching user skill:", error));
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error fetching user skill" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { id } = await params;
    const body = await request.json();
    const validatedData = updateUserSkillSchema.parse({ ...body, id });

    // Apply tenant filtering when fetching existing user skill
    const existingWhereClause = withTenantFilter(userSkills, [
      eq(userSkills.id, id),
    ], tenantCtx.companyId);

    const [existingUserSkill] = await db
      .select()
      .from(userSkills)
      .where(existingWhereClause)
      .limit(1);

    if (!existingUserSkill) {
      return NextResponse.json(
        { error: "User skill not found" },
        { status: 404 },
      );
    }

    // Build update data
    const { id: _, ...updateFields } = validatedData;
    const updateData: Record<string, Date | boolean | null> = {
      updatedAt: new Date(),
    };

    if (updateFields.obtainedAt !== undefined) {
      updateData.obtainedAt = new Date(updateFields.obtainedAt);
    }
    if (updateFields.expiresAt !== undefined) {
      updateData.expiresAt = updateFields.expiresAt
        ? new Date(updateFields.expiresAt)
        : null;
    }
    if (updateFields.active !== undefined) {
      updateData.active = updateFields.active;
    }

    // Update user skill
    const [updatedUserSkill] = await db
      .update(userSkills)
      .set(updateData)
      .where(existingWhereClause)
      .returning();

    // Get related data for response
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, updatedUserSkill.userId))
      .limit(1);

    const [skill] = await db
      .select()
      .from(vehicleSkills)
      .where(eq(vehicleSkills.id, updatedUserSkill.skillId))
      .limit(1);

    // Log update (non-blocking)
    after(async () => {
      await logUpdate("user_skill", id, {
        before: existingUserSkill,
        after: updatedUserSkill,
      });
    });

    const expiresAtStr = updatedUserSkill.expiresAt?.toISOString() || null;
    let expiryStatus = "valid";
    if (expiresAtStr) {
      if (isExpired(expiresAtStr)) {
        expiryStatus = "expired";
      } else if (isExpiringSoon(expiresAtStr)) {
        expiryStatus = "expiring_soon";
      }
    }

    return NextResponse.json({
      ...updatedUserSkill,
      obtainedAt: updatedUserSkill.obtainedAt.toISOString(),
      expiresAt: expiresAtStr,
      expiryStatus,
      user: user
        ? {
            id: user.id,
            name: user.name,
            identification: user.identification,
          }
        : null,
      skill: skill
        ? {
            id: skill.id,
            code: skill.code,
            name: skill.name,
            category: skill.category,
            description: skill.description,
          }
        : null,
    });
  } catch (error: unknown) {
    after(() => console.error("Error updating user skill:", error));
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
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
      { error: "Error updating user skill" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const { id } = await params;

    // Apply tenant filtering when fetching existing user skill
    const whereClause = withTenantFilter(userSkills, [eq(userSkills.id, id)], tenantCtx.companyId);

    const [existingUserSkill] = await db
      .select()
      .from(userSkills)
      .where(whereClause)
      .limit(1);

    if (!existingUserSkill) {
      return NextResponse.json(
        { error: "User skill not found" },
        { status: 404 },
      );
    }

    // Soft delete - set active to false
    await db
      .update(userSkills)
      .set({
        active: false,
        updatedAt: new Date(),
      })
      .where(whereClause);

    // Log deletion (non-blocking)
    after(async () => {
      await logDelete("user_skill", id, existingUserSkill);
    });

    return NextResponse.json({
      success: true,
      message: "Habilidad de usuario desactivada exitosamente",
    });
  } catch (error) {
    after(() => console.error("Error deleting user skill:", error));
    if (error instanceof TenantAccessDeniedError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error deleting user skill" },
      { status: 500 },
    );
  }
}
