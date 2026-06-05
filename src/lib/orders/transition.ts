/**
 * Single transactional entry point for every Order.status change.
 *
 * Guarantees, in one transaction:
 *  - the transition is legal (`assertOrderTransition`);
 *  - it is atomic + optimistically locked (UPDATE ... WHERE status = from);
 *  - it is audited append-only in `order_status_history`;
 *  - dependent rows (route_stops, …) are converged via `effects` in the
 *    SAME transaction, so Order and RouteStop never drift apart;
 *  - it is idempotent when a `correlationId` is supplied.
 *
 * Pass an existing `tx` to enlist in a caller's transaction (e.g. the stop
 * reopen flow); otherwise the helper opens its own.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderStatusHistory, orders } from "@/db/schema";
import type { OrderStatusSource } from "@/db/schema/orders";
import {
  assertOrderTransition,
  InvalidOrderTransitionError,
  type OrderState,
} from "@/lib/workflow/order-states";

type OrderTransactionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type OrderTransitionResult = {
  order: typeof orders.$inferSelect | null;
  /** false when the call was a no-op (idempotent replay or same-state). */
  applied: boolean;
};

export type ApplyOrderTransitionOptions = {
  orderId: string;
  companyId: string;
  to: OrderState;
  source: OrderStatusSource;
  /** When set, the order must currently be in this state (optimistic guard). */
  expectedFrom?: OrderState;
  /** Allow the elevated revert edges (e.g. COMPLETED → PENDING). */
  privileged?: boolean;
  reason?: string | null;
  reasonCategory?: string | null;
  actorUserId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Extra columns to persist on the order alongside the status change. */
  statusColumns?: Partial<typeof orders.$inferInsert>;
  /** Side effects (route_stop writes, …) executed in the same transaction. */
  effects?: (
    tx: OrderTransactionTx,
    ctx: { previousStatus: OrderState; order: typeof orders.$inferSelect },
  ) => Promise<void>;
  /** Enlist in an existing transaction instead of opening a new one. */
  tx?: OrderTransactionTx;
};

export type OrderTransitionErrorCode = "NOT_FOUND" | "CONFLICT";

export class OrderTransitionError extends Error {
  constructor(
    public readonly code: OrderTransitionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OrderTransitionError";
  }
}

async function runTransition(
  tx: OrderTransactionTx,
  opts: ApplyOrderTransitionOptions,
): Promise<OrderTransitionResult> {
  // Idempotency: a prior transition carrying this correlationId is a no-op.
  if (opts.correlationId) {
    const [prior] = await tx
      .select({ id: orderStatusHistory.id })
      .from(orderStatusHistory)
      .where(
        and(
          eq(orderStatusHistory.companyId, opts.companyId),
          eq(orderStatusHistory.correlationId, opts.correlationId),
        ),
      )
      .limit(1);
    if (prior) {
      const [current] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, opts.orderId),
            eq(orders.companyId, opts.companyId),
          ),
        )
        .limit(1);
      return { order: current ?? null, applied: false };
    }
  }

  const [fresh] = await tx
    .select()
    .from(orders)
    .where(
      and(eq(orders.id, opts.orderId), eq(orders.companyId, opts.companyId)),
    )
    .limit(1);
  if (!fresh) {
    throw new OrderTransitionError("NOT_FOUND", "Order not found");
  }

  const from = fresh.status as OrderState;

  if (opts.expectedFrom && from !== opts.expectedFrom) {
    throw new OrderTransitionError(
      "CONFLICT",
      `Order is in status ${from}, expected ${opts.expectedFrom}. Refresh and try again.`,
    );
  }

  // Same-state: no status transition to record, but still persist any
  // statusColumns (e.g. a promisedDate override on reopen) and run effects so
  // callers converge dependent rows idempotently.
  if (from === opts.to) {
    let order = fresh;
    if (opts.statusColumns && Object.keys(opts.statusColumns).length > 0) {
      const [u] = await tx
        .update(orders)
        .set({ ...opts.statusColumns, updatedAt: new Date() })
        .where(
          and(
            eq(orders.id, opts.orderId),
            eq(orders.companyId, opts.companyId),
          ),
        )
        .returning();
      if (u) order = u;
    }
    if (opts.effects) {
      await opts.effects(tx, { previousStatus: from, order });
    }
    return { order, applied: false };
  }

  assertOrderTransition(from, opts.to, { privileged: opts.privileged });

  const [updated] = await tx
    .update(orders)
    .set({
      ...(opts.statusColumns ?? {}),
      status: opts.to,
      updatedAt: new Date(),
    })
    .where(and(eq(orders.id, opts.orderId), eq(orders.status, from)))
    .returning();

  if (!updated) {
    throw new OrderTransitionError(
      "CONFLICT",
      "Order status changed concurrently. Refresh and try again.",
    );
  }

  await tx.insert(orderStatusHistory).values({
    companyId: opts.companyId,
    orderId: opts.orderId,
    previousStatus: from,
    newStatus: opts.to,
    source: opts.source,
    reason: opts.reason ?? null,
    reasonCategory: opts.reasonCategory ?? null,
    actorUserId: opts.actorUserId ?? null,
    correlationId: opts.correlationId ?? null,
    metadata: opts.metadata ?? null,
  });

  if (opts.effects) {
    await opts.effects(tx, { previousStatus: from, order: updated });
  }

  return { order: updated, applied: true };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export async function applyOrderTransition(
  opts: ApplyOrderTransitionOptions,
): Promise<OrderTransitionResult> {
  if (opts.tx) return runTransition(opts.tx, opts);
  try {
    return await db.transaction((tx) => runTransition(tx, opts));
  } catch (error) {
    // Idempotency race: a concurrent request carrying the same correlationId
    // won the unique insert on order_status_history. Treat this one as the
    // same idempotent no-op instead of surfacing a 500.
    if (opts.correlationId && isUniqueViolation(error)) {
      const [current] = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, opts.orderId),
            eq(orders.companyId, opts.companyId),
          ),
        )
        .limit(1);
      return { order: current ?? null, applied: false };
    }
    throw error;
  }
}

/**
 * Maps a transition error to an HTTP shape. Returns null for anything that
 * isn't a known transition error, so callers can rethrow the rest.
 */
export function toOrderTransitionHttp(
  error: unknown,
): { status: number; body: { error: string; code: string } } | null {
  if (error instanceof OrderTransitionError) {
    return {
      status: error.code === "NOT_FOUND" ? 404 : 409,
      body: { error: error.message, code: error.code },
    };
  }
  if (error instanceof InvalidOrderTransitionError) {
    return {
      status: 422,
      body: { error: error.message, code: error.code },
    };
  }
  return null;
}
