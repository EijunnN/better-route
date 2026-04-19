import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { roles, rolePermissions, userRoles } from "@/db/schema";
import { requireTenantContext } from "@/lib/infra/tenant";
import { Action, EntityType } from "@/lib/auth/authorization";
import {
  checkPermissionOrError,
  handleError,
  notFoundResponse,
  setupAuthContext,
  unauthorizedResponse,
} from "@/lib/routing/route-helpers";
import { updateRoleSchema } from "@/lib/validations/role";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/roles/[id] - Get a specific role with its permissions
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const permError = await checkPermissionOrError(
      authResult.user,
      EntityType.ROLE,
      Action.READ,
    );
    if (permError) return permError;

    const tenantCtx = requireTenantContext();
    const { id } = await params;

    const [role] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.companyId, tenantCtx.companyId)))
      .limit(1);

    if (!role) {
      return notFoundResponse("Rol");
    }

    // Get permissions with their enabled status
    const permsWithStatus = await db
      .select({
        permission: {
          id: rolePermissions.permissionId,
          enabled: rolePermissions.enabled,
        },
      })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, id));

    // Count users with this role
    const usersWithRole = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.roleId, id), eq(userRoles.active, true)));

    return NextResponse.json({
      ...role,
      permissions: permsWithStatus.map((p) => p.permission),
      usersCount: usersWithRole.length,
    });
  } catch (error) {
    return handleError(error, "fetching role");
  }
}

// PATCH /api/roles/[id] - Update a role
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const permError = await checkPermissionOrError(
      authResult.user,
      EntityType.ROLE,
      Action.UPDATE,
    );
    if (permError) return permError;

    const tenantCtx = requireTenantContext();
    const { id } = await params;
    const body = await request.json();
    const validatedData = updateRoleSchema.parse(body);

    // Check role exists and belongs to company
    const [existingRole] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.companyId, tenantCtx.companyId)))
      .limit(1);

    if (!existingRole) {
      return notFoundResponse("Rol");
    }

    // System roles cannot be edited
    if (existingRole.isSystem) {
      return NextResponse.json(
        { error: "Los roles del sistema no pueden ser modificados" },
        { status: 403 },
      );
    }

    // Check name uniqueness if changing name
    if (validatedData.name && validatedData.name !== existingRole.name) {
      const [duplicate] = await db
        .select()
        .from(roles)
        .where(
          and(
            eq(roles.companyId, tenantCtx.companyId),
            eq(roles.name, validatedData.name),
            eq(roles.active, true),
          ),
        )
        .limit(1);

      if (duplicate) {
        return NextResponse.json(
          { error: "Ya existe un rol con este nombre" },
          { status: 400 },
        );
      }
    }

    const [updatedRole] = await db
      .update(roles)
      .set({
        ...validatedData,
        updatedAt: new Date(),
      })
      .where(eq(roles.id, id))
      .returning();

    return NextResponse.json(updatedRole);
  } catch (error) {
    return handleError(error, "updating role");
  }
}

// DELETE /api/roles/[id] - Delete (deactivate) a role
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const permError = await checkPermissionOrError(
      authResult.user,
      EntityType.ROLE,
      Action.DELETE,
    );
    if (permError) return permError;

    const tenantCtx = requireTenantContext();
    const { id } = await params;

    const [existingRole] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.companyId, tenantCtx.companyId)))
      .limit(1);

    if (!existingRole) {
      return notFoundResponse("Rol");
    }

    // System roles cannot be deleted
    if (existingRole.isSystem) {
      return NextResponse.json(
        { error: "Los roles del sistema no pueden ser eliminados" },
        { status: 403 },
      );
    }

    // Check if any users have this role
    const usersWithRole = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.roleId, id), eq(userRoles.active, true)));

    if (usersWithRole.length > 0) {
      return NextResponse.json(
        {
          error: `No se puede eliminar el rol porque está asignado a ${usersWithRole.length} usuario(s)`,
        },
        { status: 400 },
      );
    }

    // Soft delete
    const [deletedRole] = await db
      .update(roles)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();

    return NextResponse.json(deletedRole);
  } catch (error) {
    return handleError(error, "deleting role");
  }
}
