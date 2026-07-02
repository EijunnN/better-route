#!/usr/bin/env bun
/**
 * Gate determinista de tenancy/RBAC para rutas API.
 * Spec normativa: docs/specs/hook-tenancy-gate.spec.md.
 *
 * Detección deliberadamente literal (grep, no AST): una `route.ts` bajo
 * `src/app/api` pasa si contiene un token RBAC **y** un token de tenancy
 * (ver spec §1 — incluye los wrappers equivalentes del proyecto), si usa el
 * middleware completo `withAuthAndAudit(`, o si su path está en
 * `scripts/route-guards-allowlist.json`.
 *
 * Modos de entrada:
 * - argv con paths → chequea esos paths.
 * - stdin JSON de hook PostToolUse → chequea `tool_input.file_path`.
 * - stdin con paths (uno por línea) → chequea esos paths.
 * - sin paths (hook Stop) → `git diff --diff-filter=ACMR HEAD` + untracked
 *   bajo `src/app/api`.
 *
 * Exit codes: 0 pasa · 2 bloquea (contrato de hooks de Claude Code).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const ROUTE_PATTERN = /src\/app\/api\/(?:[\w\-.[\]()@ ]+\/)*route\.ts(?![\w.])/;

export function toApiRoutePath(rawPath: string): string | null {
  const normalized = rawPath.replace(/\\/g, "/").trim();
  const match = normalized.match(ROUTE_PATTERN);
  return match ? match[0] : null;
}

/**
 * Tokens que satisfacen la mitad RBAC del guard (spec §1).
 * `checkPermissionOrError` comparte la lógica merged (matriz legacy + custom
 * roles en DB) de `requireRoutePermission` — verificado en
 * src/lib/routing/route-helpers.ts (calibración 2026-07-02).
 */
const RBAC_TOKENS = ["requireRoutePermission(", "checkPermissionOrError("];

/**
 * Tokens que satisfacen la mitad de tenancy del guard (spec §1).
 * - `setupAuthContext` llama `extractTenantContextAuthed` internamente
 *   (src/lib/routing/route-helpers.ts).
 * - `withTenantFilter` scopea la query Drizzle por `companyId`
 *   (src/db/tenant-aware.ts).
 */
const TENANT_TOKENS = [
  "extractTenantContextAuthed(",
  "assertSameTenant(",
  "setupAuthContext(",
  "withTenantFilter(",
];

/**
 * Wrappers que cubren el guard completo por sí solos (spec §1).
 * `withAuthAndAudit` = `withAuth` (JWT) + `requirePermission` (RBAC) en
 * src/lib/infra/api-middleware.ts; se usa para recursos admin globales sin
 * datos tenant (hoy: admin/cache).
 */
const COMPLETE_WRAPPER_TOKENS = ["withAuthAndAudit("];

export function hasGuards(content: string): boolean {
  if (COMPLETE_WRAPPER_TOKENS.some((token) => content.includes(token))) {
    return true;
  }
  return (
    RBAC_TOKENS.some((token) => content.includes(token)) &&
    TENANT_TOKENS.some((token) => content.includes(token))
  );
}

export function isAllowlisted(routePath: string, allowlist: string[]): boolean {
  return allowlist.some((entry) =>
    entry.endsWith("/") ? routePath.startsWith(entry) : routePath === entry,
  );
}

export function evaluateRoute(
  routePath: string,
  content: string,
  allowlist: string[],
): "pass" | "fail" {
  if (isAllowlisted(routePath, allowlist)) return "pass";
  return hasGuards(content) ? "pass" : "fail";
}

export function failureReport(failedPaths: string[]): string {
  const headers = failedPaths
    .map((p) => `✗ route-guards: ${p} no tiene guards de tenancy/RBAC.`)
    .join("\n");
  return [
    headers,
    "  Toda ruta API necesita:",
    "    1. requireRoutePermission(request, EntityType.X, Action.Y)",
    "    2. extractTenantContextAuthed(request, user)  (o assertSameTenant si el",
    "       companyId viene en el path)",
    "  Patrón completo: docs/REVIEW-RUBRIC.md §1-2 y CLAUDE.md §RBAC.",
    "  ¿Excepción deliberada? Agregala a scripts/route-guards-allowlist.json y",
    "  justificala (ver docs/specs/hook-tenancy-gate.spec.md §3).",
  ].join("\n");
}

export function loadAllowlist(): string[] {
  const file = join(import.meta.dir, "route-guards-allowlist.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<
    string,
    string
  >;
  return Object.keys(parsed);
}

function gitLines(args: string[]): string[] {
  const result = Bun.spawnSync(["git", ...args], { cwd: REPO_ROOT });
  if (result.exitCode !== 0) {
    console.error(
      `✗ route-guards: git ${args.join(" ")} falló:\n${result.stderr.toString()}`,
    );
    process.exit(2);
  }
  return result.stdout
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function diffPaths(): string[] {
  return [
    ...gitLines([
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      "HEAD",
      "--",
      "src/app/api",
    ]),
    ...gitLines([
      "ls-files",
      "--others",
      "--exclude-standard",
      "--",
      "src/app/api",
    ]),
  ];
}

async function collectPaths(): Promise<string[]> {
  const argPaths = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  if (argPaths.length > 0) return argPaths;

  if (!process.stdin.isTTY) {
    const raw = (await Bun.stdin.text()).trim();
    if (raw !== "") {
      if (raw.startsWith("{")) {
        try {
          const payload = JSON.parse(raw) as {
            tool_input?: { file_path?: string };
          };
          const filePath = payload.tool_input?.file_path;
          // JSON sin file_path = hook Stop → red de seguridad sobre el diff.
          return filePath ? [filePath] : diffPaths();
        } catch {
          // No era JSON de hook: tratarlo como lista de paths.
        }
      }
      return raw.split("\n");
    }
  }
  return diffPaths();
}

if (import.meta.main) {
  const allowlist = loadAllowlist();
  const candidates = new Set<string>();
  for (const rawPath of await collectPaths()) {
    const routePath = toApiRoutePath(rawPath);
    if (routePath) candidates.add(routePath);
  }

  const failed: string[] = [];
  for (const routePath of [...candidates].sort()) {
    const absolute = join(REPO_ROOT, routePath);
    if (!existsSync(absolute)) continue;
    const content = readFileSync(absolute, "utf8");
    if (evaluateRoute(routePath, content, allowlist) === "fail") {
      failed.push(routePath);
    }
  }

  if (failed.length > 0) {
    console.error(failureReport(failed));
    process.exit(2);
  }
  process.exit(0);
}
