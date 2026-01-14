import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  orders,
  USER_ROLES,
  userAvailability,
  userSecondaryFleets,
  userSkills,
  users,
  vehicles,
} from "@/db/schema";

/**
 * Driver assignment quality score
 * Higher scores indicate better assignments
 */
export interface AssignmentScore {
  driverId: string;
  score: number;
  factors: {
    skillsMatch: number; // 0-100: Skills compatibility
    availability: number; // 0-100: Current availability
    licenseValid: number; // 0-100: License not expired
    fleetMatch: number; // 0-100: Fleet compatibility
    workload: number; // 0-100: Balanced workload
  };
  warnings: string[];
  errors: string[];
}

/**
 * Driver assignment request
 */
export interface DriverAssignmentRequest {
  companyId: string;
  vehicleId: string;
  routeStops: Array<{
    orderId: string;
    promisedDate?: Date | null;
  }>;
  candidateDriverIds: string[];
  assignedDrivers: Map<string, string>; // vehicleId -> driverId mapping
}

/**
 * Driver assignment result
 */
export interface DriverAssignmentResult {
  driverId: string;
  driverName: string;
  score: AssignmentScore;
  isManualOverride: boolean;
}

/**
 * Assignment strategy options
 */
export type AssignmentStrategy =
  | "BALANCED" // Balance all factors equally
  | "SKILLS_FIRST" // Prioritize skills matching
  | "AVAILABILITY" // Prioritize driver availability
  | "WORKLOAD" // Prioritize balanced workload
  | "FLEET_MATCH"; // Prioritize fleet compatibility

/**
 * Driver assignment configuration
 */
export interface DriverAssignmentConfig {
  strategy: AssignmentStrategy;
  requireLicenseValid: boolean;
  requireSkillsMatch: boolean;
  maxDaysLicenseNearExpiry: number; // Days before expiry to consider "near expiry"
  balanceWorkload: boolean;
}

/**
 * Default assignment configuration
 */
export const DEFAULT_ASSIGNMENT_CONFIG: DriverAssignmentConfig = {
  strategy: "BALANCED",
  requireLicenseValid: true,
  requireSkillsMatch: true,
  maxDaysLicenseNearExpiry: 30,
  balanceWorkload: true,
};

/**
 * Assign drivers to routes automatically
 * Returns a map of vehicleId to driver assignment
 */
export async function assignDriversToRoutes(
  requests: DriverAssignmentRequest[],
  config: DriverAssignmentConfig = DEFAULT_ASSIGNMENT_CONFIG,
): Promise<Map<string, DriverAssignmentResult>> {
  const results = new Map<string, DriverAssignmentResult>();

  // First, get all candidate drivers with their details
  const allDriverIds = Array.from(
    new Set(requests.flatMap((r) => r.candidateDriverIds)),
  );

  if (allDriverIds.length === 0) {
    return results;
  }

  const candidateDrivers = await getCandidateDriversDetails(
    requests[0].companyId,
    allDriverIds,
  );

  // Calculate scores for each request
  for (const request of requests) {
    const vehicle = await getVehicleWithSkills(request.vehicleId);
    if (!vehicle) {
      continue;
    }

    const requiredSkills = await getRequiredSkillsForRoute(
      request.companyId,
      request.routeStops,
    );

    const scores: AssignmentScore[] = [];

    for (const driver of candidateDrivers) {
      const score = await calculateDriverScore(
        driver,
        vehicle,
        requiredSkills,
        {
          ...config,
          assignedDrivers: request.assignedDrivers,
        },
      );
      scores.push(score);
    }

    // Filter out drivers with errors
    const validScores = scores.filter((s) => s.errors.length === 0);

    if (validScores.length === 0) {
      // No valid drivers - assign best candidate with errors
      const bestScore = scores.sort((a, b) => b.score - a.score)[0];
      const driver = candidateDrivers.find((d) => d.id === bestScore.driverId);
      if (driver) {
        results.set(request.vehicleId, {
          driverId: driver.id,
          driverName: driver.name,
          score: bestScore,
          isManualOverride: false,
        });
      }
      continue;
    }

    // Sort by score based on strategy
    const sortedScores = sortScoresByStrategy(validScores, config.strategy);

    // Assign the best driver
    const bestScore = sortedScores[0];
    const bestDriver = candidateDrivers.find(
      (d) => d.id === bestScore.driverId,
    );

    if (bestDriver) {
      results.set(request.vehicleId, {
        driverId: bestDriver.id,
        driverName: bestDriver.name,
        score: bestScore,
        isManualOverride: false,
      });

      // Mark this driver as assigned
      request.assignedDrivers.set(request.vehicleId, bestDriver.id);
    }
  }

  return results;
}

