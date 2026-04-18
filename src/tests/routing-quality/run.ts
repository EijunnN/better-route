/**
 * Routing quality test runner.
 *
 * Runs every scenario against VROOM and PyVRP, applies the constraint verifier,
 * and emits:
 *  - Per-scenario JSON report in results/routing-quality/<name>.json
 *  - Aggregated markdown report in docs/routing-quality-report.md
 */

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { vroomAdapter } from "@/lib/optimization/vroom-adapter";
import { pyvrpAdapter } from "@/lib/optimization/pyvrp-adapter";
import type {
  IOptimizer,
  OptimizationResult,
} from "@/lib/optimization/optimizer-interface";
import { verify } from "@/lib/optimization/verifier";
import type { VerifierReport } from "@/lib/optimization/verifier";
import { SCENARIOS } from "./scenarios";
import type { Scenario, ScenarioExpectations } from "./types";

interface RunEntry {
  scenario: string;
  description: string;
  solver: string;
  ok: boolean;
  durationMs: number;
  error?: string;
  report?: VerifierReport;
  expectationFailures: string[];
}

const OUT_DIR = resolve("results/routing-quality");
const REPORT_PATH = resolve("docs/routing-quality-report.md");

async function runScenarioOnSolver(
  scenario: Scenario,
  solver: IOptimizer,
): Promise<RunEntry> {
  const start = Date.now();
  try {
    const result: OptimizationResult = await solver.optimize(
      scenario.orders,
      scenario.vehicles,
      scenario.config,
    );
    const report = verify({
      orders: scenario.orders,
      vehicles: scenario.vehicles,
      config: scenario.config,
      result,
    });
    const expectationFailures = evaluateExpectations(
      scenario.expected,
      report,
    );
    return {
      scenario: scenario.name,
      description: scenario.description,
      solver: solver.name,
      ok: expectationFailures.length === 0,
      durationMs: Date.now() - start,
      report,
      expectationFailures,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      scenario: scenario.name,
      description: scenario.description,
      solver: solver.name,
      ok: false,
      durationMs: Date.now() - start,
      error: message,
      expectationFailures: [`threw: ${message}`],
    };
  }
}

function evaluateExpectations(
  expected: ScenarioExpectations,
  report: VerifierReport,
): string[] {
  const failures: string[] = [];
  const maxHard = expected.maxHardViolations ?? 0;
  const maxUn = expected.maxUnassigned ?? 0;
  const minRoutes = expected.minRoutes ?? 0;
  const maxRoutes = expected.maxRoutes ?? Number.POSITIVE_INFINITY;

  if (report.summary.hard > maxHard) {
    failures.push(
      `HARD violations ${report.summary.hard} > allowed ${maxHard}`,
    );
  }
  if (expected.maxSoftViolations !== undefined) {
    if (report.summary.soft > expected.maxSoftViolations) {
      failures.push(
        `SOFT violations ${report.summary.soft} > allowed ${expected.maxSoftViolations}`,
      );
    }
  }
  if (report.totals.ordersUnassigned > maxUn) {
    failures.push(
      `unassigned ${report.totals.ordersUnassigned} > allowed ${maxUn}`,
    );
  }
  if (report.totals.routes < minRoutes) {
    failures.push(`routes ${report.totals.routes} < min ${minRoutes}`);
  }
  if (report.totals.routes > maxRoutes) {
    failures.push(`routes ${report.totals.routes} > max ${maxRoutes}`);
  }
  return failures;
}

