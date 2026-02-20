import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { requireTenantContext, setTenantContext } from "@/lib/infra/tenant";
import {
  extractTenantContext,
  handleError,
  setupAuthContext,
  unauthorizedResponse,
} from "@/lib/routing/route-helpers";

// DELETE - Delete all orders for a company (soft delete by setting active=false)
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await setupAuthContext(request);
    if (!authResult.authenticated || !authResult.user) {
      return unauthorizedResponse();
    }

    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return unauthorizedResponse("Missing tenant context");
    }

    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    // Check if hard delete is requested
    const { searchParams } = new URL(request.url);
    const hardDelete = searchParams.get("hard") === "true";

    // Hard delete requires ADMIN_SISTEMA role
    if (hardDelete && authResult.user.role !== "ADMIN_SISTEMA") {
      return NextResponse.json(
        { error: "Hard delete requires ADMIN_SISTEMA role" },
        { status: 403 },
      );
    }

    let deletedCount = 0;

    if (hardDelete) {
      // Hard delete - permanently remove all orders
      const result = await db
        .delete(orders)
        .where(eq(orders.companyId, context.companyId))
        .returning({ id: orders.id });

      deletedCount = result.length;
    } else {
      // Soft delete - set active=false for all orders
      const result = await db
        .update(orders)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(orders.companyId, context.companyId))
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