/**
 * Get candidate drivers with all their details
 */
async function getCandidateDriversDetails(
  companyId: string,
  driverIds: string[],
) {
  const driversList = await db.query.users.findMany({
    where: and(
      eq(users.companyId, companyId),
      inArray(users.id, driverIds),
      eq(users.active, true),
      eq(users.role, USER_ROLES.CONDUCTOR),
    ),
    with: {
      primaryFleet: true,
      userSkills: {
        with: {
          skill: true,
        },
        where: eq(userSkills.active, true),
      },
      availability: {
        where: eq(userAvailability.active, true),
      },
      secondaryFleets: {
        where: eq(userSecondaryFleets.active, true),
      },
    },
  });

  return driversList.map((driver) => ({
    ...driver,
    status: driver.driverStatus, // Map driverStatus to status for compatibility
    fleetId: driver.primaryFleetId, // Map primaryFleetId to fleetId for compatibility
    skills: driver.userSkills.map((ds) => ds.skill),
    secondaryFleetIds: driver.secondaryFleets.map((sf) => sf.fleetId),
    driverSkills: driver.userSkills, // Alias for compatibility
  }));
}

/**
 * Get vehicle with its skills
 */
async function getVehicleWithSkills(vehicleId: string) {
  // For now, we'll need to fetch vehicle details
  // In production, this would use the vehicle skills table
  const vehicle = await db.query.vehicles.findFirst({
    where: eq(vehicles.id, vehicleId),
    with: {
      vehicleFleets: {
        with: {
          fleet: true,
        },
      },
    },
  });

  return vehicle;
}

/**
 * Get required skills for a route based on orders
 */
async function getRequiredSkillsForRoute(
  companyId: string,
  routeStops: Array<{ orderId: string; promisedDate?: Date | null }>,
): Promise<string[]> {
  if (routeStops.length === 0) {
    return [];
  }

  const orderIds = routeStops.map((s) => s.orderId);
  const ordersList = await db.query.orders.findMany({
    where: and(eq(orders.companyId, companyId), inArray(orders.id, orderIds)),
  });

  // Collect all required skills from orders
  const requiredSkills = new Set<string>();
  for (const order of ordersList) {
    if (order.requiredSkills) {
      const skills =
        typeof order.requiredSkills === "string"
          ? JSON.parse(order.requiredSkills)
          : order.requiredSkills;
      skills.forEach((skill: string) => requiredSkills.add(skill));
    }
  }

  return Array.from(requiredSkills);
}

/**
 * Calculate driver assignment score
 */
