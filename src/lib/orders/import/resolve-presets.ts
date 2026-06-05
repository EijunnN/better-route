import type { TimeWindowPresetRef } from "@/lib/orders/profile-schema";
import { createValidationError } from "./errors";
import { type CSVValidationError, ERROR_TYPES } from "./types";

/**
 * Resolve `timeWindowPresetId` (either a UUID or a preset *name*) against the
 * schema's bundled presets, mutating `normalized` in place. No DB call — the
 * schema already carries the presets.
 *
 * This is the single guard that keeps a human-typed preset name (e.g. the CSV
 * column `preset_horario` = "Turno 3") from reaching the `uuid` column and
 * failing the whole batch insert. A name that doesn't resolve becomes a
 * critical row error so the operator sees it in the preview instead of a
 * silent zero-insert.
 *
 * Returns any validation errors it encounters (empty array = clean).
 */
export function resolvePresetsInPlace(
  normalized: Record<string, unknown>,
  rowIndex: number,
  presets: TimeWindowPresetRef[],
): CSVValidationError[] {
  const errors: CSVValidationError[] = [];

  // Direct time windows take precedence over a preset reference.
  if (normalized.timeWindowStart && normalized.timeWindowEnd) {
    // A stray preset reference alongside explicit windows would still hit the
    // uuid column — drop it unless it's already a resolvable id/name.
    const rawRef = normalized.timeWindowPresetId;
    if (typeof rawRef === "string" && rawRef.trim() !== "") {
      const ref = rawRef.trim();
      const match =
        presets.find((p) => p.id === ref) ||
        presets.find((p) => p.name.toUpperCase() === ref.toUpperCase());
      normalized.timeWindowPresetId = match ? match.id : null;
    }
    return errors;
  }

  const rawRef = normalized.timeWindowPresetId;
  if (typeof rawRef !== "string" || rawRef.trim() === "") return errors;
  const ref = rawRef.trim();

  const preset =
    presets.find((p) => p.id === ref) ||
    presets.find((p) => p.name.toUpperCase() === ref.toUpperCase());

  if (!preset) {
    errors.push(
      createValidationError(
        rowIndex,
        "timeWindowPresetId",
        `Preset de ventana horaria no encontrado: ${ref}. ` +
          `Disponibles: ${presets.map((p) => p.name).join(", ") || "(ninguno)"}`,
        "critical",
        ERROR_TYPES.REFERENCE,
        ref,
      ),
    );
    return errors;
  }

  normalized.timeWindowPresetId = preset.id;
  if (preset.startTime && preset.endTime) {
    normalized.timeWindowStart = String(preset.startTime);
    normalized.timeWindowEnd = String(preset.endTime);
  }
  if (!normalized.strictness && preset.strictness) {
    normalized.strictness = preset.strictness;
  }
  return errors;
}
