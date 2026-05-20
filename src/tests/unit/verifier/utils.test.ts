import { describe, expect, test } from "bun:test";
import type { SolvedStop } from "@/lib/optimization/solved-plan";
import {
  hhmmToSeconds,
  normalizeArrivalSeconds,
  secondsToHHMM,
  stopArrivalSeconds,
  sumBy,
} from "@/lib/optimization/verifier/utils";

/**
 * Verifier utils are the bridge between the canonical SolvedStop
 * ("HH:MM" arrival) and the verifier checkers (which think in seconds).
 * Mistakes here ripple into every check (time windows, integrity, etc.),
 * so the conversions need to be tight.
 */

describe("hhmmToSeconds", () => {
  test("parses HH:MM", () => {
    expect(hhmmToSeconds("08:30")).toBe(8 * 3600 + 30 * 60);
    expect(hhmmToSeconds("14:00")).toBe(14 * 3600);
  });

  test("parses HH:MM:SS", () => {
    expect(hhmmToSeconds("08:30:15")).toBe(8 * 3600 + 30 * 60 + 15);
  });

  test("parses ISO datetime by taking the time portion", () => {
    expect(hhmmToSeconds("2026-05-08T09:15:00")).toBe(9 * 3600 + 15 * 60);
  });

  test("returns null for empty / nullish", () => {
    expect(hhmmToSeconds(undefined)).toBeNull();
    expect(hhmmToSeconds(null)).toBeNull();
    expect(hhmmToSeconds("")).toBeNull();
  });

  test("returns null when the format is malformed", () => {
    expect(hhmmToSeconds("not-a-time")).toBeNull();
    expect(hhmmToSeconds("8h30")).toBeNull();
  });

  test("midnight is zero", () => {
    expect(hhmmToSeconds("00:00")).toBe(0);
  });
});

describe("secondsToHHMM", () => {
  test("formats with zero-padding", () => {
    expect(secondsToHHMM(8 * 3600 + 5 * 60)).toBe("08:05");
    expect(secondsToHHMM(0)).toBe("00:00");
  });

  test("drops sub-minute remainder", () => {
    expect(secondsToHHMM(8 * 3600 + 5 * 60 + 59)).toBe("08:05");
  });

  test("round-trips through hhmmToSeconds", () => {
    const samples = ["00:00", "08:30", "14:15", "23:59"];
    for (const t of samples) {
      const sec = hhmmToSeconds(t);
      expect(sec).not.toBeNull();
      expect(secondsToHHMM(sec as number)).toBe(t);
    }
  });
});

describe("normalizeArrivalSeconds", () => {
  test("returns the value when it is a normal time-of-day", () => {
    expect(normalizeArrivalSeconds(30000)).toBe(30000);
    expect(normalizeArrivalSeconds(0)).toBe(0);
  });

  test("modulo-normalizes solver outputs above 2 days", () => {
    // Pretend the solver gave us an absolute epoch-ish value
    const value = 86400 * 3 + 1234;
    expect(normalizeArrivalSeconds(value)).toBe(1234);
  });

  test("returns null for negative or non-finite inputs", () => {
    expect(normalizeArrivalSeconds(-5)).toBeNull();
    expect(normalizeArrivalSeconds(Number.NaN)).toBeNull();
    expect(normalizeArrivalSeconds(Number.POSITIVE_INFINITY)).toBeNull();
  });

  test("returns null when undefined", () => {
    expect(normalizeArrivalSeconds(undefined)).toBeNull();
  });
});

describe("stopArrivalSeconds", () => {
  function stop(arrival?: string): SolvedStop {
    return {
      orderId: "order",
      trackingId: "TRK",
      sequence: 1,
      address: "x",
      latitude: 0,
      longitude: 0,
      estimatedArrival: arrival,
    };
  }

  test("converts the SolvedStop arrival to seconds", () => {
    expect(stopArrivalSeconds(stop("09:15"))).toBe(9 * 3600 + 15 * 60);
  });

  test("returns null when the stop has no estimatedArrival", () => {
    expect(stopArrivalSeconds(stop(undefined))).toBeNull();
  });
});

describe("sumBy", () => {
  test("sums via selector", () => {
    expect(sumBy([{ x: 1 }, { x: 2 }, { x: 3 }], (it) => it.x)).toBe(6);
  });

  test("treats falsy / NaN selector results as zero", () => {
    expect(
      sumBy(
        [{ x: 5 }, { x: Number.NaN }, { x: undefined as unknown as number }],
        (it) => it.x,
      ),
    ).toBe(5);
  });

  test("empty input is zero", () => {
    expect(sumBy([] as { x: number }[], (it) => it.x)).toBe(0);
  });
});
