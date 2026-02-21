import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, trackingTokens, companyTrackingSettings } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContext } from "@/lib/routing/route-helpers";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { EntityType, Action } from "@/lib/auth/authorization";
import { randomBytes } from "crypto";

/**
 * POST /api/tracking/generate
 * Generate tracking tokens for one or more orders.
 * Body: { orderIds: string[] } or { trackingIds: string[] }
 */
export async function POST(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Contexto de tenant faltante" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    const authResult = await requireRoutePermission(request, EntityType.ORDER, Action.UPDATE);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const { orderIds, trackingIds } = body as {
      orderIds?: string[];
      trackingIds?: string[];
    };

    if (!orderIds?.length && !trackingIds?.length) {
      return NextResponse.json(
        { error: "Se requiere orderIds o trackingIds" },
        { status: 400 },
      );
    }

    // Resolve orders
    let resolvedOrders: { id: string; trackingId: string }[];

    if (orderIds?.length) {
      resolvedOrders = await db.query.orders.findMany({
        where: and(
          withTenantFilter(orders, [], tenantCtx.companyId),
          inArray(orders.id, orderIds),
        ),
        columns: { id: true, trackingId: true },
      });
    } else {
      resolvedOrders = await db.query.orders.findMany({
        where: and(
          withTenantFilter(orders, [], tenantCtx.companyId),
          inArray(orders.trackingId, trackingIds!),
        ),
        columns: { id: true, trackingId: true },
      });
    }

    if (resolvedOrders.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron pedidos válidos" },
        { status: 404 },
      );
    }

    // Load company settings for token expiry
    const settings = await db.query.companyTrackingSettings.findFirst({
      where: eq(companyTrackingSettings.companyId, tenantCtx.companyId),
    });

    const expiryHours = settings?.tokenExpiryHours ?? 48;

    // Generate tokens for each order
    const results: { trackingId: string; token: string; url: string }[] = [];

    for (const order of resolvedOrders) {
      // Check if an active token already exists for this order
      const existingToken = await db.query.trackingTokens.findFirst({
        where: and(
          eq(trackingTokens.companyId, tenantCtx.companyId),
          eq(trackingTokens.orderId, order.id),
          eq(trackingTokens.active, true),
        ),
      });

      if (existingToken) {
        // Check if not expired
        if (!existingToken.expiresAt || existingToken.expiresAt > new Date()) {
          results.push({
            trackingId: order.trackingId,
            token: existingToken.token,
            url: `/tracking/${existingToken.token}`,
          });
          continue;
        }
        // Deactivate expired token
        await db
          .update(trackingTokens)
          .set({ active: false, updatedAt: new Date() })
          .where(eq(trackingTokens.id, existingToken.id));
      }

      // Generate a new token
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

      await db.insert(trackingTokens).values({
        companyId: tenantCtx.companyId,
        orderId: order.id,
        trackingId: order.trackingId,
        token,
        active: true,
        expiresAt,
      });

      results.push({
        trackingId: order.trackingId,
        token,
        url: `/tracking/${token}`,
      });
    }

    return NextResponse.json({ data: results });
  } catch (error) {
    console.error("Error generating tracking tokens:", error);
    return NextResponse.json(
      { error: "Error al generar tokens de seguimiento" },
      { status: 500 },
    );
  }
}
