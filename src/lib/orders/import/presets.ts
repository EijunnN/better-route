import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { timeWindowPresets } from "@/db/schema";
import { createValidationError } from "./errors";
import {
  type CSVValidationError,
  ERROR_TYPES,
} from "./types";

/**
 * Load all active time window presets for a company.
 * Returns maps for lookup by ID and by name (case-insensitive).
 */
export async function loadTimeWindowPresets(companyId: string) {
  const presets = await db
    .select({
      id: timeWindowPresets.id,
      name: timeWindowPresets.name,
      startTime: timeWindowPresets.startTime,
      endTime: timeWindowPresets.endTime,
      strictness: timeWindowPresets.strictness,
    })
    .from(timeWindowPresets)
    .where(
      and(
        eq(timeWindowPresets.companyId, companyId),
        eq(timeWindowPresets.active, true),
      ),
    );

  const byId = new Map(presets.map((p) => [p.id, p]));
  const byName = new Map(presets.map((p) => [p.name.toUpperCase().trim(), p]));

  return { byId, byName };
}

/**
 * Resolve time window presets (by ID or by name) into direct time window fields.
 * Priority: direct timeWindowStart/End > presetId > presetName.
 * Mutates orderDataList in place to set timeWindowStart, timeWindowEnd, timeWindowPresetId, strictness.
 */
export async function resolveTimeWindowPresets(
  orderDataList: Array<Record<string, string>>,
  companyId: string,
): Promise<CSVValidationError[]> {
  const errors: CSVValidationError[] = [];
  const { byId, byName } = await loadTimeWindowPresets(companyId);

  orderDataList.forEach((data, index) => {
    // Skip if direct time windows are already set
    if (data.timeWindowStart && data.timeWindowEnd) {
      return;
    }

    // Try to resolve by preset ID
    if (data.timeWindowPresetId) {
      const preset = byId.get(data.timeWindowPresetId);
      if (!preset) {
        errors.push(
          createValidationError(
            index + 2,
            "timeWindowPresetId",
            `Preset de ventana horaria no encontrado o inactivo: ${data.timeWindowPresetId}`,
            "critical",
            ERROR_TYPES.REFERENCE,
            data.timeWindowPresetId,
          ),
        );
        return;
      }
      // Populate time windows from preset
      if (preset.startTime && preset.endTime) {
        data.timeWindowStart = String(preset.startTime);
        data.timeWindowEnd = String(preset.endTime);
      }
      if (preset.strictness && !data.strictness) {
        data.strictness = preset.strictness;
      }
      return;
    }

    // Try to resolve by preset name (e.g., "TARDE", "MAÑANA")
    if (data.timeWindowPresetName) {
      const nameKey = data.timeWindowPresetName.toUpperCase().trim();
      const preset = byName.get(nameKey);
      if (!preset) {
        errors.push(
          createValidationError(
            index + 2,
            "timeWindowPresetName",
            `Preset de ventana horaria "${data.timeWindowPresetName}" no encontrado. Presets disponibles: ${[...byName.keys()].join(", ")}`,
            "critical",
            ERROR_TYPES.REFERENCE,
            data.timeWindowPresetName,
          ),
        );
        return;
      }
      // Populate time windows and preset ID from resolved preset
      data.timeWindowPresetId = preset.id;
      if (preset.startTime && preset.endTime) {
        data.timeWindowStart = String(preset.startTime);
        data.timeWindowEnd = String(preset.endTime);
      }
      if (preset.strictness && !data.strictness) {
        data.strictness = preset.strictness;
      }
    }
  });

  return errors;
}
