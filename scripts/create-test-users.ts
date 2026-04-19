/**
 * One-shot script: ensure a test company exists and create test users for
 * each legacy role. Idempotent — safe to re-run.
 *
 *   bun run scripts/create-test-users.ts
 *
 * Credentials produced:
 *   admin@test.local     / test123  (ADMIN_SISTEMA — no companyId)
 *   adminflota@test.local / test123  (ADMIN_FLOTA — TestCo)
 *   planificador@test.local / test123 (PLANIFICADOR — TestCo)
 *   monitor@test.local   / test123   (MONITOR — TestCo)
 *   conductor@test.local / test123   (CONDUCTOR — TestCo)
 */

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, users } from "@/db/schema";
import { USER_ROLES, type UserRole } from "@/lib/auth/permissions";

async function ensureCompany(): Promise<string> {
  const existing = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.commercialName, "TestCo RBAC"))
    .limit(1);
  if (existing[0]) {
    console.log(`ℹ️  Company TestCo RBAC exists: ${existing[0].id}`);
    return existing[0].id;
  }
  const [created] = await db
    .insert(companies)
    .values({
      legalName: "TestCo RBAC SA",
      commercialName: "TestCo RBAC",
      email: "ops@testco.local",
      country: "PE",
      active: true,
    })
    .returning({ id: companies.id });
  console.log(`✅ Created company TestCo RBAC: ${created.id}`);
  return created.id;
}

async function ensureUser(opts: {
  email: string;
  username: string;
  name: string;
  role: UserRole;
  companyId: string | null;
}) {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, opts.email))
    .limit(1);
  if (existing[0]) {
    console.log(`ℹ️  User ${opts.email} exists: ${existing[0].id}`);
    return existing[0].id;
  }
  const password = await bcrypt.hash("test123", 10);
  const [created] = await db
    .insert(users)
    .values({
      companyId: opts.companyId,
      email: opts.email,
      username: opts.username,
      name: opts.name,
      password,
      role: opts.role,
      active: true,
    })
    .returning({ id: users.id });
  console.log(`✅ Created ${opts.role}: ${opts.email} → ${created.id}`);
  return created.id;
}

async function main() {
  console.log("🌱 Seeding RBAC test users...\n");
  const companyId = await ensureCompany();

  await ensureUser({
    email: "admin@test.local",
    username: "test_admin_sistema",
    name: "Test Admin Sistema",
    role: USER_ROLES.ADMIN_SISTEMA,
    companyId: null,
  });
  await ensureUser({
    email: "adminflota@test.local",
    username: "test_admin_flota",
    name: "Test Admin Flota",
    role: USER_ROLES.ADMIN_FLOTA,
    companyId,
  });
  await ensureUser({
    email: "planificador@test.local",
    username: "test_planificador",
    name: "Test Planificador",
    role: USER_ROLES.PLANIFICADOR,
    companyId,
  });
  await ensureUser({
    email: "monitor@test.local",
    username: "test_monitor",
    name: "Test Monitor",
    role: USER_ROLES.MONITOR,
    companyId,
  });
  await ensureUser({
    email: "conductor@test.local",
    username: "test_conductor",
    name: "Test Conductor",
    role: USER_ROLES.CONDUCTOR,
    companyId,
  });

  console.log("\n📋 Credentials (password: test123 for all):");
  console.log("   admin@test.local         (ADMIN_SISTEMA)");
  console.log("   adminflota@test.local    (ADMIN_FLOTA)");
  console.log("   planificador@test.local  (PLANIFICADOR)");
  console.log("   monitor@test.local       (MONITOR)");
  console.log("   conductor@test.local     (CONDUCTOR)");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
