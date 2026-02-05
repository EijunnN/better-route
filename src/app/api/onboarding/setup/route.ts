import { NextRequest, NextResponse } from "next/server";
import { count } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  permissions,
  rolePermissions,
  roles,
} from "@/db/schema";
import { getAuthenticatedUser } from "@/lib/auth/auth-api";
import { ROLE_PERMISSIONS } from "@/lib/auth/authorization";
import { onboardingSetupSchema } from "@/lib/validations/onboarding";

/**
 * Maps plural entity names (from DB) to singular (used in code)
 */
const ENTITY_NORMALIZATION: Record<string, string> = {
  orders: "order",
  vehicles: "vehicle",
  drivers: "driver",
  fleets: "fleet",
  routes: "route",
  plans: "plan",
  alerts: "alert",
  users: "user",
  roles: "role",
  companies: "company",
  zones: "route",
  vehicle_skills: "vehicle_skill",
  driver_skills: "driver_skill",
  user_skills: "driver_skill",
  optimization_presets: "optimization_preset",
  time_window_presets: "time_window_preset",
  metrics: "metrics",
  monitoring: "vehicle",
  planificacion: "plan",
};

/**
 * Maps action names from DB format to code format
 */
const ACTION_NORMALIZATION: Record<string, string> = {
  VIEW: "read",
  CREATE: "create",
  EDIT: "update",
  DELETE: "delete",
  IMPORT: "import",
  EXPORT: "export",
  ASSIGN: "assign",
  MANAGE: "update",
  EXECUTE: "execute",
  CONFIRM: "confirm",
  CANCEL: "cancel",
  ACKNOWLEDGE: "acknowledge",
  DISMISS: "dismiss",
};

function normalizePermission(entity: string, action: string): string {
  const normalizedEntity =
    ENTITY_NORMALIZATION[entity.toLowerCase()] || entity.toLowerCase();
  const normalizedAction =
    ACTION_NORMALIZATION[action.toUpperCase()] || action.toLowerCase();
  return `${normalizedEntity}:${normalizedAction}`;
}

/**
 * Check if a normalized permission matches any of the role's permission patterns
 */
function isPermissionEnabledForRole(
  normalizedPerm: string,
  rolePerms: string[],
): boolean {
  // Wildcard = all permissions enabled
  if (rolePerms.includes("*")) return true;

  // Direct match
  if (rolePerms.includes(normalizedPerm)) return true;

  // Check entity:* wildcard patterns (e.g. "fleet:*")
  const [entity] = normalizedPerm.split(":");
  if (rolePerms.includes(`${entity}:*`)) return true;

  return false;
}

const SYSTEM_ROLES = [
  {
    code: "ADMIN_SISTEMA",
    name: "Administrador del Sistema",
    description: "Acceso total a todas las funcionalidades del sistema",
  },
  {
    code: "PLANIFICADOR",
    name: "Planificador",
    description: "Gestión de pedidos, optimización y planificación de rutas",
  },
  {
    code: "MONITOR",
    name: "Monitor",
    description: "Monitoreo en tiempo real de rutas y conductores",
  },
  {
    code: "ADMIN_FLOTA",
    name: "Administrador de Flota",
    description: "Gestión de flotas, vehículos y conductores",
  },
  {
    code: "CONDUCTOR",
    name: "Conductor",
    description: "Acceso a rutas asignadas y actualización de paradas",
  },
];

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    // Only ADMIN_SISTEMA can run onboarding
    if (user.role !== "ADMIN_SISTEMA") {
      return NextResponse.json(
        { error: "Solo el administrador del sistema puede ejecutar el onboarding" },
        { status: 403 },
      );
    }

    // Check no companies exist (prevent double onboarding)
    const [companyCount] = await db
      .select({ count: count() })
      .from(companies);

    if (companyCount.count > 0) {
      return NextResponse.json(
        { error: "Ya existe al menos una empresa. El onboarding ya fue completado." },
        { status: 409 },
      );
    }

    // Parse and validate input
    const body = await request.json();
    const parsed = onboardingSetupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const input = parsed.data;

    // Get all system permissions from DB
    const allPermissions = await db.select().from(permissions);

    // Execute everything in a single transaction
    const result = await db.transaction(async (tx) => {
      // 1. Create company
      const [newCompany] = await tx
        .insert(companies)
        .values({
          legalName: input.legalName,
          commercialName: input.commercialName,
          email: input.email,
          country: input.country,
          timezone: input.timezone,
          currency: input.currency,
        })
        .returning();

      // 2. Create system roles + rolePermissions
      const createdRoles = [];
      let totalPermissions = 0;

      for (const roleDef of SYSTEM_ROLES) {
        const [newRole] = await tx
          .insert(roles)
          .values({
            companyId: newCompany.id,
            name: roleDef.name,
            description: roleDef.description,
            isSystem: true,
            code: roleDef.code,
          })
          .returning();

        // Get the permission patterns for this role
        const rolePermPatterns = ROLE_PERMISSIONS[roleDef.code] || [];

        // Create rolePermissions for each system permission
        const rpValues = allPermissions.map((perm) => {
          const normalized = normalizePermission(perm.entity, perm.action);
          const enabled = isPermissionEnabledForRole(normalized, rolePermPatterns as string[]);
          return {
            roleId: newRole.id,
            permissionId: perm.id,
            enabled,
          };
        });

        if (rpValues.length > 0) {
          await tx.insert(rolePermissions).values(rpValues);
          totalPermissions += rpValues.filter((rp) => rp.enabled).length;
        }

        createdRoles.push({
          id: newRole.id,
          code: newRole.code,
          name: newRole.name,
          permissionsEnabled: rpValues.filter((rp) => rp.enabled).length,
          permissionsTotal: rpValues.length,
        });
      }

      return {
        company: newCompany,
        roles: createdRoles,
        totalPermissions,
      };
    });

    return NextResponse.json({
      company: result.company,
      roles: result.roles,
      totalPermissions: result.totalPermissions,
    });
  } catch (error) {
    console.error("Onboarding setup error:", error);

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
