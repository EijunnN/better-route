import { describe, expect, test } from "bun:test";
// Import the implementation directly (not the lifecycle barrel) to bypass
// the global preload mock that stubs the lifecycle module.
import {
  calculateInputHash,
  type HashableOrderRef,
} from "@/lib/optimization/optimization-job/input-hash";

const refs = (...ids: string[]): HashableOrderRef[] =>
  ids.map((id) => ({ id }));

/**
 * `calculateInputHash` is the cache key for completed OptimizationJobs.
 * Same logical inputs ⇒ same hash ⇒ /api/optimization/jobs returns the
 * cached result instead of re-running VROOM. Stability, ordering invariance
 * AND content sensitivity (updatedAt stamps) are correctness-critical:
 * hashing only ids used to return stale plans after the operator edited
 * order coordinates or the preset.
 */
describe("calculateInputHash", () => {
  test("is deterministic for identical inputs", () => {
    const a = calculateInputHash(
      "cfg-1",
      ["v1", "v2"],
      ["d1"],
      refs("o1", "o2"),
    );
    const b = calculateInputHash(
      "cfg-1",
      ["v1", "v2"],
      ["d1"],
      refs("o1", "o2"),
    );
    expect(a).toBe(b);
  });

  test("returns a 64-char sha256 hex digest", () => {
    const hash = calculateInputHash("cfg-1", ["v1"], ["d1"], refs("o1"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is invariant to vehicle id ordering", () => {
    const a = calculateInputHash(
      "cfg-1",
      ["v1", "v2", "v3"],
      ["d1"],
      refs("o1"),
    );
    const b = calculateInputHash(
      "cfg-1",
      ["v3", "v1", "v2"],
      ["d1"],
      refs("o1"),
    );
    expect(a).toBe(b);
  });

  test("is invariant to driver id ordering", () => {
    const a = calculateInputHash("cfg-1", ["v1"], ["d1", "d2"], refs("o1"));
    const b = calculateInputHash("cfg-1", ["v1"], ["d2", "d1"], refs("o1"));
    expect(a).toBe(b);
  });

  test("is invariant to pending order ordering", () => {
    const a = calculateInputHash(
      "cfg-1",
      ["v1"],
      ["d1"],
      refs("o1", "o2", "o3"),
    );
    const b = calculateInputHash(
      "cfg-1",
      ["v1"],
      ["d1"],
      refs("o3", "o2", "o1"),
    );
    expect(a).toBe(b);
  });

  test("changes when configurationId changes", () => {
    const a = calculateInputHash("cfg-1", ["v1"], ["d1"], refs("o1"));
    const b = calculateInputHash("cfg-2", ["v1"], ["d1"], refs("o1"));
    expect(a).not.toBe(b);
  });

  test("changes when an order id is added (cache must miss after new orders arrive)", () => {
    const before = calculateInputHash("cfg-1", ["v1"], ["d1"], refs("o1"));
    const after = calculateInputHash("cfg-1", ["v1"], ["d1"], refs("o1", "o2"));
    expect(before).not.toBe(after);
  });

  test("changes when a driver is removed from the run", () => {
    const before = calculateInputHash(
      "cfg-1",
      ["v1"],
      ["d1", "d2"],
      refs("o1"),
    );
    const after = calculateInputHash("cfg-1", ["v1"], ["d1"], refs("o1"));
    expect(before).not.toBe(after);
  });

  test("changes when an order's updatedAt changes (edited coords/windows must miss the cache)", () => {
    const before = calculateInputHash(
      "cfg-1",
      ["v1"],
      ["d1"],
      [{ id: "o1", updatedAt: new Date("2026-07-01T10:00:00Z") }],
    );
    const after = calculateInputHash(
      "cfg-1",
      ["v1"],
      ["d1"],
      [{ id: "o1", updatedAt: new Date("2026-07-01T11:30:00Z") }],
    );
    expect(before).not.toBe(after);
  });

  test("accepts Date and ISO string updatedAt interchangeably", () => {
    const asDate = calculateInputHash(
      "cfg-1",
      ["v1"],
      ["d1"],
      [{ id: "o1", updatedAt: new Date("2026-07-01T10:00:00.000Z") }],
    );
    const asString = calculateInputHash(
      "cfg-1",
      ["v1"],
      ["d1"],
      [{ id: "o1", updatedAt: "2026-07-01T10:00:00.000Z" }],
    );
    expect(asDate).toBe(asString);
  });

  test("changes when the configuration is edited (configurationUpdatedAt stamp)", () => {
    const before = calculateInputHash("cfg-1", ["v1"], ["d1"], refs("o1"), {
      configurationUpdatedAt: new Date("2026-07-01T10:00:00Z"),
    });
    const after = calculateInputHash("cfg-1", ["v1"], ["d1"], refs("o1"), {
      configurationUpdatedAt: new Date("2026-07-01T12:00:00Z"),
    });
    expect(before).not.toBe(after);
  });

  test("changes when the preset is edited (presetUpdatedAt stamp)", () => {
    const before = calculateInputHash("cfg-1", ["v1"], ["d1"], refs("o1"), {
      presetUpdatedAt: new Date("2026-07-01T10:00:00Z"),
    });
    const after = calculateInputHash("cfg-1", ["v1"], ["d1"], refs("o1"), {
      presetUpdatedAt: new Date("2026-07-01T12:00:00Z"),
    });
    expect(before).not.toBe(after);
  });

  test("empty arrays produce a stable hash distinct from non-empty", () => {
    const empty = calculateInputHash("cfg-1", [], [], []);
    const nonEmpty = calculateInputHash("cfg-1", ["v1"], [], []);
    expect(empty).toMatch(/^[0-9a-f]{64}$/);
    expect(empty).not.toBe(nonEmpty);
  });
});
