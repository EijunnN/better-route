/**
 * Crystalized stop-status workflow.
 *
 * The five SYSTEM_STATES are the canonical workflow for every install,
 * for every company within an install. Transitions are a fixed graph
 * derived from the semantics of last-mile delivery — they're not
 * configurable per-tenant by design.
 *
 * What IS per-company (and lives in DB) is the *policy* applied to
 * these states: labels, colours, photo/signature/notes requirements,
 * and the list of failure reasons. See `companyDeliveryPolicy` in
 * `src/db/schema/workflow.ts`.
 *
 * When a sub-client of a 3PL needs a structurally different flow
 * (very rare in last-mile), the answer is a code-level variant, not
 * a runtime-editable state graph.
 */

export const SYSTEM_STATES = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type SystemState = keyof typeof SYSTEM_STATES;

export const SYSTEM_STATE_ORDER: SystemState[] = [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

/**
 * Which states are reachable from each state. Terminal states have
 * empty arrays. `IN_PROGRESS → PENDING` is allowed so a driver can
 * undo a mistaken start without leaving the stop in a bad state.
 * `FAILED → PENDING` is allowed so a stop can be retried.
 */
export const ALLOWED_TRANSITIONS: Record<SystemState, SystemState[]> = {
  PENDING: ["IN_PROGRESS", "FAILED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "FAILED", "CANCELLED", "PENDING"],
  COMPLETED: [],
  FAILED: ["PENDING", "CANCELLED"],
  CANCELLED: [],
};

export const TERMINAL_STATES: ReadonlySet<SystemState> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export function isTerminal(state: SystemState): boolean {
  return TERMINAL_STATES.has(state);
}

export function canTransition(from: SystemState, to: SystemState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Default labels — used to seed the policy row for a new company and
 * as a fallback if the policy row is somehow missing. Spanish because
 * that's the product's primary market (Peru / LATAM).
 */
export const DEFAULT_STATE_LABELS: Record<SystemState, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En progreso",
  COMPLETED: "Entregado",
  FAILED: "No entregado",
  CANCELLED: "Omitido",
};

export const DEFAULT_STATE_COLORS: Record<SystemState, string> = {
  PENDING: "#6B7280",
  IN_PROGRESS: "#3B82F6",
  COMPLETED: "#16A34A",
  FAILED: "#DC4840",
  CANCELLED: "#9CA3AF",
};

export const DEFAULT_FAILURE_REASONS: readonly string[] = [
  "Cliente ausente",
  "Dirección incorrecta",
  "Paquete dañado",
  "Cliente rechazó",
  "Zona insegura",
  "Reprogramado",
  "Otro",
];
