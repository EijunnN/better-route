import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ORDER_STATUS, orders, routeStops, trackingTokens } from "@/db/schema";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";
import {
  extractTenantContextAuthed,
  handleError,
} from "@/lib/routing/route-helpers";

// DELETE - Delete all orders for a company (soft delete by setting active=false)
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ORDER,
      Action.BULK_DELETE,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    // Check if hard delete is requested
    const { searchParams } = new URL(request.url);
    const hardDelete = searchParams.get("hard") === "true";

    // Optional status scope (e.g. status=PENDING to discard only the
    // uncommitted draft pool, leaving assigned/in-progress orders untouched).
    const statusParam = searchParams.get("status");
    const statusScope =
      statusParam && statusParam in ORDER_STATUS
        ? (statusParam as keyof typeof ORDER_STATUS)
        : null;

    // Optional targeted delete by explicit ids (results page "Eliminar
    // seleccionados" / lasso). Soft delete so they drop out of the next
    // optimization run (which loads active PENDING orders) and stay auditable.
    const body = (await request.json().catch(() => null)) as {
      orderIds?: unknown;
    } | null;
    const orderIds = Array.isArray(body?.orderIds)
      ? body.orderIds.filter((x): x is string => typeof x === "string")
      : [];

    if (orderIds.length > 0) {
      const result = await db
        .update(orders)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(
            eq(orders.companyId, context.companyId),
            inArray(orders.id, orderIds),
          ),
        )
        .returning({ id: orders.id });

      return NextResponse.json({
        success: true,
        deleted: result.length,
        message: `${result.length} orders marked as inactive`,
      });
    }

    // Hard delete requires ADMIN_SISTEMA role
    if (hardDelete && authResult.role !== "ADMIN_SISTEMA") {
      return NextResponse.json(
        { error: "Hard delete requires ADMIN_SISTEMA role" },
        { status: 403 },
      );
    }

    let deletedCount = 0;

    if (hardDelete) {
      // Hard delete - permanently remove all orders and related records in a transaction
      const result = await db.transaction(async (tx) => {
        // Delete FK-dependent records in parallel (they don't depend on each other)
        await Promise.all([
          tx
            .delete(trackingTokens)
            .where(eq(trackingTokens.companyId, context.companyId)),
          tx
            .delete(routeStops)
            .where(eq(routeStops.companyId, context.companyId)),
        ]);
        // Then delete orders
        return tx
          .delete(orders)
          .where(eq(orders.companyId, context.companyId))
          .returning({ id: orders.id });
      });

      deletedCount = result.length;
    } else {
      // Soft delete - set active=false. Scoped to a status when requested.
      const whereClause = statusScope
        ? and(
            eq(orders.companyId, context.companyId),
            eq(orders.status, statusScope),
          )
        : eq(orders.companyId, context.companyId);

      const result = await db
        .update(orders)
        .set({ active: false, updatedAt: new Date() })
        .where(whereClause)
        .returning({ id: orders.id });

      deletedCount = result.length;
    }

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      message: `${deletedCount} orders ${hardDelete ? "permanently deleted" : "marked as inactive"}`,
    });
  } catch (error) {
    return handleError(error, "batch deleting orders");
  }
}
