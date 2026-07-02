/**
 * Shared time-window parsing POLICY between the solver request builder and
 * the verifier (SEMANTICS A7). A window only constrains VROOM when BOTH
 * edges parse and start <= end — a malformed window (single edge, invalid
 * format, "24:00", start > end) is silently dropped by the solver, so the
 * verifier must not flag HARD violations against a constraint that was
 * never applied.
 */

/**
 * Convert a time window string (HH:MM or HH:MM:SS) to seconds since
 * midnight. Returns null if the time string is invalid.
 */
export function parseTimeWindow(timeStr: string): number | null {
  if (!timeStr || timeStr === "Invalid Date") {
    return null;
  }
  const [hours, minutes] = timeStr.split(":").map(Number);
  // Validate parsed values
  if (Number.isNaN(hours) || hours < 0 || hours > 23) {
    return null;
  }
  const mins = minutes || 0;
  if (Number.isNaN(mins) || mins < 0 || mins > 59) {
    return null;
  }
  return hours * 3600 + mins * 60;
}

/**
 * Resolve a window to [startSeconds, endSeconds] with the SAME predicate
 * `createVroomJob`/`createVroomVehicle` use: both edges present, both
 * parseable, start <= end. Null means "the solver applied no constraint".
 */
export function resolveTimeWindowEdges(
  start: string | undefined,
  end: string | undefined,
): [number, number] | null {
  if (!start || !end) return null;
  const startSec = parseTimeWindow(start);
  const endSec = parseTimeWindow(end);
  if (startSec === null || endSec === null || startSec > endSec) return null;
  return [startSec, endSec];
}
