import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { optimizationConfigurations, optimizationPresets } from "@/db/schema";
import type { DepotConfig, OptimizationConfig } from "./vroom-optimizer";

type OptimizationPreset = typeof optimizationPresets.$inferSelect;

/**
 * Resolve the preset that should drive a VROOM run for this tenant.
 *
 * Priority:
 *   1. The preset bound to the configuration (`configurationId.optimizationPresetId`).
 *   2. The company's `isDefault` active preset.
 *   3. `null` — caller falls back to system defaults.
 *
 * Both the initial optimization runner and the reassign endpoint use
 * this — keeping the resolution rules in one place is what closes the
 * gap that produced the "reassign ignores routeEndMode" bug.
 */
export async function loadOptimizationPreset(opts: {
  companyId: string;
  configurationId?: string | null;
}): Promise<OptimizationPreset | null> {
  if (opts.configurationId) {
    const config = await db.query.optimizationConfigurations.findFirst({
      where: and(
        eq(optimizationConfigurations.id, opts.configurationId),
        eq(optimizationConfigurations.companyId, opts.companyId),
      ),
      columns: { optimizationPresetId: true },
    });
    if (config?.optimizationPresetId) {
      const preset = await db.query.optimizationPresets.findFirst({
        where: and(
          eq(optimizationPresets.id, config.optimizationPresetId),
          eq(optimizationPresets.companyId, opts.companyId),
          eq(optimizationPresets.active, true),
        ),
      });
      if (preset) return preset;
    }
  }

  const fallback = await db.query.optimizationPresets.findFirst({
    where: and(
      eq(optimizationPresets.companyId, opts.companyId),
      eq(optimizationPresets.isDefault, true),
      eq(optimizationPresets.active, true),
    ),
  });
  return fallback ?? null;
}

/**
 * Map a preset row onto the shape VROOM expects. Centralizing this so
 * the reassign path can never again drift from the initial run path —
 * the bug we hit was a hand-built `{ depot, objective }` config that
 * silently dropped routeEndMode/endDepot/openStart/etc.
 */
export function buildVroomConfigFromPreset(opts: {
  preset: OptimizationPreset | null;
  depot: DepotConfig;
  objective?: OptimizationConfig["objective"];
  profile?: OptimizationConfig["profile"];
}): OptimizationConfig {
  const { preset, depot, objective, profile } = opts;
  return {
    depot,
    objective: objective ?? "DISTANCE",
    profile,
    balanceVisits: preset?.balanceVisits ?? false,
    maxDistanceKm: preset?.maxDistanceKm ?? undefined,
    maxTravelTimeMinutes: undefined,
    trafficFactor: preset?.trafficFactor ?? 1.0,
    routeEndMode:
      (preset?.routeEndMode as OptimizationConfig["routeEndMode"]) ??
      "DRIVER_ORIGIN",
    endDepot:
      preset?.endDepotLatitude && preset?.endDepotLongitude
        ? {
            latitude: parseFloat(preset.endDepotLatitude),
            longitude: parseFloat(preset.endDepotLongitude),
            address: preset.endDepotAddress ?? undefined,
          }
        : undefined,
    openStart: preset?.openStart ?? false,
    minimizeVehicles: preset?.minimizeVehicles ?? false,
    flexibleTimeWindows: preset?.flexibleTimeWindows ?? false,
  };
}
