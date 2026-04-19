/**
 * RBAC coherence — regression guard for page ↔ sidebar ↔ API permission
 * alignment.
 *
 * Why this file exists
 * ─────────────────────────────────────────────────────────────────────
 * The typed <Can> / <ProtectedPage> contract prevents typos (you can't
 * write "order:edit" because `Action.EDIT` doesn't exist). But TypeScript
 * cannot detect *semantic* mismatches — e.g. a page gated by "order:read"
 * that secretly calls `POST /api/company-profiles` (which requires
 * `company:update`). Users enter the page, click save, hit 403.
 *
 * This file is the canonical registry of the permission each route
 * expects. The tests below parse page.tsx + sidebar.tsx + the relevant
 * API handlers and fail when a line of code drifts from the registry.
 *
 * When you add or move a page, update PAGE_CONTRACTS and run
 * `bun test src/tests/unit/rbac`. The test tells you exactly what to fix.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Permission } from "@/lib/auth/permissions";

type PageContract =
  | ClientPageContract
  | ServerPageContract;

interface BasePageContract {
  /** Path segment under `src/app/(protected)/` — omit page.tsx. */
  route: string;
  /** Permission the sidebar item uses; omitted when no sidebar entry. */
  sidebar?: Permission;
  /** Human rationale — forces the author to justify the choice. */
  why: string;
}

interface ClientPageContract extends BasePageContract {
  kind: "client";
  /** Permission the page declares in <ProtectedPage requiredPermission="..">. */
  page: Permission;
}

/**
 * Server-rendered pages (layout + SSR) where the protection is enforced by
 * the server code itself, not by a <ProtectedPage> wrapper. They must
 * still appear here so we don't lose track of them, and the contract must
 * justify why no client-side guard is needed.
 */
interface ServerPageContract extends BasePageContract {
  kind: "server";
  /**
   * Some explicit label documenting how the page protects itself, e.g.
   * "authenticated-only" when the layout's JWT check is enough.
   */
  serverCheck: string;
}

/**
 * ONE source of truth. Every protected route must appear here. Run
 * `bun run scripts/create-test-users.ts` then log in as each legacy role
 * to confirm the page actually behaves as the contract claims.
 */
const PAGE_CONTRACTS: PageContract[] = [
  {
    kind: "server",
    route: "dashboard",
    sidebar: "metrics:read",
    serverCheck: "authenticated-only (landing page post-login)",
    why: "Server component that queries DB per user's companyId. No <ProtectedPage> — the (protected) layout's JWT check is enough; a user with no companyId gets a ADMIN_SISTEMA onboarding redirect instead of 403. Sidebar item gated by metrics:read so users without metrics still see the page via direct navigation but without link in nav.",
  },
  {
    kind: "client",
    route: "orders",
    page: "order:read",
    sidebar: "order:read",
    why: "Page lists + edits orders. Reading grants entry; POST/PATCH/DELETE require order:create/update/delete (separately gated by <Can>).",
  },
  {
    kind: "client",
    route: "vehicles",
    page: "vehicle:read",
    sidebar: "vehicle:read",
    why: "CRUD gated page — read grants entry, mutations require vehicle:create/update/delete on their buttons.",
  },
  {
    kind: "client",
    route: "fleets",
    page: "fleet:read",
    sidebar: "fleet:read",
    why: "CRUD page; same pattern as vehicles.",
  },
  {
    kind: "client",
    route: "monitoring",
    page: "vehicle:read",
    sidebar: "vehicle:read",
    why: "Observability dashboard; read-only for most users. Stop status updates gated by route_stop:update on their buttons.",
  },
  {
    kind: "client",
    route: "planificacion",
    page: "plan:read",
    sidebar: "plan:read",
    why: "Plan creation flow. plan:read covers entry; plan:create gates the submit button.",
  },
  {
    kind: "client",
    route: "planificacion/historial",
    page: "plan:read",
    sidebar: "plan:read",
    why: "Read-only list of past plans.",
  },
  {
    kind: "client",
    route: "planificacion/[id]/results",
    page: "plan:read",
    why: "Results view, plan:confirm guards the confirm button.",
  },
  {
    kind: "client",
    route: "users",
    page: "user:read",
    sidebar: "user:read",
    why: "User admin CRUD; read entry + user:create/update/delete for mutations.",
  },
  {
    kind: "client",
    route: "roles",
    page: "role:read",
    sidebar: "role:read",
    why: "Custom role management; read entry + role:create/update/delete for mutations.",
  },
  {
    kind: "client",
    route: "companies",
    page: "company:create",
    sidebar: "company:create",
    why: "Cross-tenant admin page — only ADMIN_SISTEMA (wildcard) should have company:create. Intentionally stricter than company:read to hide the Empresas nav item from ADMIN_FLOTA which legitimately has company:read/update for OWN tenant config.",
  },
  {
    kind: "client",
    route: "configuracion",
    page: "company:update",
    sidebar: "company:update",
    why: "Page exists solely to edit company config (capacity dimensions, priorities, tracking). Entry requires the same permission as mutations.",
  },
  {
    kind: "client",
    route: "zones",
    page: "route:read",
    sidebar: "route:read",
    why: "Zones modelled under EntityType.ROUTE; read entry + route:create/update/delete for mutations.",
  },
  {
    kind: "client",
    route: "optimization-presets",
    page: "optimization_preset:read",
    sidebar: "optimization_preset:read",
    why: "CRUD page for optimization presets.",
  },
  {
    kind: "client",
    route: "time-window-presets",
    page: "time_window_preset:read",
    sidebar: "time_window_preset:read",
    why: "CRUD page for time window presets.",
  },
  {
    kind: "client",
    route: "vehicle-skills",
    page: "vehicle_skill:read",
    sidebar: "vehicle_skill:read",
    why: "Skills catalog CRUD.",
  },
  {
    kind: "client",
    route: "user-skills",
    page: "driver_skill:read",
    why: "User↔skill assignments; CRUD page. No sidebar item — reached from user admin flow.",
  },
  {
    kind: "client",
    route: "custom-fields",
    page: "company:update",
    sidebar: "company:update",
    why: "Field definitions are COMPANY config, not order data. All mutations hit /api/companies/[id]/field-definitions which requires company:update. Gating by company:update is honest: users who can read but not update would see the page and fail on save.",
  },
  {
    kind: "client",
    route: "workflow",
    page: "company:update",
    sidebar: "company:update",
    why: "Workflow states are company config. Same reasoning as custom-fields — API mutations require company:update; there's no legit read-only user flow.",
  },
];

