import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companyTrackingSettings, orders, trackingTokens } from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";

/**
 * POST /api/tracking/generate
 * Generate tracking tokens for one or more orders.
 * Body: { orderIds: string[] } or { trackingIds: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ORDER,
      Action.UPDATE,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

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
    } else if (trackingIds?.length) {
      resolvedOrders = await db.query.orders.findMany({
        where: and(
          withTenantFilter(orders, [], tenantCtx.companyId),
          inArray(orders.trackingId, trackingIds),
        ),
        columns: { id: true, trackingId: true },
      });
    } else {
      // Unreachable — the early guard rejects both being empty. Kept
      // so TypeScript can prove `resolvedOrders` is always assigned.
      resolvedOrders = [];
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

    // Generate tokens for each order. Each order is independent — fan out
    // the per-order check + (optional) refresh + insert concurrently.
    const results = await Promise.all(
      resolvedOrders.map(async (order) => {
        const existingToken = await db.query.trackingTokens.findFirst({
          where: and(
            eq(trackingTokens.companyId, tenantCtx.companyId),
            eq(trackingTokens.orderId, order.id),
            eq(trackingTokens.active, true),
          ),
        });

        if (existingToken) {
          if (
            !existingToken.expiresAt ||
            existingToken.expiresAt > new Date()
          ) {
            return {
              trackingId: order.trackingId,
              token: existingToken.token,
              url: `/tracking/${existingToken.token}`,
            };
          }
          // Deactivate expired token
          await db
            .update(trackingTokens)
            .set({ active: false, updatedAt: new Date() })
            .where(eq(trackingTokens.id, existingToken.id));
        }

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

        return {
          trackingId: order.trackingId,
          token,
          url: `/tracking/${token}`,
        };
      }),
    );

    return NextResponse.json({ data: results });
  } catch (error) {
    console.error("Error generating tracking tokens:", error);
    return NextResponse.json(
      { error: "Error al generar tokens de seguimiento" },
      { status: 500 },
    );
  }
}
