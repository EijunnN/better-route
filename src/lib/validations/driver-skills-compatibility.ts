import { isExpired, isExpiringSoon } from "./driver-skill";

/**
 * Represents a skill with its expiry information
 */
export interface SkillWithExpiry {
  id: string;
  code: string;
  name: string;
  category: string;
  obtainedAt: Date | string;
  expiresAt: Date | string | null;
  active: boolean;
}

/**
 * Result of driver skills compatibility validation
 */
export interface DriverSkillsCompatibilityResult {
  compatible: boolean;
  validSkills: string[];
  missingSkills: string[];
  expiredSkills: string[];
  expiringSoonSkills: string[];
  warnings: string[];
  errors: string[];
}

/**
 * Validates if a driver has all required skills for a route or order
 *
 * @param driverSkills - Skills assigned to the driver with expiry info
 * @param requiredSkillCodes - Array of skill codes required for the route/order
 * @param options - Optional configuration
 * @returns Compatibility result with details
 */
export function validateDriverSkillsCompatibility(
  driverSkills: SkillWithExpiry[],
  requiredSkillCodes: string[],
  options: {
    allowExpiringSoon?: boolean;
    requireActiveOnly?: boolean;
  } = {}
): DriverSkillsCompatibilityResult {
  const {
    allowExpiringSoon = true,
    requireActiveOnly = true,
  } = options;

  const result: DriverSkillsCompatibilityResult = {
    compatible: true,
    validSkills: [],
    missingSkills: [],
    expiredSkills: [],
    expiringSoonSkills: [],
    warnings: [],
    errors: [],
  };

  // Normalize driver skills to a map for easy lookup
  const skillsMap = new Map<string, SkillWithExpiry>();
  for (const skill of driverSkills) {
    // Skip inactive skills if requireActiveOnly is true
    if (requireActiveOnly && !skill.active) {
      continue;
    }
    skillsMap.set(skill.code, skill);
  }

  // Check each required skill
  for (const requiredCode of requiredSkillCodes) {
    const skill = skillsMap.get(requiredCode);

    if (!skill) {
      // Driver doesn't have this skill at all
      result.missingSkills.push(requiredCode);
      result.compatible = false;
      result.errors.push(
        `El conductor no posee la habilidad requerida: ${requiredCode}`
      );
      continue;
    }

    // Check if skill is expired
    if (skill.expiresAt && isExpired(skill.expiresAt.toString())) {
      result.expiredSkills.push(requiredCode);
      result.compatible = false;
      result.errors.push(
        `La habilidad ${requiredCode} (${skill.name}) ha vencido el ${new Date(skill.expiresAt).toLocaleDateString()}`
      );
      continue;
    }

    // Check if skill is expiring soon
    if (skill.expiresAt && isExpiringSoon(skill.expiresAt.toString())) {
      result.expiringSoonSkills.push(requiredCode);
      result.warnings.push(
        `La habilidad ${requiredCode} (${skill.name}) vence pronto: ${new Date(skill.expiresAt).toLocaleDateString()}`
      );
    }

    // Skill is valid
    result.validSkills.push(requiredCode);
  }

  // If not allowing expiring soon skills, downgrade compatible status
  if (!allowExpiringSoon && result.expiringSoonSkills.length > 0) {
    result.compatible = false;
    result.errors.push(
      `${result.expiringSoonSkills.length} habilidad(es) vence(n) pronto y no son aceptadas`
    );
  }

  return result;
}

/**
 * Gets all drivers who have valid required skills
 *
 * @param driversWithSkills - Array of drivers with their skills
 * @param requiredSkillCodes - Array of skill codes required
 * @returns Array of driver IDs who are compatible
 */
export function filterDriversByRequiredSkills<T extends { id: string; skills: SkillWithExpiry[] }>(
  driversWithSkills: T[],
  requiredSkillCodes: string[]
): Array<T & { compatibilityResult: DriverSkillsCompatibilityResult }> {
  return driversWithSkills
    .map(driver => ({
      ...driver,
      compatibilityResult: validateDriverSkillsCompatibility(
        driver.skills,
        requiredSkillCodes
      ),
    }))
    .filter(driver => driver.compatibilityResult.compatible);
}

/**
 * Checks if a single driver can handle an order based on skills
 *
 * @param driverSkills - Skills assigned to the driver
 * @param orderRequiredSkills - Skills required for the order
 * @returns Boolean indicating compatibility
 */
export function canDriverHandleOrder(
  driverSkills: SkillWithExpiry[],
  orderRequiredSkills: string[]
): boolean {
  const result = validateDriverSkillsCompatibility(
    driverSkills,
    orderRequiredSkills
  );
  return result.compatible;
}

/**
 * Formats compatibility result for API response
 */
export function formatDriverSkillsCompatibilityResponse(
  result: DriverSkillsCompatibilityResult
): {
  compatible: boolean;
  message: string;
  summary: {
    total: number;
    valid: number;
    missing: number;
    expired: number;
    expiringSoon: number;
  };
  details: DriverSkillsCompatibilityResult;
} {
  const totalRequiredSkills =
    result.validSkills.length +
    result.missingSkills.length +
    result.expiredSkills.length +
    result.expiringSoonSkills.length;

  let message = "El conductor tiene todas las habilidades requeridas";

  if (!result.compatible) {
    if (result.expiredSkills.length > 0) {
      message = "El conductor tiene habilidades vencidas";
    } else if (result.missingSkills.length > 0) {
      message = "Al conductor le faltan habilidades requeridas";
    } else {
      message = "El conductor no es compatible con los requisitos";
    }
  } else if (result.expiringSoonSkills.length > 0) {
    message = "El conductor tiene todas las habilidades, pero algunas vencen pronto";
  }

  return {
    compatible: result.compatible,
    message,
    summary: {
      total: totalRequiredSkills,
      valid: result.validSkills.length,
      missing: result.missingSkills.length,
      expired: result.expiredSkills.length,
      expiringSoon: result.expiringSoonSkills.length,
    },
    details: result,
  };
}

/**
 * Calculates a quality score for driver-skill assignment
 * Higher score means better match
 *
 * @param result - Compatibility result
 * @returns Score from 0 to 100
 */
export function calculateDriverSkillsQualityScore(
  result: DriverSkillsCompatibilityResult
): number {
  if (!result.compatible) {
    return 0;
  }

  const totalSkills =
    result.validSkills.length +
    result.expiringSoonSkills.length;

  if (totalSkills === 0) {
    return 100;
  }

  // Deduct points for expiring skills
  const penaltyPerExpiring = 10;
  const score = 100 - (result.expiringSoonSkills.length * penaltyPerExpiring);

  return Math.max(0, score);
}
