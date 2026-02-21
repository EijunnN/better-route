import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companyTrackingSettings } from "@/db/schema";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContext } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";

/**
 * GET /api/tracking/settings
 * Returns company tracking settings for the current company.
 */
export async function GET(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Contexto de tenant faltante" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    const authResult = await requireRoutePermission(request, EntityType.COMPANY, Action.READ);
    if (authResult instanceof NextResponse) return authResult;

    const settings = await db.query.companyTrackingSettings.findFirst({
      where: eq(companyTrackingSettings.companyId, tenantCtx.companyId),
    });

    if (!settings) {
      // Return defaults if no settings exist yet
      return NextResponse.json({
        data: {
          trackingEnabled: false,
          showMap: true,
          showDriverLocation: true,
          showDriverName: false,
          showDriverPhoto: false,
          showEvidence: true,
          showEta: true,
          showTimeline: true,
          brandColor: "#3B82F6",
          logoUrl: null,
          customMessage: null,
          tokenExpiryHours: 48,
          autoGenerateTokens: false,
        },
      });
    }

    return NextResponse.json({
      data: {
        trackingEnabled: settings.trackingEnabled,
        showMap: settings.showMap,
        showDriverLocation: settings.showDriverLocation,
        showDriverName: settings.showDriverName,
        showDriverPhoto: settings.showDriverPhoto,
        showEvidence: settings.showEvidence,
        showEta: settings.showEta,
        showTimeline: settings.showTimeline,
        brandColor: settings.brandColor,
        logoUrl: settings.logoUrl,
        customMessage: settings.customMessage,
        tokenExpiryHours: settings.tokenExpiryHours,
        autoGenerateTokens: settings.autoGenerateTokens,
      },
    });
  } catch (error) {
    console.error("Error fetching tracking settings:", error);
    return NextResponse.json(
      { error: "Error al obtener configuración de seguimiento" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/tracking/settings
 * Update company tracking settings.
 */
export async function PUT(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Contexto de tenant faltante" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    const authResult = await requireRoutePermission(request, EntityType.COMPANY, Action.UPDATE);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();

    // Only allow known fields to be updated
    const allowedFields = [
      "trackingEnabled",
      "showMap",
      "showDriverLocation",
      "showDriverName",
      "showDriverPhoto",
      "showEvidence",
      "showEta",
      "showTimeline",
      "brandColor",
      "logoUrl",
      "customMessage",
      "tokenExpiryHours",
      "autoGenerateTokens",
    ] as const;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    // Check if settings exist
    const existing = await db.query.companyTrackingSettings.findFirst({
      where: eq(companyTrackingSettings.companyId, tenantCtx.companyId),
    });

    if (existing) {
      await db
        .update(companyTrackingSettings)
        .set(updateData)
        .where(eq(companyTrackingSettings.id, existing.id));
    } else {
      await db.insert(companyTrackingSettings).values({
        companyId: tenantCtx.companyId,
        ...updateData,
      });
    }

    // Return updated settings
    const updated = await db.query.companyTrackingSettings.findFirst({
      where: eq(companyTrackingSettings.companyId, tenantCtx.companyId),
    });

    return NextResponse.json({
      data: {
        trackingEnabled: updated!.trackingEnabled,
        showMap: updated!.showMap,
        showDriverLocation: updated!.showDriverLocation,
        showDriverName: updated!.showDriverName,
        showDriverPhoto: updated!.showDriverPhoto,
        showEvidence: updated!.showEvidence,
        showEta: updated!.showEta,
        showTimeline: updated!.showTimeline,
        brandColor: updated!.brandColor,
        logoUrl: updated!.logoUrl,
        customMessage: updated!.customMessage,
        tokenExpiryHours: updated!.tokenExpiryHours,
        autoGenerateTokens: updated!.autoGenerateTokens,
      },
    });
  } catch (error) {
    console.error("Error updating tracking settings:", error);
    return NextResponse.json(
      { error: "Error al actualizar configuración de seguimiento" },
      { status: 500 },
    );
  }
}
