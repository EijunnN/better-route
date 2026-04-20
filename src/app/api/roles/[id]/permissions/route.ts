import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { roles, rolePermissions, permissions } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/permissions";
import {
  checkPermissionOrError,
  handleError,
  notFoundResponse,
  setupAuthContext,
  unauthorizedResponse,
} from "@/lib/routing/route-helpers";
import { rolePermissionsSchema } from "@/lib/validations/role";
import { clearUserPermissionCacheByRole } from "@/lib/auth/authorization";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/roles/[id]/permissions - Get all permissions for a role with their status
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

    const companyId = authResult.user.companyId;
    if (!companyId) {
      return NextResponse.json(
        { error: "No company context", code: "NO_COMPANY" },
        { status: 400 },
      );
    }
    const { id } = await params;

    // Verify role exists and belongs to company
    const [role] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.companyId, companyId)))
      .limit(1);

    if (!role) {
      return notFoundResponse("Rol");
    }

    // Get all permissions with their enabled status for this role
    const allPermissions = await db
      .select()
      .from(permissions)
      .where(eq(permissions.active, true))
      .orderBy(permissions.category, permissions.displayOrder);

    const rolePerms = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, id));

    const rolePermsMap = new Map(
      rolePerms.map((rp) => [rp.permissionId, rp.enabled]),
    );

    // Group permissions by category
    const groupedPermissions: Record<
      string,
      Array<{
        id: string;
        entity: string;
        action: string;
        name: string;
        description: string | null;
        enabled: boolean;
      }>
    > = {};

    for (const perm of allPermissions) {
      if (!groupedPermissions[perm.category]) {
        groupedPermissions[perm.category] = [];
      }
      groupedPermissions[perm.category].push({
        id: perm.id,
        entity: perm.entity,
        action: perm.action,
        name: perm.name,
        description: perm.description,
        enabled: rolePermsMap.get(perm.id) ?? false,
      });
    }

    return NextResponse.json({
      roleId: id,
      roleName: role.name,
      isSystem: role.isSystem,
      permissions: groupedPermissions,
    });
  } catch (error) {
    return handleError(error, "fetching role permissions");
  }
}

// PUT /api/roles/[id]/permissions - Update permissions for a role (bulk switch update)
export async function PUT(request: NextRequest, { params }: RouteParams) {
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

    const companyId = authResult.user.companyId;
    if (!companyId) {
      return NextResponse.json(
        { error: "No company context", code: "NO_COMPANY" },
        { status: 400 },
      );
    }
    const { id } = await params;
    const body = await request.json();
    const validatedData = rolePermissionsSchema.parse(body);

    // Verify role exists and belongs to company
    const [role] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.companyId, companyId)))
      .limit(1);

    if (!role) {
      return notFoundResponse("Rol");
    }

    // System roles cannot have permissions modified
    if (role.isSystem) {
      return NextResponse.json(
        {
          error: "Los permisos de roles del sistema no pueden ser modificados",
        },
        { status: 403 },
      );
    }

    // Update each permission
    for (const permUpdate of validatedData.permissions) {
      // Check if role_permission entry exists
      const [existing] = await db
        .select()
        .from(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, id),
            eq(rolePermissions.permissionId, permUpdate.permissionId),
          ),
        )
        .limit(1);

      if (existing) {
        // Update existing
        await db
          .update(rolePermissions)
          .set({
            enabled: permUpdate.enabled,
            updatedAt: new Date(),
          })
          .where(eq(rolePermissions.id, existing.id));
      } else {
        // Create new
        await db.insert(rolePermissions).values({
          roleId: id,
          permissionId: permUpdate.permissionId,
          enabled: permUpdate.enabled,
        });
      }
    }

    // Return updated permissions
    const updatedPerms = await db
      .select({
        permissionId: rolePermissions.permissionId,
        enabled: rolePermissions.enabled,
      })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, id));

    // Invalidate the permission cache for every user that carries this role
    // so the change is visible immediately instead of after the TTL.
    await clearUserPermissionCacheByRole(id);

    return NextResponse.json({
      roleId: id,
      permissions: updatedPerms,
      message: "Permisos actualizados correctamente",
    });
  } catch (error) {
    return handleError(error, "updating role permissions");
  }
}

// PATCH /api/roles/[id]/permissions - Toggle a single permission
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

    const companyId = authResult.user.companyId;
    if (!companyId) {
      return NextResponse.json(
        { error: "No company context", code: "NO_COMPANY" },
        { status: 400 },
      );
    }
    const { id } = await params;
    const body = await request.json();

    const { permissionId, enabled } = body as {
      permissionId: string;
      enabled: boolean;
    };

    if (!permissionId || typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "permissionId y enabled son requeridos" },
        { status: 400 },
      );
    }

    // Verify role exists and belongs to company
    const [role] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.companyId, companyId)))
      .limit(1);

    if (!role) {
      return notFoundResponse("Rol");
    }

    if (role.isSystem) {
      return NextResponse.json(
        {
          error: "Los permisos de roles del sistema no pueden ser modificados",
        },
        { status: 403 },
      );
    }

    // Update or create the permission entry
    const [existing] = await db
      .select()
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, id),
          eq(rolePermissions.permissionId, permissionId),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(rolePermissions)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(rolePermissions.id, existing.id));
    } else {
      await db.insert(rolePermissions).values({
        roleId: id,
        permissionId,
        enabled,
      });
    }

    return NextResponse.json({
      permissionId,
      enabled,
      message: enabled ? "Permiso activado" : "Permiso desactivado",
    });
  } catch (error) {
    return handleError(error, "toggling permission");
  }
}
