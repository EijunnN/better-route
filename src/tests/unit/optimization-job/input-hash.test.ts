import { describe, expect, test } from "bun:test";
// Import the implementation directly (not the lifecycle barrel) to bypass
// the global preload mock that stubs the lifecycle module.
import { calculateInputHash } from "@/lib/optimization/optimization-job/input-hash";

/**
 * `calculateInputHash` is the cache key for completed OptimizationJobs.
 * Same logical inputs ⇒ same hash ⇒ /api/optimization/jobs returns the
 * cached result instead of re-running VROOM. Stability and ordering
 * invariance are correctness-critical.
 */
describe("calculateInputHash", () => {
  test("is deterministic for identical inputs", () => {
    const a = calculateInputHash("cfg-1", ["v1", "v2"], ["d1"], ["o1", "o2"]);
    const b = calculateInputHash("cfg-1", ["v1", "v2"], ["d1"], ["o1", "o2"]);
    expect(a).toBe(b);
  });

  test("returns a 64-char sha256 hex digest", () => {
    const hash = calculateInputHash("cfg-1", ["v1"], ["d1"], ["o1"]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is invariant to vehicle id ordering", () => {
    const a = calculateInputHash("cfg-1", ["v1", "v2", "v3"], ["d1"], ["o1"]);
    const b = calculateInputHash("cfg-1", ["v3", "v1", "v2"], ["d1"], ["o1"]);
    expect(a).toBe(b);
  });

  test("is invariant to driver id ordering", () => {
    const a = calculateInputHash("cfg-1", ["v1"], ["d1", "d2"], ["o1"]);
    const b = calculateInputHash("cfg-1", ["v1"], ["d2", "d1"], ["o1"]);
    expect(a).toBe(b);
  });

  test("is invariant to pending order id ordering", () => {
    const a = calculateInputHash("cfg-1", ["v1"], ["d1"], ["o1", "o2", "o3"]);
    const b = calculateInputHash("cfg-1", ["v1"], ["d1"], ["o3", "o2", "o1"]);
    expect(a).toBe(b);
  });

  test("changes when configurationId changes", () => {
    const a = calculateInputHash("cfg-1", ["v1"], ["d1"], ["o1"]);
    const b = calculateInputHash("cfg-2", ["v1"], ["d1"], ["o1"]);
    expect(a).not.toBe(b);
  });

  test("changes when an order id is added (cache must miss after new orders arrive)", () => {
    const before = calculateInputHash("cfg-1", ["v1"], ["d1"], ["o1"]);
    const after = calculateInputHash("cfg-1", ["v1"], ["d1"], ["o1", "o2"]);
    expect(before).not.toBe(after);
  });

  test("changes when a driver is removed from the run", () => {
    const before = calculateInputHash("cfg-1", ["v1"], ["d1", "d2"], ["o1"]);
    const after = calculateInputHash("cfg-1", ["v1"], ["d1"], ["o1"]);
    expect(before).not.toBe(after);
  });

  test("empty arrays produce a stable hash distinct from non-empty", () => {
    const empty = calculateInputHash("cfg-1", [], [], []);
    const nonEmpty = calculateInputHash("cfg-1", ["v1"], [], []);
    expect(empty).toMatch(/^[0-9a-f]{64}$/);
    expect(empty).not.toBe(nonEmpty);
  });
});
