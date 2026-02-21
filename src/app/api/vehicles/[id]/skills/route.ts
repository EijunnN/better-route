import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vehicleSkillAssignments, vehicleSkills, vehicles } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { EntityType, Action } from "@/lib/auth/authorization";
import { z } from "zod";
import { extractTenantContext } from "@/lib/routing/route-helpers";

// GET - Get skills assigned to a vehicle
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.VEHICLE_SKILL, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 }
      );
    }

    setTenantContext(tenantCtx);
    const { id: vehicleId } = await params;

    // Verify vehicle exists and belongs to company
    const vehicle = await db
      .select()
      .from(vehicles)
      .where(
        withTenantFilter(vehicles, [eq(vehicles.id, vehicleId)])
      )
      .limit(1);

    if (vehicle.length === 0) {
      return NextResponse.json(
        { error: "Vehicle not found" },
        { status: 404 }
      );
    }

    // Get assigned skills with skill details
    const assignments = await db
      .select({
        id: vehicleSkillAssignments.id,
        skillId: vehicleSkillAssignments.skillId,
        active: vehicleSkillAssignments.active,
        createdAt: vehicleSkillAssignments.createdAt,
        skill: {
          id: vehicleSkills.id,
          code: vehicleSkills.code,
          name: vehicleSkills.name,
          category: vehicleSkills.category,
          description: vehicleSkills.description,
        },
      })
      .from(vehicleSkillAssignments)
      .innerJoin(
        vehicleSkills,
        eq(vehicleSkillAssignments.skillId, vehicleSkills.id)
      )
      .where(
        and(
          eq(vehicleSkillAssignments.vehicleId, vehicleId),
          eq(vehicleSkillAssignments.companyId, tenantCtx.companyId),
          eq(vehicleSkillAssignments.active, true)
        )
      );

    return NextResponse.json({
      data: assignments,
      skillIds: assignments.map((a) => a.skillId),
    });
  } catch (error) {
    console.error("Error fetching vehicle skills:", error);
    return NextResponse.json(
      { error: "Error fetching vehicle skills" },
      { status: 500 }
    );
  }
}

// PUT - Replace all skill assignments for a vehicle
const updateSkillsSchema = z.object({
  skillIds: z.array(z.string().uuid()),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRoutePermission(request, EntityType.VEHICLE_SKILL, Action.UPDATE);
    if (authResult instanceof NextResponse) return authResult;

    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 }
      );
    }

    setTenantContext(tenantCtx);
    const { id: vehicleId } = await params;

    const body = await request.json();
    const { skillIds } = updateSkillsSchema.parse(body);

    // Verify vehicle exists and belongs to company
    const vehicle = await db
      .select()
      .from(vehicles)
      .where(
        withTenantFilter(vehicles, [eq(vehicles.id, vehicleId)])
      )
      .limit(1);

    if (vehicle.length === 0) {
      return NextResponse.json(
        { error: "Vehicle not found" },
        { status: 404 }
      );
    }

    // Verify all skills exist and belong to company
    if (skillIds.length > 0) {
      const existingSkills = await db
        .select({ id: vehicleSkills.id })
        .from(vehicleSkills)
        .where(
          and(
            inArray(vehicleSkills.id, skillIds),
            eq(vehicleSkills.companyId, tenantCtx.companyId),
            eq(vehicleSkills.active, true)
          )
        );

      if (existingSkills.length !== skillIds.length) {
        return NextResponse.json(
          { error: "One or more skills not found or inactive" },
          { status: 400 }
        );
      }
    }

    // Deactivate all existing assignments
    await db
      .update(vehicleSkillAssignments)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(vehicleSkillAssignments.vehicleId, vehicleId),
          eq(vehicleSkillAssignments.companyId, tenantCtx.companyId)
        )
      );

    // Create new assignments
    if (skillIds.length > 0) {
      await db.insert(vehicleSkillAssignments).values(
        skillIds.map((skillId) => ({
          companyId: tenantCtx.companyId,
          vehicleId,
          skillId,
          active: true,
          updatedAt: new Date(),
        }))
      );
    }

    // Return updated assignments
    const assignments = await db
      .select({
        id: vehicleSkillAssignments.id,
        skillId: vehicleSkillAssignments.skillId,
        skill: {
          id: vehicleSkills.id,
          code: vehicleSkills.code,
          name: vehicleSkills.name,
          category: vehicleSkills.category,
        },
      })
      .from(vehicleSkillAssignments)
      .innerJoin(
        vehicleSkills,
        eq(vehicleSkillAssignments.skillId, vehicleSkills.id)
      )
      .where(
        and(
          eq(vehicleSkillAssignments.vehicleId, vehicleId),
          eq(vehicleSkillAssignments.companyId, tenantCtx.companyId),
          eq(vehicleSkillAssignments.active, true)
        )
      );

    return NextResponse.json({
      data: assignments,
      skillIds: assignments.map((a) => a.skillId),
    });
  } catch (error) {
    console.error("Error updating vehicle skills:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Error updating vehicle skills" },
      { status: 500 }
    );
  }
}
