import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { roles, rolePermissions, permissions } from "@/db/schema";
import { requireTenantContext } from "@/lib/infra/tenant";
import { Action, EntityType } from "@/lib/auth/authorization";
import {
  checkPermissionOrError,
  handleError,
  setupAuthContext,
  unauthorizedResponse,
} from "@/lib/routing/route-helpers";

// GET /api/roles/batch/permissions?roleIds=id1,id2,id3
// Returns permissions for multiple roles in a single request
export async function GET(request: NextRequest) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const permError = checkPermissionOrError(
      authResult.user,
      EntityType.ROLE,
      Action.READ,
    );
    if (permError) return permError;

    const tenantCtx = requireTenantContext();
    const roleIdsParam = request.nextUrl.searchParams.get("roleIds");

    if (!roleIdsParam) {
      return NextResponse.json(
        { error: "roleIds query parameter is required" },
        { status: 400 },
      );
    }

    const roleIds = roleIdsParam.split(",").filter(Boolean);
    if (roleIds.length === 0) {
      return NextResponse.json({ data: {} });
    }

    // Verify all roles belong to the company
    const companyRoles = await db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(
          inArray(roles.id, roleIds),
          eq(roles.companyId, tenantCtx.companyId),
        ),
      );
    const validRoleIds = companyRoles.map((r) => r.id);

    if (validRoleIds.length === 0) {
      return NextResponse.json({ data: {} });
    }

    // Single query: all permissions + all role_permissions for these roles
    const [allPermissions, allRolePerms] = await Promise.all([
      db
        .select()
        .from(permissions)
        .where(eq(permissions.active, true))
        .orderBy(permissions.category, permissions.displayOrder),
      db
        .select()
        .from(rolePermissions)
        .where(inArray(rolePermissions.roleId, validRoleIds)),
    ]);

    // Build a map: roleId -> permissionId -> enabled
    const rolePermsMap = new Map<string, Map<string, boolean>>();
    for (const rp of allRolePerms) {
      if (!rolePermsMap.has(rp.roleId)) {
        rolePermsMap.set(rp.roleId, new Map());
      }
      rolePermsMap.get(rp.roleId)!.set(rp.permissionId, rp.enabled);
    }

    // Build grouped permissions per role
    const data: Record<
      string,
      Record<
        string,
        Array<{
          id: string;
          entity: string;
          action: string;
          name: string;
          description: string | null;
          enabled: boolean;
        }>
      >
    > = {};

    for (const roleId of validRoleIds) {
      const permsForRole = rolePermsMap.get(roleId) ?? new Map();
      const grouped: Record<
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
        if (!grouped[perm.category]) {
          grouped[perm.category] = [];
        }
        grouped[perm.category].push({
          id: perm.id,
          entity: perm.entity,
          action: perm.action,
          name: perm.name,
          description: perm.description,
          enabled: permsForRole.get(perm.id) ?? false,
        });
      }

      data[roleId] = grouped;
    }

    return NextResponse.json({ data });
  } catch (error) {
    return handleError(error, "fetching batch role permissions");
  }
}
