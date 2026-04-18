import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { companyOptimizationProfiles } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";
import { safeParseJson } from "@/lib/utils/safe-json";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

// ── Local helpers ──────────────────────────────────────────────────────────
// These used to live in capacity-mapper.ts; only this admin endpoint needs
// them, so they live here and avoid a global module.

const DEFAULT_DIMENSIONS = ["WEIGHT", "VOLUME"] as const;
const DEFAULT_PRIORITY = { NEW: 50, RESCHEDULED: 80, URGENT: 100 };

type ProfileConfig = {
  enableOrderValue: boolean;
  enableOrderType: boolean;
  enableWeight: boolean;
  enableVolume: boolean;
  enableUnits: boolean;
  activeDimensions: string[];
  priorityMapping: Record<string, number>;
};

function buildProfileConfig(input: {
  enableWeight: boolean;
  enableVolume: boolean;
  enableOrderValue: boolean;
  enableUnits: boolean;
  enableOrderType: boolean;
  priorityNew: number;
  priorityRescheduled: number;
  priorityUrgent: number;
}): ProfileConfig {
  const activeDimensions: string[] = [];
  if (input.enableWeight) activeDimensions.push("WEIGHT");
  if (input.enableVolume) activeDimensions.push("VOLUME");
  if (input.enableOrderValue) activeDimensions.push("VALUE");
  if (input.enableUnits) activeDimensions.push("UNITS");

  return {
    enableOrderValue: input.enableOrderValue,
    enableOrderType: input.enableOrderType,
    enableWeight: input.enableWeight,
    enableVolume: input.enableVolume,
    enableUnits: input.enableUnits,
    activeDimensions,
    priorityMapping: {
      NEW: input.priorityNew,
      RESCHEDULED: input.priorityRescheduled,
      URGENT: input.priorityUrgent,
    },
  };
}

/** Checks enabled toggles match activeDimensions and priorities are sane. */
function validateProfileConfig(cfg: ProfileConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (cfg.activeDimensions.length === 0) {
    errors.push("Al menos una dimensión de capacidad debe estar activa");
  }
  const expect = (flag: boolean, dim: string, label: string) => {
    if (flag && !cfg.activeDimensions.includes(dim)) {
      errors.push(`${label} está habilitado pero no está en las dimensiones activas`);
    }
  };
  expect(cfg.enableWeight, "WEIGHT", "El peso");
  expect(cfg.enableVolume, "VOLUME", "El volumen");
  expect(cfg.enableOrderValue, "VALUE", "El valorizado");
  expect(cfg.enableUnits, "UNITS", "Las unidades");
  for (const [type, p] of Object.entries(cfg.priorityMapping)) {
    if (p < 0 || p > 100) errors.push(`Prioridad para ${type} debe estar entre 0 y 100`);
  }
  return { valid: errors.length === 0, errors };
}

