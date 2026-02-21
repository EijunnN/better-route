/**
 * Test database connection and cleanup utilities.
 *
 * Creates a separate drizzle instance pointing at the test database.
 * The preload file mocks `@/db` to use this instance, so all route
 * handlers automatically operate against the test DB.
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL or DATABASE_URL must be set to run integration tests",
  );
}

export const testClient = postgres(TEST_DATABASE_URL, {
  max: 5,
  idle_timeout: 5,
  connect_timeout: 10,
});

export const testDb = drizzle(testClient, { schema });

/**
 * Delete all data from all tables in the correct order.
 * Uses TRUNCATE ... CASCADE for simplicity.
 */
export async function cleanDatabase() {
  await testDb.execute(sql`SET client_min_messages TO WARNING`);
  await testDb.execute(sql`TRUNCATE TABLE
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
    CASCADE`);
}

/**
 * Close the test database connection.
 * Only call this when all tests are done (e.g., in a global teardown).
 */
export async function closeDatabase() {
  await testClient.end();
}
