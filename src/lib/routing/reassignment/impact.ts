import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  orders,
  routeStops,
  USER_ROLES,
  userSkills,
  users,
  vehicleSkills,
  vehicles,
} from "@/db/schema";
import { calculateRouteDistance } from "../../geo/geospatial";

import { safeParseJson } from "@/lib/utils/safe-json";
import type { ReassignmentImpact } from "./types";
import { getAffectedRoutesForAbsentDriver } from "./affected-routes";

/**
 * Calculate reassignment impact for a specific replacement driver
 * with enhanced metrics in both absolute and percentage terms
 */
export async function calculateReassignmentImpact(
  companyId: string,
  absentDriverId: string,
  replacementDriverId: string,
  jobId?: string,
): Promise<ReassignmentImpact> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const now = new Date();

  // Get affected routes
  const affectedRoutes = await getAffectedRoutesForAbsentDriver(
    companyId,
    absentDriverId,
    jobId,
  );

  if (affectedRoutes.length === 0) {
    return {
      replacementDriverId,
      replacementDriverName: "",
      stopsCount: 0,
      additionalDistance: {
        absolute: 0,
        percentage: 0,
      },
      additionalTime: {
        absolute: 0,
        percentage: 0,
        formatted: "0m",
      },
      compromisedWindows: {
        count: 0,
        percentage: 0,
      },
      capacityUtilization: {
        current: 0,
        projected: 0,
        available: 100,
      },
      skillsMatch: {
        percentage: 100,
        missing: [],
      },
      availabilityStatus: {
        isAvailable: true,
        currentStops: 0,
        maxCapacity: 50,
        canAbsorbStops: true,
      },
      isValid: true,
      errors: [],
      warnings: ["No active routes found for driver"],
    };
  }

  // Get replacement driver (user with CONDUCTOR role) details with current stops
  const replacementDriver = await db.query.users.findFirst({
    where: and(
      eq(users.companyId, companyId),
      eq(users.id, replacementDriverId),
      eq(users.role, USER_ROLES.CONDUCTOR),
    ),
    with: {
      userSkills: {
        where: eq(userSkills.active, true),
        with: {
          skill: true,
        },
      },
      primaryFleet: true,
    },
  });

  if (!replacementDriver) {
    return {
      replacementDriverId,
      replacementDriverName: "",
      stopsCount: 0,
      additionalDistance: {
        absolute: 0,
        percentage: 0,
      },
      additionalTime: {
        absolute: 0,
        percentage: 0,
        formatted: "0m",
      },
      compromisedWindows: {
        count: 0,
        percentage: 0,
      },
      capacityUtilization: {
        current: 0,
        projected: 0,
        available: 100,
      },
      skillsMatch: {
        percentage: 0,
        missing: [],
      },
      availabilityStatus: {
        isAvailable: false,
        currentStops: 0,
        maxCapacity: 50,
        canAbsorbStops: false,
      },
      isValid: false,
      errors: ["Replacement driver not found"],
      warnings: [],
    };
  }

  // Check license validity
  if (!replacementDriver.licenseExpiry) {
    warnings.push("License expiry date not set");
  } else {
    const licenseExpiry = new Date(replacementDriver.licenseExpiry);
    const daysUntilExpiry = Math.ceil(
      (licenseExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysUntilExpiry < 0) {
      errors.push("License expired");
    } else if (daysUntilExpiry <= 30) {
      warnings.push(`License expires in ${daysUntilExpiry} days`);
    }
  }

  // Check driver status
  const isAvailableStatus =
    replacementDriver.driverStatus === "AVAILABLE" ||
    replacementDriver.driverStatus === "COMPLETED";

  if (!isAvailableStatus) {
    warnings.push(
      `Driver status is ${replacementDriver.driverStatus || "unknown"}`,
    );
  }

  // Collect all stops from affected routes
  const allStops = affectedRoutes.flatMap((route) => route.stops);
  const pendingStops = allStops.filter(
    (s) => s.status === "PENDING" || s.status === "IN_PROGRESS",
  );

  // Get replacement driver's current workload
  const currentDriverStops = await db.query.routeStops.findMany({
    where: and(
      eq(routeStops.companyId, companyId),
      eq(routeStops.userId, replacementDriverId),
      eq(routeStops.status, "PENDING"),
    ),
  });

  const currentStopsCount = currentDriverStops.length;
  const stopsToReassign = pendingStops.length;
  const projectedStops = currentStopsCount + stopsToReassign;

  // Define max capacity (configurable, default 50 stops)
  const maxCapacity = 50;
  const canAbsorbStops = projectedStops <= maxCapacity;

  if (!canAbsorbStops) {
    errors.push(
      `Driver cannot absorb ${stopsToReassign} stops. Current: ${currentStopsCount}, Max: ${maxCapacity}`,
    );
  }

  // Calculate current distance/time for replacement driver using PostGIS
  let currentDistance = 0;
  let currentTime = 0;

  if (currentDriverStops.length > 0) {
    // Sort stops by sequence and calculate actual route distance
    const sortedStops = [...currentDriverStops].sort(
      (a, b) => a.sequence - b.sequence,
    );
    const currentRouteResult = calculateRouteDistance(
      sortedStops.map((s) => ({
        latitude: parseFloat(s.latitude),
        longitude: parseFloat(s.longitude),
      })),
    );
    currentDistance = currentRouteResult.distanceMeters;
    currentTime = currentRouteResult.durationSeconds;
  }

  // Calculate additional distance for stops to reassign using PostGIS
  let additionalDistanceAbs = 0;
  let additionalTimeAbs = 0;

  if (stopsToReassign > 0) {
    // Sort stops by sequence and calculate route distance
    const sortedStops = [...pendingStops].sort(
      (a, b) => a.sequence - b.sequence,
    );
    const reassignRouteResult = calculateRouteDistance(
      sortedStops.map((s) => ({
        latitude: parseFloat(s.latitude),
        longitude: parseFloat(s.longitude),
      })),
    );
    additionalDistanceAbs = reassignRouteResult.distanceMeters;
    additionalTimeAbs = reassignRouteResult.durationSeconds;
  }

  const additionalDistancePct =
    currentDistance > 0
      ? Math.round((additionalDistanceAbs / currentDistance) * 100)
      : 100;

  const additionalTimePct =
    currentTime > 0 ? Math.round((additionalTimeAbs / currentTime) * 100) : 100;

  // Format time for display
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Get skills required by all orders
  const orderIds = pendingStops.map((s) => s.orderId);
  const ordersList = await db.query.orders.findMany({
    where: and(eq(orders.companyId, companyId), inArray(orders.id, orderIds)),
  });

  // Get skill names for missing skills
  const allSkills = await db.query.vehicleSkills.findMany({
    where: eq(vehicleSkills.companyId, companyId),
  });

  const skillNameMap = new Map(allSkills.map((s) => [s.id, s.name]));

  // Calculate skills match with missing skill names
  const requiredSkillsSet = new Set<string>();
  for (const order of ordersList) {
    if (order.requiredSkills) {
      const skills = safeParseJson<string[]>(order.requiredSkills);
      skills.forEach((skill: string) => {
        requiredSkillsSet.add(skill);
      });
    }
  }

  const driverSkillIds = new Set(
    replacementDriver.userSkills.map((ds) => ds.skillId),
  );

  const requiredSkills = Array.from(requiredSkillsSet);
  const matchedSkills = requiredSkills.filter((skillId) =>
    driverSkillIds.has(skillId),
  );
  const missingSkills = requiredSkills.filter(
    (skillId) => !driverSkillIds.has(skillId),
  );

  const skillsMatchPct =
    requiredSkills.length > 0
      ? Math.round((matchedSkills.length / requiredSkills.length) * 100)
      : 100;

  if (skillsMatchPct < 100 && requiredSkills.length > 0) {
    warnings.push(
      `${matchedSkills.length}/${requiredSkills.length} skills matched`,
    );
  }

  // Check skill expiration
  for (const ds of replacementDriver.userSkills) {
    if (ds.expiresAt && new Date(ds.expiresAt) < now) {
      warnings.push(`Skill "${ds.skill.name}" expired`);
    }
  }

  // Get vehicle capacity info for affected routes
  const vehicleIds = [...new Set(affectedRoutes.map((r) => r.vehicleId))];
  const vehiclesList = await db.query.vehicles.findMany({
    where: inArray(vehicles.id, vehicleIds),
    with: {
      vehicleFleets: {
        with: {
          fleet: true,
        },
      },
    },
  });

  // Calculate capacity utilization with current vs projected
  const totalWeightCapacity = vehiclesList.reduce(
    (sum, v) => sum + (v.weightCapacity ?? 0),
    0,
  );
  const totalVolumeCapacity = vehiclesList.reduce(
    (sum, v) => sum + (v.volumeCapacity ?? 0),
    0,
  );

  const totalWeightRequired = ordersList.reduce(
    (sum, o) => sum + (o.weightRequired || 0),
    0,
  );
  const totalVolumeRequired = ordersList.reduce(
    (sum, o) => sum + (o.volumeRequired || 0),
    0,
  );

  // Current utilization (what's already loaded on vehicles)
  const currentWeightUtil =
    totalWeightCapacity > 0
      ? ((totalWeightRequired * 0.5) / totalWeightCapacity) * 100
      : 0; // Assume 50% current
  const currentVolumeUtil =
    totalVolumeCapacity > 0
      ? ((totalVolumeRequired * 0.5) / totalVolumeCapacity) * 100
      : 0;

  const currentUtilization = Math.round(
    Math.max(currentWeightUtil, currentVolumeUtil),
  );

  // Projected utilization (after adding reassignment)
  const projectedWeightUtil =
    totalWeightCapacity > 0
      ? ((totalWeightRequired * 0.5 + totalWeightRequired) /
          totalWeightCapacity) *
        100
      : 0;
  const projectedVolumeUtil =
    totalVolumeCapacity > 0
      ? ((totalVolumeRequired * 0.5 + totalVolumeRequired) /
          totalVolumeCapacity) *
        100
      : 0;

  const projectedUtilization = Math.round(
    Math.max(projectedWeightUtil, projectedVolumeUtil),
  );

  const availableUtilization = Math.max(0, 100 - projectedUtilization);

  if (projectedUtilization > 100) {
    errors.push("Capacity constraints violated");
  } else if (projectedUtilization > 90) {
    warnings.push("High capacity utilization after reassignment");
  }

  // Check time windows with percentage
  let compromisedWindowCount = 0;
  let totalWindows = 0;

  for (const stop of pendingStops) {
    if (stop.timeWindowStart && stop.timeWindowEnd) {
      totalWindows++;
      const windowEnd = new Date(stop.timeWindowEnd);
      // If estimated arrival is past the window end, it's compromised
      if (
        stop.estimatedArrival &&
        new Date(stop.estimatedArrival) > windowEnd
      ) {
        compromisedWindowCount++;
      }
    }
  }

  const compromisedWindowsPct =
    totalWindows > 0
      ? Math.round((compromisedWindowCount / totalWindows) * 100)
      : 0;

  const isValid = errors.length === 0 && canAbsorbStops;

  return {
    replacementDriverId,
    replacementDriverName: replacementDriver.name,
    stopsCount: pendingStops.length,
    additionalDistance: {
      absolute: Math.round(additionalDistanceAbs),
      percentage: additionalDistancePct,
    },
    additionalTime: {
      absolute: Math.round(additionalTimeAbs),
      percentage: additionalTimePct,
      formatted: formatTime(additionalTimeAbs),
    },
    compromisedWindows: {
      count: compromisedWindowCount,
      percentage: compromisedWindowsPct,
    },
    capacityUtilization: {
      current: currentUtilization,
      projected: projectedUtilization,
      available: availableUtilization,
    },
    skillsMatch: {
      percentage: skillsMatchPct,
      missing: missingSkills.map((id) => skillNameMap.get(id) || id),
    },
    availabilityStatus: {
      isAvailable: isAvailableStatus,
      currentStops: currentStopsCount,
      maxCapacity,
      canAbsorbStops,
    },
    isValid,
    errors,
    warnings,
  };
}
