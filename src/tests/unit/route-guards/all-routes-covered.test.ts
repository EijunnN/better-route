/**
 * Caso 5 de docs/specs/hook-tenancy-gate.spec.md: smoke del gate sobre TODAS
 * las route.ts del repo, no solo sobre las del diff.
 *
 * Por qué existe además de los hooks: el hook `PostToolUse` sólo evalúa el
 * archivo que se acaba de escribir y el hook `Stop` sólo el diff contra HEAD.
 * Ambos son incrementales y viven en el harness — una ruta que ya está en
 * `master` sin guards, o un editor que no pase por los hooks, no los dispara.
 * Este test barre el árbol completo en cada `bun test`.
 *
 * Reusa `evaluateRoute` y `loadAllowlist` del script a propósito: la lógica de
 * detección y la allowlist tienen UNA sola fuente
 * (`scripts/check-route-guards.ts` + `scripts/route-guards-allowlist.json`).
 * Reimplementarlas acá sería crear un segundo criterio capaz de divergir en
 * silencio del que corre en los hooks.
 *
 * `check-route-guards.test.ts`, al lado, cubre la lógica del script con
 * contenidos sintéticos; esto cubre la realidad del repo.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  evaluateRoute,
  loadAllowlist,
} from "../../../../scripts/check-route-guards";

const REPO_ROOT = join(import.meta.dir, "../../../..");
const API_DIR = join(REPO_ROOT, "src/app/api");

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findRouteFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

const routeFiles = findRouteFiles(API_DIR).map((f) =>
  relative(REPO_ROOT, f).replace(/\\/g, "/"),
);

describe("gate de tenancy/RBAC — cobertura de todo el árbol", () => {
  test("el walker encuentra las rutas (si esto baja, el test dejó de proteger)", () => {
    expect(routeFiles.length).toBeGreaterThan(100);
  });

  test("toda route.ts pasa el gate o está en la allowlist justificada", () => {
    const allowlist = loadAllowlist();

    const failed = routeFiles.filter((routePath) => {
      const content = readFileSync(join(REPO_ROOT, routePath), "utf8");
      return evaluateRoute(routePath, content, allowlist) === "fail";
    });

    expect(
      failed,
      "Rutas sin guards de tenancy/RBAC:\n" +
        `${failed.map((f) => `  - ${f}`).join("\n")}\n\n` +
        "Agregá requireRoutePermission + extractTenantContextAuthed al handler,\n" +
        "o justificá la excepción en scripts/route-guards-allowlist.json.",
    ).toEqual([]);
  });

  test("la allowlist no acumula entradas muertas", () => {
    // Una allowlist que se pudre es peor que no tenerla: cada entrada obsoleta
    // es un permiso latente para que una ruta futura con ese path nazca sin
    // guards y nadie se entere.
    const stale = loadAllowlist().filter((entry) =>
      entry.endsWith("/")
        ? !routeFiles.some((f) => f.startsWith(entry))
        : !routeFiles.includes(entry),
    );

    expect(
      stale,
      `Entradas de scripts/route-guards-allowlist.json que ya no matchean ninguna ruta:\n${stale
        .map((f) => `  - ${f}`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
