import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { companyOptimizationProfiles } from "@/db/schema";
import {
  createProfileConfig,
  PROFILE_TEMPLATES,
  validateProfile,
  parseProfile,
} from "@/lib/optimization/capacity-mapper";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";

import { extractTenantContext } from "@/lib/routing/route-helpers";

// Schema for creating/updating profiles
const profileSchema = z.object({
  enableWeight: z.boolean().default(true),
  enableVolume: z.boolean().default(true),
  enableOrderValue: z.boolean().default(false),
  enableUnits: z.boolean().default(false),
  enableOrderType: z.boolean().default(false),
  priorityNew: z.number().min(0).max(100).default(50),
  priorityRescheduled: z.number().min(0).max(100).default(80),
  priorityUrgent: z.number().min(0).max(100).default(100),
});

// GET - Get company optimization profile
export async function GET(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    // Get profile for this company
    const profiles = await db
      .select()
      .from(companyOptimizationProfiles)
      .where(
        and(
          eq(companyOptimizationProfiles.companyId, context.companyId),
          eq(companyOptimizationProfiles.active, true),
        ),
      );

    if (profiles.length === 0) {
      // Return default profile info if none configured
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
            activeDimensions: ["WEIGHT", "VOLUME"],
            priorityMapping: {
              NEW: 50,
              RESCHEDULED: 80,
              URGENT: 100,
            },
          },
          templates: Object.entries(PROFILE_TEMPLATES).map(([key, value]) => ({
            id: key,
            name: key,
            ...value,
          })),
        },
      });
    }

    const profile = profiles[0];
    const parsed = parseProfile(profile);
    const validation = validateProfile(parsed);

    return NextResponse.json({
      data: {
        profile: {
          id: profile.id,
          companyId: profile.companyId,
          enableWeight: profile.enableWeight,
          enableVolume: profile.enableVolume,
          enableOrderValue: profile.enableOrderValue,
          enableUnits: profile.enableUnits,
          enableOrderType: profile.enableOrderType,
          activeDimensions: parsed.activeDimensions,
          priorityMapping: parsed.priorityMapping,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        },
        isDefault: false,
        validation,
        templates: Object.entries(PROFILE_TEMPLATES).map(([key, value]) => ({
          id: key,
          name: key,
          ...value,
        })),
      },
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
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    const body = await request.json();

    // Check if using a template
    if (body.templateId && PROFILE_TEMPLATES[body.templateId as keyof typeof PROFILE_TEMPLATES]) {
      const template = PROFILE_TEMPLATES[body.templateId as keyof typeof PROFILE_TEMPLATES];
      body.enableWeight = template.enableWeight;
      body.enableVolume = template.enableVolume;
      body.enableOrderValue = template.enableOrderValue;
      body.enableUnits = template.enableUnits;
      body.enableOrderType = template.enableOrderType;
    }

    const validatedData = profileSchema.parse(body);

    // Create profile config
    const profileConfig = createProfileConfig({
      enableWeight: validatedData.enableWeight,
      enableVolume: validatedData.enableVolume,
      enableValue: validatedData.enableOrderValue,
      enableUnits: validatedData.enableUnits,
      enableOrderType: validatedData.enableOrderType,
      priorityNew: validatedData.priorityNew,
      priorityRescheduled: validatedData.priorityRescheduled,
      priorityUrgent: validatedData.priorityUrgent,
    });

    // Check if profile already exists
    const existing = await db
      .select()
      .from(companyOptimizationProfiles)
      .where(eq(companyOptimizationProfiles.companyId, context.companyId));

    let result;

    if (existing.length > 0) {
      // Update existing profile
      result = await db
        .update(companyOptimizationProfiles)
        .set({
          ...profileConfig,
          updatedAt: new Date(),
        })
        .where(eq(companyOptimizationProfiles.companyId, context.companyId))
        .returning();
    } else {
      // Create new profile
      result = await db
        .insert(companyOptimizationProfiles)
        .values({
          companyId: context.companyId,
          ...profileConfig,
        })
        .returning();
    }

    const profile = result[0];
    const parsed = parseProfile(profile);

    return NextResponse.json({
      data: {
        profile: {
          id: profile.id,
          companyId: profile.companyId,
          enableWeight: profile.enableWeight,
          enableVolume: profile.enableVolume,
          enableOrderValue: profile.enableOrderValue,
          enableUnits: profile.enableUnits,
          enableOrderType: profile.enableOrderType,
          activeDimensions: parsed.activeDimensions,
          priorityMapping: parsed.priorityMapping,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        },
        message: existing.length > 0 ? "Perfil actualizado" : "Perfil creado",
      },
    }, { status: existing.length > 0 ? 200 : 201 });
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
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    // Soft delete by setting active to false
    await db
      .update(companyOptimizationProfiles)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(companyOptimizationProfiles.companyId, context.companyId));

    return NextResponse.json({
      data: { message: "Perfil restablecido a valores predeterminados" },
    });
  } catch (error) {
    console.error("Error deleting company profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