/**
 * Read the file at `src/app/(protected)/<route>/page.tsx` and assert that
 * it contains `requiredPermission="<expected>"`. Uses substring match
 * rather than AST parsing to keep the test dependency-free and fast.
 */
function pageHasPermission(route: string, expected: Permission): boolean {
  const file = join(process.cwd(), "src/app/(protected)", route, "page.tsx");
  const content = readFileSync(file, "utf8");
  return content.includes(`requiredPermission="${expected}"`);
}

/**
 * Parse sidebar.tsx for the nav item that points to `/<route>` and
 * return the permission string attached to it.
 */
function sidebarPermissionFor(route: string): string | null {
  const file = join(process.cwd(), "src/components/layout/sidebar.tsx");
  const content = readFileSync(file, "utf8");
  // Matches: `href: "/<route>", icon: X, requiredPermission: "perm" }` —
  // allows arbitrary ordering of other properties.
  const regex = new RegExp(
    `href:\\s*"/${route.replace(/\//g, "\\/")}"[^}]*requiredPermission:\\s*"([^"]+)"`,
    "m",
  );
  const match = content.match(regex);
  return match?.[1] ?? null;
}

describe("RBAC coherence — pages vs contracts", () => {
  for (const contract of PAGE_CONTRACTS) {
    if (contract.kind !== "client") continue;
    test(`/${contract.route} uses ${contract.page}`, () => {
      expect(pageHasPermission(contract.route, contract.page)).toBe(true);
    });
  }
});

describe("RBAC coherence — sidebar items vs contracts", () => {
  for (const contract of PAGE_CONTRACTS) {
    if (!contract.sidebar) continue;
    test(`sidebar /${contract.route} uses ${contract.sidebar}`, () => {
      const found = sidebarPermissionFor(contract.route);
      expect(found).toBe(contract.sidebar ?? null);
    });
  }
});

describe("RBAC coherence — no protected page without a contract", () => {
  test("every page.tsx under (protected) appears in PAGE_CONTRACTS", () => {
    // Walk the filesystem once. Any new page without a matching contract
    // fails this test — forces the author to document the permission
    // choice here before merging.
    const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
    const baseDir = join(process.cwd(), "src/app/(protected)");
    const found: string[] = [];

    function walk(dir: string, prefix: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full, prefix ? `${prefix}/${entry}` : entry);
        } else if (entry === "page.tsx") {
          found.push(prefix);
        }
      }
    }
    walk(baseDir, "");

    const contracted = new Set(PAGE_CONTRACTS.map((c) => c.route));
    const uncontracted = found.filter((route) => !contracted.has(route));

    if (uncontracted.length > 0) {
      const hint = uncontracted
        .map((r) => `  - /${r}: add an entry to PAGE_CONTRACTS with the required permission`)
        .join("\n");
      throw new Error(
        `Found ${uncontracted.length} protected page(s) without a permission contract:\n${hint}`,
      );
    }
  });
});
