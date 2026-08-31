import { describe, expect, test } from "bun:test";
import {
  formatInstant,
  formatStopEta,
  formatWallClock,
} from "@/lib/utils/wall-clock";

/**
 * El seam manda horas de pared e instantes reales con el mismo formato ISO.
 * Tratar una ventana de entrega como instante le resta el offset del
 * navegador: en Perú, una cargada de 9 a 14 se mostraba de 4 a 9.
 */
describe("formatWallClock", () => {
  test("conserva los dígitos que cargó el operador", () => {
    expect(formatWallClock("2026-08-31T09:00:00.000Z")).toBe("09:00");
    expect(formatWallClock("2026-08-31T14:00:00.000Z")).toBe("14:00");
  });

  test("no depende de la zona de quien mira", () => {
    // El mismo instante leído como hora de pared da siempre lo mismo, sea
    // cual sea el TZ del proceso.
    const antes = process.env.TZ;
    for (const tz of ["America/Lima", "UTC", "Asia/Tokyo"]) {
      process.env.TZ = tz;
      expect(formatWallClock("2026-08-31T09:00:00.000Z")).toBe("09:00");
    }
    process.env.TZ = antes;
  });

  test("devuelve el fallback ante nulos o basura", () => {
    expect(formatWallClock(null)).toBe("--:--");
    expect(formatWallClock(undefined)).toBe("--:--");
    expect(formatWallClock("no es fecha")).toBe("--:--");
    expect(formatWallClock(null, "sin dato")).toBe("sin dato");
  });
});

describe("formatStopEta", () => {
  test("el ETA en vivo manda y se lee como instante", () => {
    // Se compara contra el mismo cálculo: el resultado depende del TZ a
    // propósito, porque es un momento absoluto.
    const iso = "2026-08-31T16:30:00.000Z";
    expect(formatStopEta(iso, "2026-08-31T11:05:00.000Z")).toBe(
      formatInstant(iso),
    );
  });

  test("sin ETA en vivo cae al horario del plan, sin correrlo", () => {
    expect(formatStopEta(null, "2026-08-31T11:05:00.000Z")).toBe("11:05");
  });

  test("sin ninguno de los dos, fallback", () => {
    expect(formatStopEta(null, null)).toBe("--:--");
  });
});
