import { and, desc, eq, ilike, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { roles, rolePermissions, permissions } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/permissions";
import {
  checkPermissionOrError,
  handleError,
  setupAuthContext,
  unauthorizedResponse,
} from "@/lib/routing/route-helpers";
import { roleSchema, roleQuerySchema } from "@/lib/validations/role";

// GET /api/roles - List all roles for the company
export async function GET(request: NextRequest) {
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

    // Use companyId from setupAuthContext (already resolved from JWT +
    // x-company-id header). AsyncLocalStorage-based requireTenantContext
    // is unreliable in App Router handlers.
    const companyId = authResult.user.companyId;
    if (!companyId) {
      return NextResponse.json(
        { error: "No company context", code: "NO_COMPANY" },
        { status: 400 },
      );
    }
    const { searchParams } = new URL(request.url);
    const query = roleQuerySchema.parse(Object.fromEntries(searchParams));

    const conditions = [eq(roles.companyId, companyId)];

    if (query.active !== undefined) {
      conditions.push(eq(roles.active, query.active));
    }
    if (query.isSystem !== undefined) {
      conditions.push(eq(roles.isSystem, query.isSystem));
    }
    if (query.search) {
      conditions.push(
        or(
          ilike(roles.name, `%${query.search}%`),
          ilike(roles.description, `%${query.search}%`),
        ) ?? eq(roles.active, true),
      );
    }

    const data = await db
      .select()
      .from(roles)
      .where(and(...conditions))
      .orderBy(desc(roles.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    // Get permission counts for each role
    const rolesWithCounts = await Promise.all(
      data.map(async (role) => {
        const permCount = await db
          .select()
          .from(rolePermissions)
          .where(
            and(
              eq(rolePermissions.roleId, role.id),
              eq(rolePermissions.enabled, true),
            ),
          );
        return {
          ...role,
          enabledPermissionsCount: permCount.length,
        };
      }),
    );

    return NextResponse.json({
      data: rolesWithCounts,
      meta: {
        total: data.length,
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (error) {
    return handleError(error, "fetching roles");
  }
}

// POST /api/roles - Create a new role
export async function POST(request: NextRequest) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const permError = await checkPermissionOrError(
      authResult.user,
      EntityType.ROLE,
      Action.CREATE,
    );
    if (permError) return permError;

    const companyId = authResult.user.companyId;
    if (!companyId) {
      return NextResponse.json(
        { error: "No company context", code: "NO_COMPANY" },
        { status: 400 },
      );
    }
    const body = await request.json();
    const validatedData = roleSchema.parse(body);

    // Check if role with same name exists
    const existing = await db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.companyId, companyId),
          eq(roles.name, validatedData.name),
          eq(roles.active, true),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Ya existe un rol con este nombre" },
        { status: 400 },
      );
    }

    // Derive `code` from `name` when the client didn't send one. Keeps custom
    // roles addressable by a stable identifier without forcing the UI to
    // expose it (the onboarding flow sets code explicitly; manual creation
    // didn't, leaving NULLs that broke downstream legacy-role syncs).
    const derivedCode =
      validatedData.code && validatedData.code.trim().length > 0
        ? validatedData.code.trim()
        : validatedData.name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "")
            .slice(0, 50) || `role_${Date.now()}`;

    // Create the role
    const [newRole] = await db
      .insert(roles)
      .values({
        companyId,
        name: validatedData.name,
        description: validatedData.description,
        code: derivedCode,
        isSystem: false,
      })
      .returning();

    // Get all system permissions and create role_permissions entries (all disabled by default)
    const allPermissions = await db
      .select()
      .from(permissions)
      .where(eq(permissions.active, true));

    if (allPermissions.length > 0) {
      await db.insert(rolePermissions).values(
        allPermissions.map((perm) => ({
          roleId: newRole.id,
          permissionId: perm.id,
          enabled: false,
        })),
      );
    }

    return NextResponse.json(newRole, { status: 201 });
  } catch (error) {
    return handleError(error, "creating role");
  }
}
