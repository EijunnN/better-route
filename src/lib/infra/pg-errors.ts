/** deadlock_detected — the losing transaction rolled back cleanly; a retry works. */
export const PG_DEADLOCK_DETECTED = "40P01";

/**
 * True if the error (or anything in its `cause` chain — Drizzle wraps the
 * driver error) carries the given Postgres SQLSTATE code.
 */
export function hasPgErrorCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if ((current as { code?: unknown }).code === code) return true;
    current = current.cause;
  }
  return false;
}
