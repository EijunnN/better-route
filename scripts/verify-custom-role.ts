/**
 * E2E verification of the custom-role path:
 *   1. Ensure the system permission catalog is seeded.
 *   2. Create (idempotent) a custom role "QA Limited" on TestCo RBAC with
 *      ONLY orders:VIEW + vehicles:VIEW enabled.
 *   3. Create (idempotent) user qa-custom@test.local with base role
 *      CONDUCTOR (very limited legacy perms) and assign the custom role.
 *   4. Print the merged permissions getUserPermissionsFromDB() returns —
 *      this is what /api/auth/me feeds to the client.
 *
 * Expected: legacy CONDUCTOR perms (route:read, route_stop:read/update,
 * order:read) UNION custom role perms (order:read, vehicle:read).
 *
 *   bun run scripts/verify-custom-role.ts
 */

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  permissions,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "@/db/schema";
import {
  USER_ROLES,
  type UserRole,
} from "@/lib/auth/permissions";
import { getUserPermissionsFromDB } from "@/lib/auth/authorization";

async function getTestCompanyId(): Promise<string> {
  const [c] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.commercialName, "TestCo RBAC"))
    .limit(1);
  if (!c) throw new Error("TestCo RBAC not found — run create-test-users.ts first");
  return c.id;
}

async function ensureRole(companyId: string, name: string): Promise<string> {
  const [existing] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.companyId, companyId), eq(roles.name, name)))
    .limit(1);
  if (existing) {
    console.log(`ℹ️  Role "${name}" exists: ${existing.id}`);
    return existing.id;
  }
  const [created] = await db
    .insert(roles)
    .values({
      companyId,
      name,
      description: "QA test role — orders:VIEW + vehicles:VIEW only",
      isSystem: false,
      active: true,
    })
    .returning({ id: roles.id });
  console.log(`✅ Created role "${name}": ${created.id}`);
  return created.id;
}

async function setRolePermissions(
  roleId: string,
  picks: Array<{ entity: string; action: string }>,
) {
  for (const pick of picks) {
    const [perm] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(
        and(
          eq(permissions.entity, pick.entity),
          eq(permissions.action, pick.action),
        ),
      )
      .limit(1);
    if (!perm) {
      console.log(`⚠️  Permission ${pick.entity}:${pick.action} not in catalog — skipping`);
      continue;
    }
    const [existing] = await db
      .select({ id: rolePermissions.id })
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, roleId),
          eq(rolePermissions.permissionId, perm.id),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(rolePermissions)
        .set({ enabled: true, updatedAt: new Date() })
        .where(eq(rolePermissions.id, existing.id));
    } else {
      await db.insert(rolePermissions).values({
        roleId,
        permissionId: perm.id,
        enabled: true,
      });
    }
    console.log(`  ✓ ${pick.entity}:${pick.action} enabled`);
  }
}

async function ensureUser(opts: {
  email: string;
  username: string;
  name: string;
  role: UserRole;
  companyId: string;
}): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, opts.email))
    .limit(1);
  if (existing) {
    console.log(`ℹ️  User ${opts.email} exists: ${existing.id}`);
    return existing.id;
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
  console.log(`✅ Created user ${opts.email} (base role ${opts.role}): ${created.id}`);
  return created.id;
}

async function assignRole(userId: string, roleId: string) {
  const [existing] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
    .limit(1);
  if (existing) {
    await db
      .update(userRoles)
      .set({ active: true, updatedAt: new Date() })
      .where(eq(userRoles.id, existing.id));
    console.log(`ℹ️  user_roles binding exists, ensured active`);
    return;
  }
  await db.insert(userRoles).values({
    userId,
    roleId,
    isPrimary: false,
    active: true,
  });
  console.log(`✅ Assigned role to user`);
}

async function main() {
  console.log("🔬 Verifying custom-role path...\n");
  const companyId = await getTestCompanyId();
  console.log(`Company TestCo RBAC: ${companyId}\n`);

  const roleId = await ensureRole(companyId, "QA Limited");
  console.log("\nEnabling permissions on QA Limited:");
  await setRolePermissions(roleId, [
    { entity: "orders", action: "VIEW" },
    { entity: "vehicles", action: "VIEW" },
  ]);

  console.log("\nProvisioning test user...");
  const userId = await ensureUser({
    email: "qa-custom@test.local",
    username: "qa_custom",
    name: "QA Custom Role User",
    role: USER_ROLES.CONDUCTOR,
    companyId,
  });

  await assignRole(userId, roleId);

  console.log("\n📋 getUserPermissionsFromDB() result for qa-custom@test.local:");
  const perms = await getUserPermissionsFromDB(userId, companyId);
  for (const p of perms.sort()) console.log(`   ${p}`);

  const expectedFromCustom = ["order:read", "vehicle:read"];
  const expectedFromBase = ["route:read", "route_stop:read", "route_stop:update"];
  const allExpected = [...expectedFromBase, ...expectedFromCustom];
  const missing = allExpected.filter((p) => !perms.includes(p));
  const surprising = perms.filter(
    (p) => !allExpected.includes(p) && !p.startsWith("order:read"),
  );

  console.log("\n✅ Expected from base CONDUCTOR:", expectedFromBase.join(", "));
  console.log("✅ Expected from custom QA Limited:", expectedFromCustom.join(", "));
  if (missing.length === 0) {
    console.log("\n🎉 All expected permissions are present.");
  } else {
    console.log(`\n❌ Missing: ${missing.join(", ")}`);
  }
  console.log("\nLogin: qa-custom@test.local / test123");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
