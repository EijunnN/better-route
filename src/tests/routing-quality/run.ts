/**
 * Routing quality test runner.
 *
 * Runs every scenario against VROOM (the only supported solver after PyVRP
 * was removed), applies the constraint verifier, and emits:
 *  - Per-scenario JSON report in results/routing-quality/<name>.json
 *  - Aggregated markdown report in docs/routing-quality-report.md
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  AggregatedPlan,
  AssignedSolvedRoute,
  SolvedStop,
  VerificationReport,
} from "@/lib/optimization/solved-plan";
import { secondsToHHMM, verify } from "@/lib/optimization/verifier";
import {
  type OrderForOptimization,
  type VehicleForOptimization,
  type OptimizationConfig as VroomConfig,
  optimizeRoutes as vroomOptimizeRoutes,
} from "@/lib/optimization/vroom-optimizer";
import { SCENARIOS } from "./scenarios";
import type { Scenario, ScenarioExpectations } from "./types";

interface RunEntry {
  scenario: string;
  description: string;
  solver: string;
  ok: boolean;
  durationMs: number;
  error?: string;
  report?: VerificationReport;
  expectationFailures: string[];
}

const OUT_DIR = resolve("results/routing-quality");
const REPORT_PATH = resolve("docs/routing-quality-report.md");
const SOLVER_NAME = "VROOM";

// ─── Conversion: scenario inputs (verifier shape) → VROOM shape ────────

function toVroomOrder(o: Scenario["orders"][number]): OrderForOptimization {
  return {
    id: o.id,
    trackingId: o.trackingId,
    address: o.address,
    latitude: o.latitude,
    longitude: o.longitude,
    weightRequired: o.weightRequired,
    volumeRequired: o.volumeRequired,
    orderValue: o.orderValue,
    unitsRequired: o.unitsRequired,
    orderType: o.orderType,
    timeWindowStart: o.timeWindowStart,
    timeWindowEnd: o.timeWindowEnd,
    skillsRequired: o.skillsRequired,
    priority: o.priority,
    serviceTime: o.serviceTime,
    zoneId: o.zoneId,
  };
}

function toVroomVehicle(
  v: Scenario["vehicles"][number],
): VehicleForOptimization {
  return {
    id: v.id,
    plate: v.identifier,
    maxWeight: v.maxWeight,
    maxVolume: v.maxVolume,
    maxValueCapacity: v.maxValueCapacity,
    maxUnitsCapacity: v.maxUnitsCapacity,
    maxOrders: v.maxOrders,
    originLatitude: v.originLatitude,
    originLongitude: v.originLongitude,
    skills: v.skills,
    speedFactor: v.speedFactor,
    timeWindowStart: v.timeWindowStart,
    timeWindowEnd: v.timeWindowEnd,
    hasBreakTime: v.hasBreakTime,
    breakDuration: v.breakDuration,
    breakTimeStart: v.breakTimeStart,
    breakTimeEnd: v.breakTimeEnd,
  };
}

function toVroomConfig(c: Scenario["config"]): VroomConfig {
  return {
    depot: {
      latitude: c.depot.latitude,
      longitude: c.depot.longitude,
      timeWindowStart: c.depot.timeWindowStart,
      timeWindowEnd: c.depot.timeWindowEnd,
    },
    objective: c.objective,
    profile: c.profile,
    balanceVisits: c.balanceVisits,
    maxDistanceKm: c.maxDistanceKm,
    maxTravelTimeMinutes: c.maxTravelTimeMinutes,
    trafficFactor: c.trafficFactor,
    routeEndMode: c.routeEndMode,
    endDepot: c.endDepot,
    openStart: c.openStart,
    minimizeVehicles: c.minimizeVehicles,
    flexibleTimeWindows: c.flexibleTimeWindows,
    maxRoutes: c.maxRoutes,
  };
}

// ─── Conversion: VROOM output → AggregatedPlan ─────────────────────────

/**
 * The routing-quality harness doesn't run the full runner pipeline, so
 * driver assignment is a stub: every route gets a synthetic perfect
 * assignment. The verifier only consumes assignmentQuality for the
 * driver-level checks, which the harness deliberately ignores.
 */
function toAssignedRoute(
  vroomRoute: Awaited<ReturnType<typeof vroomOptimizeRoutes>>["routes"][number],
): AssignedSolvedRoute {
  const stops: SolvedStop[] = vroomRoute.stops.map((s) => ({
    orderId: s.orderId,
    trackingId: s.trackingId,
    sequence: s.sequence,
    address: s.address,
    latitude: s.latitude,
    longitude: s.longitude,
    estimatedArrival:
      s.arrivalTime !== undefined ? secondsToHHMM(s.arrivalTime) : undefined,
    waitingTimeSeconds: s.waitingTime,
  }));

  return {
    routeId: `route-${vroomRoute.vehicleId}`,
    vehicleId: vroomRoute.vehicleId,
    vehicleIdentifier: vroomRoute.vehiclePlate,
    stops,
    totalDistance: vroomRoute.totalDistance,
    totalDuration: vroomRoute.totalDuration,
    totalServiceTime: vroomRoute.totalServiceTime,
    totalTravelTime: vroomRoute.totalTravelTime,
    capacityUsed: {
      WEIGHT: vroomRoute.totalWeight,
      VOLUME: vroomRoute.totalVolume,
    },
    utilizationPercentage: 0,
    timeWindowViolations: 0,
    geometry: vroomRoute.geometry,
    driverId: "harness-driver",
    driverName: "Harness Driver",
    assignmentQuality: { score: 100, warnings: [], errors: [] },
  };
}