async function calculateDriverScore(
  driver: any,
  vehicle: any,
  requiredSkills: string[],
  config: DriverAssignmentConfig & { assignedDrivers: Map<string, string> },
): Promise<AssignmentScore> {
  const factors = {
    skillsMatch: 0,
    availability: 0,
    licenseValid: 0,
    fleetMatch: 0,
    workload: 0,
  };

  const warnings: string[] = [];
  const errors: string[] = [];

  // 1. Check license validity
  const now = new Date();
  const licenseExpiry = new Date(driver.licenseExpiry);
  const daysUntilExpiry = Math.ceil(
    (licenseExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysUntilExpiry < 0) {
    errors.push("License expired");
    factors.licenseValid = 0;
  } else if (daysUntilExpiry <= config.maxDaysLicenseNearExpiry) {
    warnings.push(`License expires in ${daysUntilExpiry} days`);
    factors.licenseValid = Math.round(
      (daysUntilExpiry / config.maxDaysLicenseNearExpiry) * 100,
    );
  } else {
    factors.licenseValid = 100;
  }

  // 2. Check driver status
  if (driver.status === "UNAVAILABLE" || driver.status === "ABSENT") {
    errors.push(`Driver is ${driver.status.toLowerCase()}`);
    factors.availability = 0;
  } else if (driver.status === "COMPLETED") {
    factors.availability = 50; // Available but just completed a route
  } else if (driver.status === "AVAILABLE") {
    factors.availability = 100;
  } else {
    warnings.push(`Driver status is ${driver.status}`);
    factors.availability = 50;
  }

  // 3. Check fleet compatibility
  const isPrimaryFleetMatch = driver.fleetId === vehicle.fleetId;
  const isSecondaryFleetMatch = driver.secondaryFleetIds.includes(
    vehicle.fleetId as string,
  );

  if (isPrimaryFleetMatch) {
    factors.fleetMatch = 100;
  } else if (isSecondaryFleetMatch) {
    factors.fleetMatch = 75;
    warnings.push("Driver from secondary fleet");
  } else {
    factors.fleetMatch = 25;
    warnings.push("Driver from different fleet");
  }

  // 4. Check skills matching
  if (requiredSkills.length > 0) {
    const driverSkillIds = new Set(driver.skills.map((s: any) => s.id));

    const matchedSkills = requiredSkills.filter((skillId) =>
      driverSkillIds.has(skillId),
    );

    factors.skillsMatch = Math.round(
      (matchedSkills.length / requiredSkills.length) * 100,
    );

    if (factors.skillsMatch < 100) {
      warnings.push(
        `${matchedSkills.length}/${requiredSkills.length} skills matched`,
      );
    }

    if (config.requireSkillsMatch && factors.skillsMatch === 0) {
      errors.push("Missing required skills");
    }
  } else {
    factors.skillsMatch = 100; // No skills required
  }

  // 5. Check skill expiration
  const nowDate = new Date();
  for (const ds of driver.driverSkills) {
    if (ds.expiresAt && new Date(ds.expiresAt) < nowDate) {
      warnings.push(`Skill "${ds.skill.name}" expired`);
      factors.skillsMatch = Math.max(0, factors.skillsMatch - 20);
    }
  }

  // 6. Check current workload (how many routes already assigned)
  const currentAssignments = Array.from(config.assignedDrivers.values()).filter(
    (id) => id === driver.id,
  ).length;

  if (config.balanceWorkload) {
    // Decrease score as more routes are assigned to this driver
    factors.workload = Math.max(0, 100 - currentAssignments * 30);
  } else {
    factors.workload = 100;
  }

  // 7. Check license category compatibility
  if (vehicle.licenseRequired && driver.licenseCategories) {
    const vehicleRequiredLicense = vehicle.licenseRequired;
    const driverCategories = driver.licenseCategories
      .split(",")
      .map((c: string) => c.trim());

    if (!driverCategories.includes(vehicleRequiredLicense)) {
      warnings.push(`Missing license category: ${vehicleRequiredLicense}`);
      factors.licenseValid = Math.max(0, factors.licenseValid - 50);
    }
  }

  // Calculate weighted score based on strategy
  let score = 0;
  const weights = getStrategyWeights(config.strategy);

  score =
    (factors.skillsMatch * weights.skills +
      factors.availability * weights.availability +
      factors.licenseValid * weights.license +
      factors.fleetMatch * weights.fleet +
      factors.workload * weights.workload) /
    (weights.skills +
      weights.availability +
      weights.license +
      weights.fleet +
      weights.workload);

  return {
    driverId: driver.id,
    score: Math.round(score),
    factors,
    warnings,
    errors,
  };
}

/**
 * Get strategy weights for scoring
 */
function getStrategyWeights(strategy: AssignmentStrategy) {
  switch (strategy) {
    case "SKILLS_FIRST":
      return { skills: 5, availability: 2, license: 3, fleet: 1, workload: 1 };
    case "AVAILABILITY":
      return { skills: 2, availability: 5, license: 3, fleet: 1, workload: 2 };
    case "WORKLOAD":
      return { skills: 2, availability: 2, license: 3, fleet: 1, workload: 5 };
    case "FLEET_MATCH":
      return { skills: 2, availability: 2, license: 3, fleet: 5, workload: 1 };
    default:
      return { skills: 1, availability: 1, license: 1, fleet: 1, workload: 1 };
  }
}

/**
 * Sort scores by strategy
 */
function sortScoresByStrategy(
  scores: AssignmentScore[],
  strategy: AssignmentStrategy,
): AssignmentScore[] {
  const weights = getStrategyWeights(strategy);

  return scores.sort((a, b) => {
    // Calculate weighted score for comparison
    const scoreA =
      a.factors.skillsMatch * weights.skills +
      a.factors.availability * weights.availability +
      a.factors.licenseValid * weights.license +
      a.factors.fleetMatch * weights.fleet +
      a.factors.workload * weights.workload;

    const scoreB =
      b.factors.skillsMatch * weights.skills +
      b.factors.availability * weights.availability +
      b.factors.licenseValid * weights.license +
      b.factors.fleetMatch * weights.fleet +
      b.factors.workload * weights.workload;

    return scoreB - scoreA;
  });
}

/**
 * Get available drivers for a specific time window
 */
export async function getAvailableDriversAtTime(
  companyId: string,
  driverIds: string[],
  dateTime: Date,
): Promise<string[]> {
  const dayOfWeek = getDayOfWeek(dateTime);
  const time = dateTime.toTimeString().slice(0, 5); // HH:MM format

  const availableDrivers = await db.query.users.findMany({
    where: and(
      eq(users.companyId, companyId),
      inArray(users.id, driverIds),
      eq(users.active, true),
      eq(users.role, USER_ROLES.CONDUCTOR),
      eq(users.driverStatus, "AVAILABLE"),
    ),
    with: {
      availability: {
        where: eq(userAvailability.active, true),
      },
    },
  });

  return availableDrivers
    .filter((driver) => {
      // Check if driver has availability for this day
      const dayAvailability = driver.availability.find(
        (a) => a.dayOfWeek === dayOfWeek,
      );

      if (!dayAvailability) {
        return false; // No availability set for this day
      }

      if (dayAvailability.isDayOff) {
        return false; // Day off
      }

      // Check if time is within availability window
      const startTime = dayAvailability.startTime.slice(0, 5);
      const endTime = dayAvailability.endTime.slice(0, 5);

      return time >= startTime && time <= endTime;
    })
    .map((d) => d.id);
}

/**
 * Get day of week from date
 */
function getDayOfWeek(date: Date): string {
  const days = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ];
  return days[date.getDay()];
}

