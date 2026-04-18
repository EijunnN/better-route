/**
 * Integration smoke: drive runOptimization() end-to-end against the live dev DB
 * and assert the verifier populated result.verification. Skips if no suitable
 * configuration is available in the DB.
 */

import { db } from "@/db";
import {
  optimizationConfigurations,
  companies,
  vehicles,
  orders,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { runOptimization } from "@/lib/optimization/optimization-runner";
import { setTenantContext } from "@/lib/infra/tenant";

async function main() {
  const [company] = await db.select().from(companies).limit(1);
  if (!company) {
    console.log("No company in DB — skipping integration check.");
    process.exit(0);
  }
  console.log(`company: ${company.commercialName} (${company.id})`);
  setTenantContext({ companyId: company.id, userId: "integration-test" });

  const [config] = await db
    .select()
    .from(optimizationConfigurations)
    .where(eq(optimizationConfigurations.companyId, company.id))
    .limit(1);
  if (!config) {
    console.log("No optimization config — skipping.");
    process.exit(0);
  }
  console.log(`config: ${config.name} (${config.id})`);

  const availableVehicles = await db
    .select()
    .from(vehicles)
    .where(
      and(
        eq(vehicles.companyId, company.id),
        eq(vehicles.active, true),
      ),
    );
  if (availableVehicles.length === 0) {
    console.log("No vehicles — skipping.");
    process.exit(0);
  }
  console.log(`vehicles: ${availableVehicles.length}`);

  const pendingOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.companyId, company.id),
        eq(orders.status, "PENDING"),
        eq(orders.active, true),
      ),
    );
  console.log(`pending orders: ${pendingOrders.length}`);
  if (pendingOrders.length === 0) {
    console.log("No pending orders — skipping.");
    process.exit(0);
  }

  console.log("\nRunning runOptimization...\n");

  const result = await runOptimization(
    {
      configurationId: config.id,
      companyId: company.id,
      vehicleIds: availableVehicles.map((v) => v.id),
      driverIds: [],
    },
    new AbortController().signal,
  );

  console.log("\n── Result summary ───────────────────────────────");
  console.log(`routes: ${result.routes.length}`);
  console.log(`unassigned: ${result.unassignedOrders.length}`);
  console.log(`total distance: ${result.metrics.totalDistance.toFixed(0)}m`);
  console.log(`engine: ${result.summary.engineUsed}`);

  if (!result.verification) {
    console.error("\n❌ result.verification is MISSING. Verifier integration failed.");
    process.exit(1);
  }

  console.log("\n── Verifier output ──────────────────────────────");
  console.log(`optimizer: ${result.verification.optimizer}`);
  console.log(
    `violations: HARD=${result.verification.summary.hard}, SOFT=${result.verification.summary.soft}, INFO=${result.verification.summary.info}`,
  );
  console.log("by code:");
  for (const [code, count] of Object.entries(result.verification.summary.byCode)) {
    console.log(`  ${code}: ${count}`);
  }
  if (result.verification.violations.length > 0) {
    console.log("\nsample violations:");
    for (const v of result.verification.violations.slice(0, 5)) {
      console.log(
        `  [${v.severity}] ${v.code} — ${v.message}${v.trackingId ? ` (${v.trackingId})` : ""}`,
      );
    }
  }

  console.log("\n✓ Verifier integration OK: result.verification is populated.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