function toAggregatedPlan(
  vroomOutput: Awaited<ReturnType<typeof vroomOptimizeRoutes>>,
  startedAt: number,
  config: Scenario["config"],
): AggregatedPlan {
  const routes = vroomOutput.routes.map(toAssignedRoute);
  const totalStops = routes.reduce((s, r) => s + r.stops.length, 0);
  return {
    routes,
    unassignedOrders: vroomOutput.unassigned.map((u) => ({
      orderId: u.orderId,
      trackingId: u.trackingId,
      reason: u.reason,
    })),
    driversWithoutRoutes: [],
    vehiclesWithoutRoutes: [],
    metrics: {
      totalRoutes: routes.length,
      totalStops,
      totalDistance: vroomOutput.metrics.totalDistance,
      totalDuration: vroomOutput.metrics.totalDuration,
      utilizationRate: 0,
      timeWindowComplianceRate: 100,
    },
    assignmentMetrics: {
      totalAssignments: routes.length,
      assignmentsWithWarnings: 0,
      assignmentsWithErrors: 0,
      averageScore: 100,
      skillCoverage: 100,
      licenseCompliance: 100,
      fleetAlignment: 100,
      workloadBalance: 100,
    },
    summary: {
      optimizedAt: new Date().toISOString(),
      objective: config.objective,
      processingTimeMs: Date.now() - startedAt,
      engineUsed: SOLVER_NAME,
    },
    depot: {
      latitude: config.depot.latitude,
      longitude: config.depot.longitude,
    },
  };
}

// ─── Scenario runner ──────────────────────────────────────────────────

async function runScenario(scenario: Scenario): Promise<RunEntry> {
  const start = Date.now();
  try {
    const vroomOutput = await vroomOptimizeRoutes(
      scenario.orders.map(toVroomOrder),
      scenario.vehicles.map(toVroomVehicle),
      toVroomConfig(scenario.config),
    );
    const plan = toAggregatedPlan(vroomOutput, start, scenario.config);
    const report = verify({
      orders: scenario.orders,
      vehicles: scenario.vehicles,
      config: scenario.config,
      plan,
    });
    const expectationFailures = evaluateExpectations(scenario.expected, report);
    return {
      scenario: scenario.name,
      description: scenario.description,
      solver: SOLVER_NAME,
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
      solver: SOLVER_NAME,
      ok: false,
      durationMs: Date.now() - start,
      error: message,
      expectationFailures: [`threw: ${message}`],
    };
  }
}

function evaluateExpectations(
  expected: ScenarioExpectations,
  report: VerificationReport,
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
  lines.push(
    `Scenarios: ${SCENARIOS.length} × 1 solver = ${entries.length} runs`,
  );
  lines.push("");
  const passCount = entries.filter((e) => e.ok).length;
  lines.push(`Passed: **${passCount}** / ${entries.length}`);
  lines.push("");

  lines.push("## Summary table");
  lines.push("");
  lines.push("| Scenario | VROOM |");
  lines.push("|---|---|");
  for (const scenario of SCENARIOS) {
    const vroom = entries.find(
      (e) => e.scenario === scenario.name && e.solver === SOLVER_NAME,
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
    lines.push(`| ${scenario.name} | ${cell(vroom)} |`);
  }
  lines.push("");

  lines.push("## Per-scenario detail");
  lines.push("");
  for (const scenario of SCENARIOS) {
    lines.push(`### ${scenario.name}`);
    lines.push("");
    lines.push(scenario.description);
    lines.push("");
    const e = entries.find(
      (x) => x.scenario === scenario.name && x.solver === SOLVER_NAME,
    );
    if (!e) continue;
    lines.push(`**VROOM** — ${e.ok ? "PASS" : "FAIL"} in ${e.durationMs}ms`);
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
    const firstHard = r.violations
      .filter((v) => v.severity === "HARD")
      .slice(0, 3);
    if (firstHard.length > 0) {
      lines.push("- sample hard violations:");
      for (const v of firstHard) {
        const where = v.trackingId
          ? ` (order ${v.trackingId})`
          : v.vehicleIdentifier
            ? ` (veh ${v.vehicleIdentifier})`
            : "";
        const exp = v.expected !== undefined ? ` expected=${v.expected}` : "";
        const act = v.actual !== undefined ? ` actual=${v.actual}` : "";
        lines.push(`  - [${v.code}]${where}${exp}${act}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

  const entries: RunEntry[] = [];

  for (const scenario of SCENARIOS) {
    process.stdout.write(`  → ${scenario.name} / ${SOLVER_NAME} ...`);
    const entry = await runScenario(scenario);
    entries.push(entry);
    const status = entry.ok ? "✓" : entry.error ? "⚠" : "✗";
    process.stdout.write(` ${status} (${entry.durationMs}ms)\n`);
    if (entry.report) {
      await writeFile(
        resolve(OUT_DIR, `${scenario.name}.vroom.json`),
        JSON.stringify(entry.report, null, 2),
      );
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