/**
 * Validate driver assignment constraints
 */
export interface AssignmentValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export async function validateDriverAssignment(
  companyId: string,
  driverId: string,
  vehicleId: string,
  routeStops: Array<{ orderId: string; promisedDate?: Date | null }>,
): Promise<AssignmentValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Get driver details (user with role CONDUCTOR)
  const driver = await db.query.users.findFirst({
    where: and(
      eq(users.companyId, companyId),
      eq(users.id, driverId),
      eq(users.role, USER_ROLES.CONDUCTOR),
    ),
    with: {
      userSkills: {
        with: {
          skill: true,
        },
        where: eq(userSkills.active, true),
      },
    },
  });

  if (!driver) {
    return {
      isValid: false,
      errors: ["Driver not found"],
      warnings: [],
    };
  }

  // Get vehicle details
  const vehicle = await db.query.vehicles.findFirst({
    where: eq(vehicles.id, vehicleId),
  });

  if (!vehicle) {
    return {
      isValid: false,
      errors: ["Vehicle not found"],
      warnings: [],
    };
  }

  // Check license validity
  const now = new Date();
  if (!driver.licenseExpiry) {
    warnings.push("Driver license expiry date not set");
  } else {
    const licenseExpiry = new Date(driver.licenseExpiry);
    if (licenseExpiry < now) {
      errors.push("Driver's license has expired");
    } else {
      const daysUntilExpiry = Math.ceil(
        (licenseExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilExpiry <= 30) {
        warnings.push(`License expires in ${daysUntilExpiry} days`);
      }
    }
  }

  // Check license category
  if (vehicle.licenseRequired && driver.licenseCategories) {
    const driverCategories = driver.licenseCategories
      .split(",")
      .map((c) => c.trim());
    if (!driverCategories.includes(vehicle.licenseRequired)) {
      errors.push(
        `Driver missing required license category: ${vehicle.licenseRequired}`,
      );
    }
  }

  // Check skills
  const requiredSkills = await getRequiredSkillsForRoute(companyId, routeStops);
  if (requiredSkills.length > 0) {
    const driverSkillIds = new Set(driver.userSkills.map((ds) => ds.skillId));

    const missingSkills = requiredSkills.filter(
      (skillId) => !driverSkillIds.has(skillId),
    );

    if (missingSkills.length > 0) {
      errors.push(
        `Driver missing required skills: ${missingSkills.join(", ")}`,
      );
    }
  }

  // Check skill expiration
  for (const ds of driver.userSkills) {
    if (ds.expiresAt && new Date(ds.expiresAt) < now) {
      warnings.push(`Skill "${ds.skill.name}" has expired`);
    }
  }

  // Check driver status
  const driverStatus = driver.driverStatus;
  if (driverStatus === "UNAVAILABLE" || driverStatus === "ABSENT") {
    errors.push(`Driver is ${driverStatus.toLowerCase()}`);
  } else if (driverStatus !== "AVAILABLE" && driverStatus !== "COMPLETED") {
    warnings.push(`Driver status is ${driverStatus}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get assignment quality metrics for a set of assignments
 */
export interface AssignmentQualityMetrics {
  totalAssignments: number;
  assignmentsWithWarnings: number;
  assignmentsWithErrors: number;
  averageScore: number;
  skillCoverage: number;
  licenseCompliance: number;
  fleetAlignment: number;
  workloadBalance: number;
}

export async function getAssignmentQualityMetrics(
  assignments: DriverAssignmentResult[],
): Promise<AssignmentQualityMetrics> {
  const totalAssignments = assignments.length;

  const assignmentsWithWarnings = assignments.filter(
    (a) => a.score.warnings.length > 0,
  ).length;

  const assignmentsWithErrors = assignments.filter(
    (a) => a.score.errors.length > 0,
  ).length;

  const averageScore =
    totalAssignments > 0
      ? assignments.reduce((sum, a) => sum + a.score.score, 0) /
        totalAssignments
      : 0;

  const skillCoverage =
    totalAssignments > 0
      ? assignments.reduce((sum, a) => sum + a.score.factors.skillsMatch, 0) /
        totalAssignments
      : 0;

  const licenseCompliance =
    totalAssignments > 0
      ? assignments.reduce((sum, a) => sum + a.score.factors.licenseValid, 0) /
        totalAssignments
      : 0;

  const fleetAlignment =
    totalAssignments > 0
      ? assignments.reduce((sum, a) => sum + a.score.factors.fleetMatch, 0) /
        totalAssignments
      : 0;

  const workloadBalance =
    totalAssignments > 0
      ? assignments.reduce((sum, a) => sum + a.score.factors.workload, 0) /
        totalAssignments
      : 0;

  return {
    totalAssignments,
    assignmentsWithWarnings,
    assignmentsWithErrors,
    averageScore: Math.round(averageScore),
    skillCoverage: Math.round(skillCoverage),
    licenseCompliance: Math.round(licenseCompliance),
    fleetAlignment: Math.round(fleetAlignment),
    workloadBalance: Math.round(workloadBalance),
  };
}
