/**
 * Test database connection and cleanup utilities.
 *
 * Creates a separate drizzle instance pointing at the test database.
 * The preload file mocks `@/db` to use this instance, so all route
 * handlers automatically operate against the test DB.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

function loadTestEnvFile() {
  const envTestPath = resolve(process.cwd(), ".env.test");

  if (!existsSync(envTestPath)) {
    return;
  }

  const content = readFileSync(envTestPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadTestEnvFile();

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL must be set to run integration tests. Configure it in .env.test.",
  );
}

if (
  process.env.DATABASE_URL &&
  process.env.DATABASE_URL === TEST_DATABASE_URL
) {
  throw new Error(
    "TEST_DATABASE_URL must point to a dedicated test database and cannot match DATABASE_URL.",
  );
}

export const testClient = postgres(TEST_DATABASE_URL, {
  max: 5,
  idle_timeout: 5,
  connect_timeout: 10,
});

export const testDb = drizzle(testClient, { schema });

const TRUNCATE_SQL = sql`TRUNCATE TABLE
    tracking_tokens, company_tracking_settings,
    route_stop_history, route_stops, plan_metrics,
    reassignments_history, output_history, optimization_jobs,
    optimization_configurations, orders,
    vehicle_fleets, vehicle_skill_assignments, vehicle_skills, user_skills,
    vehicle_fleet_history, vehicle_status_history,
    user_fleet_permissions, user_secondary_fleets,
    user_availability, user_driver_status_history,
    user_roles, role_permissions, permissions, roles,
    alert_notifications, alerts, alert_rules,
    time_window_presets, zones, zone_vehicles,
    optimization_presets, driver_locations,
    company_workflow_states, company_workflow_transitions,
    company_field_definitions,
    csv_column_mapping_templates, company_optimization_profiles,
    vehicles, fleets, audit_logs, users, companies
    CASCADE`;

/**
 * Delete all data from all tables in the correct order.
 * Uses TRUNCATE ... CASCADE for simplicity.
 * Retries on deadlock (code 40P01) since concurrent test processes
 * may hold locks on the same tables.
 */
export async function cleanDatabase(retries = 3) {
  await testDb.execute(sql`SET client_min_messages TO WARNING`);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await testDb.execute(TRUNCATE_SQL);
      return;
    } catch (error: unknown) {
      const isDeadlock =
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "40P01";
      if (isDeadlock && attempt < retries) {
        // Wait briefly, then retry
        await new Promise((r) => setTimeout(r, 100 * attempt));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Close the test database connection.
 * Only call this when all tests are done (e.g., in a global teardown).
 */
export async function closeDatabase() {
  await testClient.end();
}
