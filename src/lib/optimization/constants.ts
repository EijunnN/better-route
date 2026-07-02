/**
 * Constants shared between the solver request builder (vroom-optimizer) and
 * the independent verifier. One module, one value — duplicated copies of
 * these are exactly how solver and verifier drifted apart (SEMANTICS §5).
 */

/**
 * Tolerance added to each side of an order's time window when the preset
 * enables `flexibleTimeWindows`. The solver widens windows by this amount
 * before solving; the verifier must widen by the same amount when checking.
 */
export const FLEX_TIME_WINDOW_TOLERANCE_MINUTES = 30;
export const FLEX_TIME_WINDOW_TOLERANCE_SECONDS =
  FLEX_TIME_WINDOW_TOLERANCE_MINUTES * 60;

/**
 * Max orders per vehicle when the vehicle row doesn't define its own limit.
 * Previously duplicated as 50 (vroom-optimizer) vs 30 (runner) — the runner
 * value won in production, so 30 is the canonical default.
 */
export const DEFAULT_MAX_ORDERS_PER_VEHICLE = 30;

/**
 * Service time per stop when the order doesn't carry one, seconds.
 * Previously triplicated (vroom-client, vroom-optimizer, verify-runner).
 * Note: the RUNNER's business default is separate — `serviceTimeMinutes ??
 * 10` from the company config — and always populates order.serviceTime, so
 * this fallback only matters for direct callers (reassign, harness).
 */
export const DEFAULT_SERVICE_TIME_SECONDS = 300;
