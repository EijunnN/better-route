import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { requireTenantContext, setTenantContext } from "@/lib/tenant";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// DELETE - Delete all orders for a company (soft delete by setting active=false)
export async function DELETE(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 }
      );
    }

    setTenantContext(tenantCtx);
    const context = requireTenantContext();

    // Check if hard delete is requested
    const { searchParams } = new URL(request.url);
    const hardDelete = searchParams.get("hard") === "true";

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
    console.error("Batch delete error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete orders",
      },
      { status: 500 }
    );
  }
}
