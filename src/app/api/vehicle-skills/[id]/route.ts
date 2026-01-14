import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vehicleSkills } from "@/db/schema";
import { logDelete, logUpdate } from "@/lib/audit";
import { setTenantContext } from "@/lib/tenant";
import { updateVehicleSkillSchema } from "@/lib/validations/vehicle-skill";

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
    const validatedData = updateVehicleSkillSchema.parse({ ...body, id });

    // Check if skill exists and belongs to tenant
    const existingSkill = await db
      .select()
      .from(vehicleSkills)
      .where(
        and(
          eq(vehicleSkills.id, id),
          eq(vehicleSkills.companyId, tenantCtx.companyId),
        ),
      )
      .limit(1);

    if (existingSkill.length === 0) {
      return NextResponse.json(
        { error: "Habilidad no encontrada" },
        { status: 404 },
      );
    }

    // If changing code, check for duplicates
    if (validatedData.code && validatedData.code !== existingSkill[0].code) {
      const duplicateCode = await db
        .select()
        .from(vehicleSkills)
        .where(eq(vehicleSkills.code, validatedData.code))
        .limit(1);

      if (duplicateCode.length > 0) {
        return NextResponse.json(
          { error: "Ya existe una habilidad con este código" },
          { status: 400 },
        );
      }
    }

    const [updatedSkill] = await db
      .update(vehicleSkills)
      .set({
        ...validatedData,
        updatedAt: new Date(),
      })
      .where(eq(vehicleSkills.id, id))
      .returning();

    // Log update
    await logUpdate("vehicle_skill", id, {
      before: existingSkill[0],
      after: updatedSkill,
    });

    return NextResponse.json(updatedSkill);
  } catch (error) {
    console.error("Error updating vehicle skill:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Error updating vehicle skill" },
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

    // Check if skill exists and belongs to tenant
    const existingSkill = await db
      .select()
      .from(vehicleSkills)
      .where(
        and(
          eq(vehicleSkills.id, id),
          eq(vehicleSkills.companyId, tenantCtx.companyId),
        ),
      )
      .limit(1);

    if (existingSkill.length === 0) {
      return NextResponse.json(
        { error: "Habilidad no encontrada" },
        { status: 404 },
      );
    }

    // For now, we'll allow deletion. In the future, we should check if the skill is in use
    // by vehicles or drivers, and if so, only allow deactivation (setting active to false)

    await db.delete(vehicleSkills).where(eq(vehicleSkills.id, id));

    // Log deletion
    await logDelete("vehicle_skill", id, existingSkill[0]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting vehicle skill:", error);
    return NextResponse.json(
      { error: "Error deleting vehicle skill" },
      { status: 500 },
    );
  }
}
