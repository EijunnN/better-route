import type { ReassignmentOption, ReassignmentStrategy } from "./types";
import { getAvailableReplacementDrivers } from "./replacements";
import { getAffectedRoutesForAbsentDriver } from "./affected-routes";
import { calculateReassignmentImpact } from "./impact";

/**
 * Generate reassignment options for an absent driver
 */
export async function generateReassignmentOptions(
  companyId: string,
  absentDriverId: string,
  strategy: ReassignmentStrategy = "SAME_FLEET",
  jobId?: string,
  limit: number = 5,
): Promise<ReassignmentOption[]> {
  // Replacement drivers and affected routes are independent — race them.
  const [replacementDrivers, affectedRoutes] = await Promise.all([
    getAvailableReplacementDrivers(
      companyId,
      absentDriverId,
      strategy,
      jobId,
      limit,
    ),
    getAffectedRoutesForAbsentDriver(companyId, absentDriverId, jobId),
  ]);

  const routeIds = affectedRoutes.map((r) => r.routeId);

  // Calculate impact for each replacement driver in parallel — each call
  // is independent and the slowest one gates the response, not the sum.
  const options: ReassignmentOption[] = await Promise.all(
    replacementDrivers.map(async (driver) => {
      const impact = await calculateReassignmentImpact(
        companyId,
        absentDriverId,
        driver.id,
        jobId,
      );

      return {
        optionId: `${absentDriverId}-${driver.id}`,
        replacementDriver: driver,
        impact,
        strategy,
        routeIds,
      };
    }),
  );

  // Sort by priority first, then by validity, then by impact
  options.sort((a, b) => {
    // Sort by priority (same fleet first)
    if (a.replacementDriver.priority !== b.replacementDriver.priority) {
      return a.replacementDriver.priority - b.replacementDriver.priority;
    }

    // Then by validity
    if (a.impact.isValid && !b.impact.isValid) return -1;
    if (!a.impact.isValid && b.impact.isValid) return 1;

    // Prefer fewer compromised windows
    if (
      a.impact.compromisedWindows.count !== b.impact.compromisedWindows.count
    ) {
      return (
        a.impact.compromisedWindows.count - b.impact.compromisedWindows.count
      );
    }

    // Prefer better skills match
    return b.impact.skillsMatch.percentage - a.impact.skillsMatch.percentage;
  });

  return options.slice(0, limit);
}
