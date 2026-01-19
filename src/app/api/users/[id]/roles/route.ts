import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, roles, userRoles } from "@/db/schema";
import { requireTenantContext } from "@/lib/tenant";
import { Action, EntityType } from "@/lib/authorization";
import {
  checkPermissionOrError,
  handleError,
  notFoundResponse,
  setupAuthContext,
  unauthorizedResponse,
} from "@/lib/route-helpers";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/users/[id]/roles - Get roles assigned to a user
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const permError = checkPermissionOrError(
      authResult.user,
      EntityType.USER,
      Action.READ,
    );
    if (permError) return permError;

    const tenantCtx = requireTenantContext();
    const { id } = await params;

    // Verify user exists and belongs to company
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.companyId, tenantCtx.companyId)))
      .limit(1);

    if (!user) {
      return notFoundResponse("Usuario");
    }

    // Get user's roles
    const userRolesData = await db
      .select({
        id: userRoles.id,
        roleId: userRoles.roleId,
        isPrimary: userRoles.isPrimary,
        active: userRoles.active,
        roleName: roles.name,
        roleCode: roles.code,
        roleIsSystem: roles.isSystem,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(userRoles.userId, id), eq(userRoles.active, true)));

    return NextResponse.json({
      userId: id,
      userName: user.name,
      legacyRole: user.role, // The old role field
      roles: userRolesData,
    });
  } catch (error) {
    return handleError(error, "fetching user roles");
  }
}

// POST /api/users/[id]/roles - Assign a role to a user
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const permError = checkPermissionOrError(
      authResult.user,
      EntityType.USER,
      Action.UPDATE,
    );
    if (permError) return permError;

    const tenantCtx = requireTenantContext();
    const { id } = await params;
    const body = await request.json();
    const { roleId, isPrimary = false } = body as {
      roleId: string;
      isPrimary?: boolean;
    };

    if (!roleId) {
      return NextResponse.json(
        { error: "roleId es requerido" },
        { status: 400 },
      );
    }

    // Verify user exists and belongs to company
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.companyId, tenantCtx.companyId)))
      .limit(1);

    if (!user) {
      return notFoundResponse("Usuario");
    }

    // Verify role exists and belongs to company
    const [role] = await db
      .select()
      .from(roles)
      .where(
        and(eq(roles.id, roleId), eq(roles.companyId, tenantCtx.companyId)),
      )
      .limit(1);

    if (!role) {
      return notFoundResponse("Rol");
    }

    // Check if user already has this role
    const [existing] = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, id), eq(userRoles.roleId, roleId)))
      .limit(1);

    if (existing) {
      // Reactivate if inactive
      if (!existing.active) {
        await db
          .update(userRoles)
          .set({ active: true, isPrimary, updatedAt: new Date() })
          .where(eq(userRoles.id, existing.id));
      } else {
        return NextResponse.json(
          { error: "El usuario ya tiene este rol asignado" },
          { status: 400 },
        );
      }
    } else {
      // If setting as primary, unset other primary roles
      if (isPrimary) {
        await db
          .update(userRoles)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(and(eq(userRoles.userId, id), eq(userRoles.isPrimary, true)));
      }

      // Assign new role
      await db.insert(userRoles).values({
        userId: id,
        roleId,
        isPrimary,
        active: true,
      });
    }

    // Update legacy role field if this is primary
    if (isPrimary && role.code) {
      await db
        .update(users)
        .set({
          role: role.code as keyof typeof import("@/db/schema").USER_ROLES,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));
    }

    return NextResponse.json({
      message: "Rol asignado correctamente",
      roleId,
      roleName: role.name,
    });
  } catch (error) {
    return handleError(error, "assigning role to user");
  }
}

// DELETE /api/users/[id]/roles - Remove a role from a user
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const permError = checkPermissionOrError(
      authResult.user,
      EntityType.USER,
      Action.UPDATE,
    );
    if (permError) return permError;

    const tenantCtx = requireTenantContext();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const roleId = searchParams.get("roleId");

    if (!roleId) {
      return NextResponse.json(
        { error: "roleId es requerido como query param" },
        { status: 400 },
      );
    }

    // Verify user exists and belongs to company
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.companyId, tenantCtx.companyId)))
      .limit(1);

    if (!user) {
      return notFoundResponse("Usuario");
    }

    // Remove role (soft delete)
    await db
      .update(userRoles)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(userRoles.userId, id), eq(userRoles.roleId, roleId)));

    return NextResponse.json({
      message: "Rol removido correctamente",
    });
  } catch (error) {
    return handleError(error, "removing role from user");
  }
}
