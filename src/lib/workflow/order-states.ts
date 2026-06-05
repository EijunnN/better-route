/**
 * Crystalized Order-status state machine.
 *
 * The sibling of `states.ts` (which governs RouteStop status) but for the
 * Order lifecycle. Unlike the Stop graph — whose transitions are also
 * duplicated as `STOP_STATUS_TRANSITIONS` in the schema — this module is
 * the SINGLE source of truth for which Order transitions are legal.
 *
 * Reversion / cancellation / reactivation flows mutate `orders.status` ONLY
 * through `applyOrderTransition` (which calls `assertOrderTransition`, locks
 * optimistically and appends to `order_status_history`). The generic order
 * PATCH no longer writes status at all. Two forward writers stay direct by
 * design: plan confirm (PENDING→ASSIGNED, audited at plan level) and the
 * stop→order driver sync (audited per-transition with the `driver_sync`
 * source).
 *
 * Terminal states: COMPLETED and CANCELLED. FAILED is NOT terminal (it can
 * be reactivated to PENDING / retried). COMPLETED can only be undone via a
 * privileged path (Action.REVERT), never the normal graph. CANCELLED is
 * definitively terminal — not even a privileged revert resurrects it
 * (ADR-0005).
 */

import type { ORDER_STATUS } from "@/db/schema/orders";

export type OrderState = keyof typeof ORDER_STATUS;

/**
 * Normal transition graph. Derived from the semantics of last-mile
 * delivery and kept consistent with the Stop→Order sync map
 * (`STOP_TO_ORDER_STATUS`): a stop going PENDING→FAILED drives the order
 * ASSIGNED→FAILED, an undo-start (stop IN_PROGRESS→PENDING) drives the
 * order IN_PROGRESS→ASSIGNED, etc.
 */
export const ALLOWED_ORDER_TRANSITIONS: Record<OrderState, OrderState[]> = {
  PENDING: ["ASSIGNED", "CANCELLED"],
  // PENDING here = unassigned from a plan (see /unassign).
  ASSIGNED: ["IN_PROGRESS", "FAILED", "PENDING", "CANCELLED"],
  // ASSIGNED here = undo-start (driver reverts a mistaken IN_PROGRESS);
  // CANCELLED allows aborting a delivery already under way.
  IN_PROGRESS: ["COMPLETED", "FAILED", "ASSIGNED", "CANCELLED"],
  COMPLETED: [],
  FAILED: ["PENDING", "CANCELLED"],
  CANCELLED: [],
};

/**
 * Privileged reversions of an otherwise-terminal state. Reachable ONLY
 * with an elevated permission (Action.REVERT), never through the normal
 * graph — a COMPLETED delivery can be undone, but only deliberately and by
 * someone who holds `order:revert`. CANCELLED stays definitively terminal.
 */
export const PRIVILEGED_REVERT_TRANSITIONS: Partial<
  Record<OrderState, OrderState[]>
> = {
  COMPLETED: ["PENDING"],
};

export const ORDER_TERMINAL_STATES: ReadonlySet<OrderState> = new Set([
  "COMPLETED",
  "CANCELLED",
]);

export function isOrderTerminal(state: OrderState): boolean {
  return ORDER_TERMINAL_STATES.has(state);
}

/**
 * Whether `from → to` is a legal order transition. A same-state move is a
 * no-op and is treated as legal (callers decide whether to record it).
 * Pass `{ privileged: true }` to also allow the elevated revert edges.
 */
export function canOrderTransition(
  from: OrderState,
  to: OrderState,
  opts: { privileged?: boolean } = {},
): boolean {
  if (from === to) return true;
  if (ALLOWED_ORDER_TRANSITIONS[from].includes(to)) return true;
  if (
    opts.privileged &&
    (PRIVILEGED_REVERT_TRANSITIONS[from] ?? []).includes(to)
  ) {
    return true;
  }
  return false;
}

export class InvalidOrderTransitionError extends Error {
  public readonly code = "INVALID_ORDER_TRANSITION";
  constructor(
    public readonly from: OrderState,
    public readonly to: OrderState,
  ) {
    super(`Invalid order transition ${from} → ${to}`);
    this.name = "InvalidOrderTransitionError";
  }
}

export function assertOrderTransition(
  from: OrderState,
  to: OrderState,
  opts: { privileged?: boolean } = {},
): void {
  if (!canOrderTransition(from, to, opts)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}
