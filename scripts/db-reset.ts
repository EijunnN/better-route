/**
 * LOCAL DEV HELPER — destructive. Drops the entire `public` schema (all app
 * tables) and the `drizzle` migration ledger, then recreates an empty `public`.
 * Use ONLY to adopt the squashed migration baseline on a dev DB with no real
 * data. After running this, run:  bun run db:migrate && bun run db:seed
 *
 * NEVER run this against a database with real customer data — it runs against
 * whatever DATABASE_URL points to, with NO production guard. Double-check your
 * env before running:  bun run scripts/db-reset.ts
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL is not set (bun auto-loads .env).");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  console.log(`Resetting schema on: ${url.replace(/:[^:@/]+@/, ":****@")}`);
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`CREATE SCHEMA public`;
  console.log("✓ DB reset. Now run:  bun run db:migrate && bun run db:seed");
} catch (err) {
  console.error("✗ Reset failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