/** Normalize a DB row into the UI-facing object shape. */
function serializeProfile(row: typeof companyOptimizationProfiles.$inferSelect) {
  return {
    id: row.id,
    companyId: row.companyId,
    enableWeight: row.enableWeight,
    enableVolume: row.enableVolume,
    enableOrderValue: row.enableOrderValue,
    enableUnits: row.enableUnits,
    enableOrderType: row.enableOrderType,
    activeDimensions: (() => {
      try {
        const parsed = safeParseJson<unknown>(row.activeDimensions);
        return Array.isArray(parsed) ? (parsed as string[]) : [...DEFAULT_DIMENSIONS];
      } catch {
        return [...DEFAULT_DIMENSIONS];
      }
    })(),
    priorityMapping: (() => {
      try {
        return (
          safeParseJson<Record<string, number>>(row.priorityMapping) ?? DEFAULT_PRIORITY
        );
      } catch {
        return DEFAULT_PRIORITY;
      }
    })(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const PROFILE_TEMPLATES = {
  LOGISTICS: buildProfileConfig({
    enableWeight: true,
    enableVolume: true,
    enableOrderValue: false,
    enableUnits: false,
    enableOrderType: false,
    priorityNew: 50,
    priorityRescheduled: 80,
    priorityUrgent: 100,
  }),
  HIGH_VALUE: buildProfileConfig({
    enableWeight: false,
    enableVolume: false,
    enableOrderValue: true,
    enableUnits: false,
    enableOrderType: true,
    priorityNew: 50,
    priorityRescheduled: 80,
    priorityUrgent: 100,
  }),
  SIMPLE: buildProfileConfig({
    enableWeight: false,
    enableVolume: false,
    enableOrderValue: false,
    enableUnits: true,
    enableOrderType: false,
    priorityNew: 50,
    priorityRescheduled: 80,
    priorityUrgent: 100,
  }),
  FULL: buildProfileConfig({
    enableWeight: true,
    enableVolume: true,
    enableOrderValue: true,
    enableUnits: true,
    enableOrderType: true,
    priorityNew: 50,
    priorityRescheduled: 80,
    priorityUrgent: 100,
  }),
} as const;

const profileInputSchema = z.object({
  enableWeight: z.boolean().default(true),
  enableVolume: z.boolean().default(true),
  enableOrderValue: z.boolean().default(false),
  enableUnits: z.boolean().default(false),
  enableOrderType: z.boolean().default(false),
  priorityNew: z.number().min(0).max(100).default(50),
  priorityRescheduled: z.number().min(0).max(100).default(80),
  priorityUrgent: z.number().min(0).max(100).default(100),
});

// ── Route handlers ─────────────────────────────────────────────────────────

// GET - Get company optimization profile
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.COMPANY,
      Action.READ,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    const profiles = await db
      .select()
      .from(companyOptimizationProfiles)
      .where(
        and(
          eq(companyOptimizationProfiles.companyId, context.companyId),
          eq(companyOptimizationProfiles.active, true),
        ),
      );

    const templates = Object.entries(PROFILE_TEMPLATES).map(([key, value]) => ({
      id: key,
      name: key,
      ...value,
    }));

    if (profiles.length === 0) {
      return NextResponse.json({
        data: {
          profile: null,
          isDefault: true,
          defaults: {
            enableWeight: true,
            enableVolume: true,
            enableOrderValue: false,
            enableUnits: false,
            enableOrderType: false,
            activeDimensions: [...DEFAULT_DIMENSIONS],
            priorityMapping: DEFAULT_PRIORITY,
          },
          templates,
        },
      });
    }

    const profile = serializeProfile(profiles[0]);
    const validation = validateProfileConfig({
      enableWeight: profile.enableWeight,
      enableVolume: profile.enableVolume,
      enableOrderValue: profile.enableOrderValue,
      enableUnits: profile.enableUnits,
      enableOrderType: profile.enableOrderType,
      activeDimensions: profile.activeDimensions,
      priorityMapping: profile.priorityMapping,
    });

    return NextResponse.json({
      data: { profile, isDefault: false, validation, templates },
    });
  } catch (error) {
    console.error("Error fetching company profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST - Create or update company optimization profile
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.COMPANY,
      Action.UPDATE,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    const body = await request.json();

    // Apply a template if the client referenced one.
    if (body.templateId && PROFILE_TEMPLATES[body.templateId as keyof typeof PROFILE_TEMPLATES]) {
      const template = PROFILE_TEMPLATES[body.templateId as keyof typeof PROFILE_TEMPLATES];
      body.enableWeight = template.enableWeight;
      body.enableVolume = template.enableVolume;
      body.enableOrderValue = template.enableOrderValue;
      body.enableUnits = template.enableUnits;
      body.enableOrderType = template.enableOrderType;
    }

    const validatedData = profileInputSchema.parse(body);
    const profileConfig = buildProfileConfig(validatedData);

    const profileValidation = validateProfileConfig(profileConfig);
    if (!profileValidation.valid) {
      return NextResponse.json(
        {
          error: "Configuración de perfil inválida",
          details: profileValidation.errors,
        },
        { status: 400 },
      );
    }

    const existing = await db
      .select()
      .from(companyOptimizationProfiles)
      .where(eq(companyOptimizationProfiles.companyId, context.companyId));

    const result = existing.length > 0
      ? await db
          .update(companyOptimizationProfiles)
          .set({ ...profileConfig, updatedAt: new Date() })
          .where(
            eq(companyOptimizationProfiles.companyId, context.companyId),
          )
          .returning()
      : await db
          .insert(companyOptimizationProfiles)
          .values({ companyId: context.companyId, ...profileConfig })
          .returning();

    return NextResponse.json(
      {
        data: {
          profile: serializeProfile(result[0]),
          message: existing.length > 0 ? "Perfil actualizado" : "Perfil creado",
        },
      },
      { status: existing.length > 0 ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.issues },
        { status: 400 },
      );
    }
    console.error("Error saving company profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// DELETE - Reset profile to defaults (delete custom profile)
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.COMPANY,
      Action.UPDATE,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    await db
      .update(companyOptimizationProfiles)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(companyOptimizationProfiles.companyId, context.companyId));

    return NextResponse.json({
      data: { message: "Perfil restablecido a valores predeterminados" },
    });
  } catch (error) {
    console.error("Error resetting company profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
