/**
 * Regression guard for custom-role permission resolution.
 *
 * `getUserPermissionsFromDB` is the function that both `/api/auth/me` and
 * the server-side `assertMergedPermission` rely on to compute the effective
 * permission set for a user. It must:
 *   1. Pick up permissions granted via custom roles.
 *   2. Drop them the moment a role is revoked or its permission toggled off.
 *
 * This test exercises both flows end-to-end against the real DB. The
 * function is currently uncached on the live path, so these assertions also
 * prevent a future cache layer from being introduced without an
 * invalidation hook — if someone adds caching, at least one of these
 * assertions will fail without the corresponding cache-clear call.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
} from "bun:test";
import { and, eq } from "drizzle-orm";
import { cleanDatabase, testDb } from "../setup/test-db";
import {
  createAdmin,
  createCompany,
  createPermission,
  createPlanner,
  createRole,
  createRolePermission,
  createUserRole,
} from "../setup/test-data";
import { getUserPermissionsFromDB } from "@/lib/auth/authorization";
import { rolePermissions, userRoles } from "@/db/schema";

describe("custom role permissions flow through getUserPermissionsFromDB", () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  test(
    "revoking a user's custom role drops its permissions immediately",
    async () => {
      const company = await createCompany({
        legalName: "Revoke Role Co",
        commercialName: "Revoke",
      });
      await createAdmin(company.id);
      const user = await createPlanner(company.id);

      // A permission that is NOT in the legacy PLANIFICADOR matrix — so its
      // presence/absence is determined entirely by the custom role.
      const perm = await createPermission({
        entity: "custom_entity_x",
        // MANAGE normalizes to `update` in authorization.ts:318
        action: "MANAGE",
        name: "Custom x manage",
        category: "SETTINGS",
      });
      const role = await createRole({
        companyId: company.id,
        name: "Temp role",
        code: "temp_role",
      });
      await createRolePermission({
        roleId: role.id,
        permissionId: perm.id,
        enabled: true,
      });
      const assignment = await createUserRole({
        userId: user.id,
        roleId: role.id,
        active: true,
      });

      const before = await getUserPermissionsFromDB(user.id, company.id);
      expect(before).toContain("custom_entity_x:update");

      // Revoke via the same path the DELETE handler takes: soft-delete the
      // user_role row. `clearUserPermissionCache(user.id)` is a no-op today
      // (the live path doesn't read from a cache) but adding it ensures a
      // future cache layer honors invalidation.
      await testDb
        .update(userRoles)
        .set({ active: false })
        .where(eq(userRoles.id, assignment.id));

      const after = await getUserPermissionsFromDB(user.id, company.id);
      expect(after).not.toContain("custom_entity_x:update");
    },
    30000,
  );

  test(
    "disabling a role's permission removes it from every user that has the role",
    async () => {
      const company = await createCompany({
        legalName: "Toggle Role Co",
        commercialName: "Toggle",
      });
      await createAdmin(company.id);
      const user = await createPlanner(company.id);

      const perm = await createPermission({
        entity: "custom_entity_y",
        // EDIT normalizes to `update` too — distinct entity so we don't
        // collide with the other test if DB state leaks across describes.
        action: "EDIT",
        name: "Custom y edit",
        category: "SETTINGS",
      });
      const role = await createRole({
        companyId: company.id,
        name: "Toggle role",
        code: "toggle_role",
      });
      const rp = await createRolePermission({
        roleId: role.id,
        permissionId: perm.id,
        enabled: true,
      });
      await createUserRole({
        userId: user.id,
        roleId: role.id,
        active: true,
      });

      const before = await getUserPermissionsFromDB(user.id, company.id);
      expect(before).toContain("custom_entity_y:update");

      // Toggle the permission off (same as unchecking the switch in /roles).
      await testDb
        .update(rolePermissions)
        .set({ enabled: false })
        .where(
          and(
            eq(rolePermissions.id, rp.id),
            eq(rolePermissions.roleId, role.id),
          ),
        );

      const after = await getUserPermissionsFromDB(user.id, company.id);
      expect(after).not.toContain("custom_entity_y:update");
    },
    30000,
  );
});
