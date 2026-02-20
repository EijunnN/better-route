import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * GET /api/health
 *
 * Health check endpoint for load balancers and monitoring.
 * Returns 200 if the service is healthy, 503 otherwise.
 */
export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};

  // Check database connectivity
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  const healthy = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
