/**
 * Time window preset plumbing for the optimization runner.
 *
 * Orders can declare their time window in one of two ways:
 *   1. Explicit `timeWindowStart` / `timeWindowEnd` columns (set manually or
 *      resolved at CSV-import time by the pipeline).
 *   2. A `timeWindowPresetId` pointing at a row in `time_window_presets`.
 *
 * The form in the web UI takes path (2) — it saves only the preset ID and
 * leaves the explicit columns null. The runner previously read only the
 * explicit columns, so orders created from the form reached VROOM without
 * any time window. These helpers close that gap by loading the presets
 * once per optimization run and resolving the effective (start, end) pair
 * per order type (RANGE, SHIFT, EXACT).
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { timeWindowPresets } from "@/db/schema";

export interface ResolvedPreset {
  type: "RANGE" | "SHIFT" | "EXACT";
  startTime: string | null;
  endTime: string | null;
  exactTime: string | null;
  toleranceMinutes: number | null;
}

/**
 * Fetch all active presets for the given company, keyed by id. Using one
 * query up front avoids N+1 when the runner loops over orders.
 */
export async function loadTimeWindowPresetsMap(
  companyId: string,
): Promise<Map<string, ResolvedPreset>> {
  const rows = await db
    .select({
      id: timeWindowPresets.id,
      type: timeWindowPresets.type,
      startTime: timeWindowPresets.startTime,
      endTime: timeWindowPresets.endTime,
      exactTime: timeWindowPresets.exactTime,
      toleranceMinutes: timeWindowPresets.toleranceMinutes,
    })
    .from(timeWindowPresets)
    .where(
      and(
        eq(timeWindowPresets.companyId, companyId),
        eq(timeWindowPresets.active, true),
      ),
    );

  return new Map(
    rows.map((r) => [
      r.id,
      {
        type: r.type as ResolvedPreset["type"],
        startTime: r.startTime,
        endTime: r.endTime,
        exactTime: r.exactTime,
        toleranceMinutes: r.toleranceMinutes,
      },
    ]),
  );
}

/**
 * Postgres `time` columns come back as "HH:MM:SS". VROOM's adapter and the
 * CSV format elsewhere in the codebase work with "HH:mm". Normalize here so
 * every consumer gets the same shape regardless of data source.
 */
function toHHmm(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 5);
}

/**
 * EXACT presets express an expected arrival (`exactTime`) with a ± tolerance.
 * Convert that to a half-open range VROOM can reason about. Clamps to the
 * same day — crossing midnight is not expected for a single stop.
 */
function exactToRange(
  exactTime: string,
  toleranceMinutes: number,
): { start: string; end: string } {
  const [h, m] = exactTime.split(":").map(Number);
  const total = h * 60 + m;
  const startTotal = Math.max(0, total - toleranceMinutes);
  const endTotal = Math.min(24 * 60 - 1, total + toleranceMinutes);
  const fmt = (mins: number) => {
    const hh = Math.floor(mins / 60).toString().padStart(2, "0");
    const mm = (mins % 60).toString().padStart(2, "0");
    return `${hh}:${mm}`;
  };
  return { start: fmt(startTotal), end: fmt(endTotal) };
}

/**
 * Resolve a preset (if any) into the (start, end) pair VROOM consumes. If
 * the order has an explicit start/end pair from the CSV pipeline or manual
 * input, that wins — the preset is a fallback, not an override.
 */
export function resolveTimeWindow(
  order: {
    timeWindowStart?: string | null;
    timeWindowEnd?: string | null;
    timeWindowPresetId?: string | null;
  },
  presetsById: Map<string, ResolvedPreset>,
): { start: string | null; end: string | null } {
  // Explicit values on the order win — treat the preset as a fallback only.
  if (order.timeWindowStart || order.timeWindowEnd) {
    return {
      start: order.timeWindowStart ? toHHmm(order.timeWindowStart) : null,
      end: order.timeWindowEnd ? toHHmm(order.timeWindowEnd) : null,
    };
  }

  if (!order.timeWindowPresetId) return { start: null, end: null };
  const preset = presetsById.get(order.timeWindowPresetId);
  if (!preset) return { start: null, end: null };

  switch (preset.type) {
    case "RANGE":
    case "SHIFT":
      return { start: toHHmm(preset.startTime), end: toHHmm(preset.endTime) };
    case "EXACT": {
      if (!preset.exactTime || preset.toleranceMinutes == null) {
        return { start: null, end: null };
      }
      const { start, end } = exactToRange(
        toHHmm(preset.exactTime)!,
        preset.toleranceMinutes,
      );
      return { start, end };
    }
    default:
      return { start: null, end: null };
  }
}
