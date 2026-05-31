#!/usr/bin/env bun
/**
 * Resumen de lint agrupado por regla y severidad.
 *
 * `biome check` por defecto trunca a 20 diagnósticos y su salida de texto es
 * incómoda de parsear (encoding, formato). Este script consume el reporter
 * JSON de biome, que es estable y completo, y muestra el panorama de un golpe:
 *
 *   bun run lint:summary
 *
 * Sale con código 1 si hay errores (útil en CI / hooks).
 */
import { $ } from "bun";

const raw = await $`bunx biome check --reporter=json --max-diagnostics=1000`
  .nothrow()
  .quiet()
  .text();

interface BiomeReport {
  summary?: { errors?: number; warnings?: number };
  diagnostics?: Array<{ category?: string; severity?: string }>;
}

let report: BiomeReport;
try {
  report = JSON.parse(raw);
} catch {
  console.error("No se pudo parsear la salida JSON de biome:\n");
  console.error(raw.slice(0, 500));
  process.exit(2);
}

const errors = report.summary?.errors ?? 0;
const warnings = report.summary?.warnings ?? 0;

const byRule = new Map<
  string,
  { error: number; warning: number; info: number }
>();
for (const d of report.diagnostics ?? []) {
  const rule = d.category ?? "(sin categoría)";
  const sev = d.severity ?? "info";
  const row = byRule.get(rule) ?? { error: 0, warning: 0, info: 0 };
  if (sev === "error") row.error++;
  else if (sev === "warning") row.warning++;
  else row.info++;
  byRule.set(rule, row);
}

const rows = [...byRule.entries()].sort(
  (a, b) => b[1].error - a[1].error || b[1].warning - a[1].warning,
);

console.log(`\nLint summary — ${errors} errores, ${warnings} warnings\n`);
for (const [rule, c] of rows) {
  const parts: string[] = [];
  if (c.error) parts.push(`${c.error} err`);
  if (c.warning) parts.push(`${c.warning} warn`);
  if (c.info) parts.push(`${c.info} info`);
  console.log(`  ${parts.join(", ").padEnd(22)} ${rule}`);
}
console.log();

process.exit(errors > 0 ? 1 : 0);
