import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  fleets,
  USER_ROLES,
  userSkills,
  users,
} from "@/db/schema";
import type { ReassignmentStrategy } from "./types";

/**
 * Get available replacement drivers for an absent driver
 * Prioritizes same fleet type drivers when strategy is SAME_FLEET
 */
export async function getAvailableReplacementDrivers(
  companyId: string,
  absentDriverId: string,
  strategy: ReassignmentStrategy = "SAME_FLEET",
  _jobId?: string,
  limit: number = 10,
): Promise<
  Array<{
    id: string;
    name: string;
    fleetId: string | null;
    fleetName: string;
    priority: number;
  }>
> {
  // Get the absent driver's (user with CONDUCTOR role) fleet info
  const absentDriver = await db.query.users.findFirst({
    where: and(
      eq(users.companyId, companyId),
      eq(users.id, absentDriverId),
      eq(users.role, USER_ROLES.CONDUCTOR),
    ),
    with: {
      primaryFleet: true,
    },
  });

  if (!absentDriver) {
    return [];
  }

  const absentDriverFleetId = absentDriver.primaryFleetId;
  const _absentDriverFleetType = absentDriver.primaryFleet?.type;

  // Build conditions based on strategy
  // For SAME_FLEET strategy, prioritize drivers from same fleet first
  let sameFleetDrivers: Awaited<ReturnType<typeof db.query.users.findMany>> =
    [];

  // Only search for same-fleet drivers if the absent driver has a primary fleet
  if (absentDriverFleetId) {
    sameFleetDrivers = await db.query.users.findMany({
      where: and(
        eq(users.companyId, companyId),
        eq(users.role, USER_ROLES.CONDUCTOR),
        eq(users.active, true),
        eq(users.driverStatus, "AVAILABLE"),
        eq(users.primaryFleetId, absentDriverFleetId),
        sql`${users.id} != ${absentDriverId}`,
      ),
      with: {
        primaryFleet: true,
        userSkills: {
          where: eq(userSkills.active, true),
          with: {
            skill: true,
          },
        },
      },
    });
  }

  // For ANY_FLEET, BALANCED_WORKLOAD, CONSOLIDATE strategies, include other fleet drivers
  let otherFleetDrivers: typeof sameFleetDrivers = [];
  if (strategy !== "SAME_FLEET" || sameFleetDrivers.length < limit) {
    // Build condition to exclude absent driver's fleet (if they have one)
    const fleetExclusionCondition = absentDriverFleetId
      ? sql`${users.primaryFleetId} != ${absentDriverFleetId}`
      : sql`1=1`;

    otherFleetDrivers = await db.query.users.findMany({
      where: and(
        eq(users.companyId, companyId),
        eq(users.role, USER_ROLES.CONDUCTOR),
        eq(users.active, true),
        eq(users.driverStatus, "AVAILABLE"),
        sql`${users.primaryFleetId} IS NOT NULL`,
        fleetExclusionCondition,
        sql`${users.id} != ${absentDriverId}`,
      ),
      with: {
        primaryFleet: true,
        userSkills: {
          where: eq(userSkills.active, true),
          with: {
            skill: true,
          },
        },
      },
    });
  }

  // Combine and prioritize: same fleet first, then others
  // Note: Fleet type filtering removed as type field is now optional/legacy
  const prioritizedDrivers = [
    ...sameFleetDrivers.map((d) => ({ ...d, priority: 1 })),
    ...otherFleetDrivers.map((d) => ({ ...d, priority: 2 })),
  ];

  // Sort by priority (lower is better), then by name
  prioritizedDrivers.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.name.localeCompare(b.name);
  });

  // Apply limit after prioritization
  const limitedDrivers = prioritizedDrivers.slice(0, limit);

  // Get fleet names for all unique fleet IDs
  const fleetIds = [
    ...new Set(
      limitedDrivers
        .map((d) => d.primaryFleetId)
        .filter((id): id is string => id !== null),
    ),
  ];

  const fleetNames = new Map<string, string>();
  if (fleetIds.length > 0) {
    const fleetsData = await db.query.fleets.findMany({
      where: inArray(fleets.id, fleetIds),
      columns: { id: true, name: true },
    });
    for (const fleet of fleetsData) {
      fleetNames.set(fleet.id, fleet.name);
    }
  }

  return limitedDrivers.map((driver) => ({
    id: driver.id,
    name: driver.name,
    fleetId: driver.primaryFleetId,
    fleetName: driver.primaryFleetId
      ? fleetNames.get(driver.primaryFleetId) || "Unknown"
      : "No Fleet",
    priority: driver.priority,
  }));
}
