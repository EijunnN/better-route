import { type NextRequest, NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/auth/auth";

/**
 * POST /api/auth/logout
 *
 * Logout the current user by clearing authentication cookies
 */
export async function POST(_request: NextRequest) {
  try {
    // Clear authentication cookies
    await clearAuthCookies();

    return NextResponse.json({
      success: true,
      message: "Sesión cerrada correctamente",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "Error al cerrar sesión" },
      { status: 500 },
    );
  }
}
