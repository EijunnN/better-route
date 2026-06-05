import { describe, expect, test } from "bun:test";
import {
  ALLOWED_ORDER_TRANSITIONS,
  assertOrderTransition,
  canOrderTransition,
  InvalidOrderTransitionError,
  isOrderTerminal,
  type OrderState,
} from "@/lib/workflow/order-states";

const ALL: OrderState[] = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

describe("order state machine", () => {
  test("same-state is always a legal no-op", () => {
    for (const s of ALL) expect(canOrderTransition(s, s)).toBe(true);
  });

  test("only ALLOWED_ORDER_TRANSITIONS edges are legal (exhaustive matrix)", () => {
    for (const from of ALL) {
      for (const to of ALL) {
        if (from === to) continue;
        const legal = ALLOWED_ORDER_TRANSITIONS[from].includes(to);
        expect(canOrderTransition(from, to)).toBe(legal);
      }
    }
  });

  test("COMPLETED and CANCELLED are terminal in the normal graph", () => {
    expect(isOrderTerminal("COMPLETED")).toBe(true);
    expect(isOrderTerminal("CANCELLED")).toBe(true);
    expect(ALLOWED_ORDER_TRANSITIONS.COMPLETED).toEqual([]);
    expect(ALLOWED_ORDER_TRANSITIONS.CANCELLED).toEqual([]);
  });

  test("FAILED is NOT terminal — it can be reactivated", () => {
    expect(isOrderTerminal("FAILED")).toBe(false);
    expect(canOrderTransition("FAILED", "PENDING")).toBe(true);
  });

  test("COMPLETED→PENDING is illegal normally but legal when privileged (revert)", () => {
    expect(canOrderTransition("COMPLETED", "PENDING")).toBe(false);
    expect(
      canOrderTransition("COMPLETED", "PENDING", { privileged: true }),
    ).toBe(true);
  });

  test("CANCELLED stays definitively terminal even when privileged (ADR-0005)", () => {
    for (const to of ALL) {
      if (to === "CANCELLED") continue;
      expect(canOrderTransition("CANCELLED", to, { privileged: true })).toBe(
        false,
      );
    }
  });

  test("every stop→order driver-sync transition is legal", () => {
    expect(canOrderTransition("ASSIGNED", "IN_PROGRESS")).toBe(true); // start
    expect(canOrderTransition("IN_PROGRESS", "COMPLETED")).toBe(true); // deliver
    expect(canOrderTransition("IN_PROGRESS", "FAILED")).toBe(true); // fail
    expect(canOrderTransition("ASSIGNED", "FAILED")).toBe(true); // PENDING stop failed
    expect(canOrderTransition("IN_PROGRESS", "ASSIGNED")).toBe(true); // undo start
    expect(canOrderTransition("FAILED", "PENDING")).toBe(true); // reopen/reactivate
  });

  test("assertOrderTransition throws on illegal, passes on legal/privileged", () => {
    expect(() => assertOrderTransition("FAILED", "ASSIGNED")).toThrow(
      InvalidOrderTransitionError,
    );
    expect(() => assertOrderTransition("COMPLETED", "PENDING")).toThrow(
      InvalidOrderTransitionError,
    );
    expect(() =>
      assertOrderTransition("COMPLETED", "PENDING", { privileged: true }),
    ).not.toThrow();
    expect(() => assertOrderTransition("PENDING", "ASSIGNED")).not.toThrow();
  });
});
