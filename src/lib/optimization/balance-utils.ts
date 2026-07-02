/**
 * Balance score — how evenly stops are distributed across routes (0-100).
 *
 * Balancing itself happens PRE-solve: vroom-optimizer caps every vehicle's
 * max_tasks near the fair share so VROOM spreads the load while still
 * honoring skills, time windows and capacities. The old post-solve
 * `redistributeOrders` moved stops with no skill/window checks, appended
 * them at the end of routes, and wiped the solver's arrival times
 * (SEMANTICS A5) — removed along with its haversine insertion heuristics.
 */
export function getBalanceScore(stopCounts: number[]): number {
  if (stopCounts.length === 0) return 100;

  const totalStops = stopCounts.reduce((sum, c) => sum + c, 0);
  if (totalStops === 0) return 100;

  const idealPerRoute = totalStops / stopCounts.length;
  const variance =
    stopCounts.reduce((sum, c) => sum + (c - idealPerRoute) ** 2, 0) /
    stopCounts.length;
  const stdDev = Math.sqrt(variance);

  // stdDev 0 = perfect balance = 100; deviations near the ideal zero it out.
  const normalizedDeviation = stdDev / idealPerRoute;
  return Math.max(0, Math.round((1 - normalizedDeviation) * 100));
}
