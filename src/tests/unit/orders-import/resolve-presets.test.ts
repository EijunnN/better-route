import { describe, expect, test } from "bun:test";
import { resolvePresetsInPlace } from "@/lib/orders/import/resolve-presets";
import type { TimeWindowPresetRef } from "@/lib/orders/profile-schema";

/**
 * Regression guard for the silent zero-insert bug: a CSV `preset_horario`
 * value (a human-typed preset NAME) must resolve to the preset UUID before it
 * can reach the `uuid` column. An unknown name must surface as a row error,
 * never be passed through to fail the whole batch insert.
 */
const PRESETS: TimeWindowPresetRef[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Turno 3",
    type: "SHIFT",
    startTime: "15:00:00",
    endTime: "19:00:00",
    strictness: "HARD",
  },
];

describe("resolvePresetsInPlace", () => {
  test("resolves a preset name (case-insensitive) to its UUID + windows", () => {
    const normalized: Record<string, unknown> = {
      timeWindowPresetId: "turno 3",
    };
    const errors = resolvePresetsInPlace(normalized, 2, PRESETS);

    expect(errors).toHaveLength(0);
    expect(normalized.timeWindowPresetId).toBe(PRESETS[0].id);
    expect(normalized.timeWindowStart).toBe("15:00:00");
    expect(normalized.timeWindowEnd).toBe("19:00:00");
    expect(normalized.strictness).toBe("HARD");
  });

  test("accepts a raw UUID that matches an existing preset", () => {
    const normalized: Record<string, unknown> = {
      timeWindowPresetId: PRESETS[0].id,
    };
    const errors = resolvePresetsInPlace(normalized, 2, PRESETS);

    expect(errors).toHaveLength(0);
    expect(normalized.timeWindowPresetId).toBe(PRESETS[0].id);
  });

  test("an unknown preset name becomes a row error (not passed through)", () => {
    const normalized: Record<string, unknown> = {
      timeWindowPresetId: "PresetQueNoExiste",
    };
    const errors = resolvePresetsInPlace(normalized, 7, PRESETS);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("no encontrado");
    expect(errors[0].message).toContain("Turno 3");
  });

  test("no preset reference is a clean no-op", () => {
    const normalized: Record<string, unknown> = { trackingId: "X" };
    const errors = resolvePresetsInPlace(normalized, 2, PRESETS);

    expect(errors).toHaveLength(0);
    expect(normalized.timeWindowPresetId).toBeUndefined();
  });

  test("explicit windows + an unresolvable preset ref drops the ref (no uuid leak)", () => {
    const normalized: Record<string, unknown> = {
      timeWindowStart: "08:00",
      timeWindowEnd: "12:00",
      timeWindowPresetId: "Turno 3 (typo)",
    };
    const errors = resolvePresetsInPlace(normalized, 2, PRESETS);

    expect(errors).toHaveLength(0);
    expect(normalized.timeWindowPresetId).toBeNull();
    // Explicit windows are preserved.
    expect(normalized.timeWindowStart).toBe("08:00");
  });
});
