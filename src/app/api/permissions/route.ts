import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { permissions } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import {
  checkPermissionOrError,
  handleError,
  setupAuthContext,
  unauthorizedResponse,
} from "@/lib/routing/route-helpers";
import { permissionQuerySchema } from "@/lib/validations/permission";

// GET /api/permissions - List all available permissions (system catalog)
export async function GET(request: NextRequest) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const permError = await checkPermissionOrError(
      authResult.user,
      EntityType.PERMISSION,
      Action.READ,
    );
    if (permError) return permError;

    const { searchParams } = new URL(request.url);
    const query = permissionQuerySchema.parse(Object.fromEntries(searchParams));

    let queryBuilder = db
      .select()
      .from(permissions)
      .where(eq(permissions.active, true))
      .orderBy(permissions.category, permissions.displayOrder);

    const allPermissions = await queryBuilder;

    // Filter by category if provided
    let filteredPermissions = allPermissions;
    if (query.category) {
      filteredPermissions = allPermissions.filter(
        (p) => p.category === query.category,
      );
    }
    if (query.entity) {
      filteredPermissions = filteredPermissions.filter(
        (p) => p.entity === query.entity,
      );
    }

    // Group by category for easier UI consumption
    const groupedPermissions: Record<
      string,
      Array<{
        id: string;
        entity: string;
        action: string;
        name: string;
        description: string | null;
        displayOrder: number;
      }>
    > = {};

    for (const perm of filteredPermissions) {
      if (!groupedPermissions[perm.category]) {
        groupedPermissions[perm.category] = [];
      }
      groupedPermissions[perm.category].push({
        id: perm.id,
        entity: perm.entity,
        action: perm.action,
        name: perm.name,
        description: perm.description,
        displayOrder: perm.displayOrder,
      });
    }

    return NextResponse.json({
      data: filteredPermissions,
      grouped: groupedPermissions,
      categories: Object.keys(groupedPermissions),
    });
  } catch (error) {
    return handleError(error, "fetching permissions");
  }
}