function formatSummary(entries: RunEntry[]): string {
  const lines: string[] = [];
  lines.push("# Routing Quality Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Scenarios: ${SCENARIOS.length} × 2 solvers = ${entries.length} runs`);
  lines.push("");
  const passCount = entries.filter((e) => e.ok).length;
  lines.push(`Passed: **${passCount}** / ${entries.length}`);
  lines.push("");

  lines.push("## Summary table");
  lines.push("");
  lines.push("| Scenario | VROOM | PyVRP |");
  lines.push("|---|---|---|");
  for (const scenario of SCENARIOS) {
    const vroom = entries.find(
      (e) => e.scenario === scenario.name && e.solver === "VROOM",
    );
    const pyvrp = entries.find(
      (e) => e.scenario === scenario.name && e.solver === "PYVRP",
    );
    const cell = (e: RunEntry | undefined) => {
      if (!e) return "skipped";
      if (e.error) return `⚠️ error`;
      if (!e.ok) {
        const hard = e.report?.summary.hard ?? 0;
        const soft = e.report?.summary.soft ?? 0;
        const un = e.report?.totals.ordersUnassigned ?? 0;
        return `❌ ${hard}H ${soft}S ${un}un`;
      }
      const un = e.report?.totals.ordersUnassigned ?? 0;
      return `✅ ${un}un ${e.durationMs}ms`;
    };
    lines.push(`| ${scenario.name} | ${cell(vroom)} | ${cell(pyvrp)} |`);
  }
  lines.push("");

  lines.push("## Per-scenario detail");
  lines.push("");
  for (const scenario of SCENARIOS) {
    lines.push(`### ${scenario.name}`);
    lines.push("");
    lines.push(scenario.description);
    lines.push("");
    for (const solverName of ["VROOM", "PYVRP"]) {
      const e = entries.find(
        (x) => x.scenario === scenario.name && x.solver === solverName,
      );
      if (!e) continue;
      lines.push(`**${solverName}** — ${e.ok ? "PASS" : "FAIL"} in ${e.durationMs}ms`);
      lines.push("");
      if (e.error) {
        lines.push(`Error: \`${e.error}\``);
        lines.push("");
        continue;
      }
      const r = e.report;
      if (!r) continue;
      lines.push(
        `- routes=${r.totals.routes}, assigned=${r.totals.ordersAssigned}, unassigned=${r.totals.ordersUnassigned}`,
      );
      lines.push(
        `- violations: HARD=${r.summary.hard}, SOFT=${r.summary.soft}, INFO=${r.summary.info}`,
      );
      if (Object.keys(r.summary.byCode).length > 0) {
        lines.push("- breakdown:");
        for (const [code, count] of Object.entries(r.summary.byCode)) {
          lines.push(`  - \`${code}\`: ${count}`);
        }
      }
      if (e.expectationFailures.length > 0) {
        lines.push("- expectation failures:");
        for (const f of e.expectationFailures) {
          lines.push(`  - ${f}`);
        }
      }
      // First few hard violations, for context
      const firstHard = r.violations.filter((v) => v.severity === "HARD").slice(0, 3);
      if (firstHard.length > 0) {
        lines.push("- sample hard violations:");
        for (const v of firstHard) {
          const where = v.trackingId ? ` (order ${v.trackingId})` : v.vehicleIdentifier ? ` (veh ${v.vehicleIdentifier})` : "";
          const exp = v.expected !== undefined ? ` expected=${v.expected}` : "";
          const act = v.actual !== undefined ? ` actual=${v.actual}` : "";
          lines.push(`  - [${v.code}]${where}${exp}${act}`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

async function main() {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

  const entries: RunEntry[] = [];

  for (const scenario of SCENARIOS) {
    const solvers = scenario.solvers ?? ["VROOM", "PYVRP"];
    for (const solverName of solvers) {
      const solver: IOptimizer =
        solverName === "VROOM" ? vroomAdapter : pyvrpAdapter;
      process.stdout.write(`  → ${scenario.name} / ${solverName} ...`);
      const entry = await runScenarioOnSolver(scenario, solver);
      entries.push(entry);
      const status = entry.ok ? "✓" : entry.error ? "⚠" : "✗";
      process.stdout.write(` ${status} (${entry.durationMs}ms)\n`);
      if (entry.report) {
        await writeFile(
          resolve(OUT_DIR, `${scenario.name}.${solverName.toLowerCase()}.json`),
          JSON.stringify(entry.report, null, 2),
        );
      }
    }
  }

  const markdown = formatSummary(entries);
  await writeFile(REPORT_PATH, markdown);

  const passed = entries.filter((e) => e.ok).length;
  const total = entries.length;
  console.log(`\nDone. ${passed}/${total} runs passed.`);
  console.log(`Report: ${REPORT_PATH}`);
  console.log(`JSON details: ${OUT_DIR}`);

  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
