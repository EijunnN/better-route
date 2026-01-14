import { and, eq, inArray, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  orders,
  USER_ROLES,
  userAvailability,
  userSkills,
  users,
  vehicles,
} from "@/db/schema";
import { DEFAULT_ASSIGNMENT_CONFIG } from "@/lib/driver-assignment";
import { setTenantContext } from "@/lib/tenant";
import {
  type AssignmentSuggestionsSchema,
  assignmentSuggestionsSchema,
} from "@/lib/validations/driver-assignment";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");

  if (!companyId) {
    return null;
  }

  return {
    companyId,
    userId: userId || undefined,
  };
}

export async function POST(request: NextRequest) {
  try {
    const tenantCtx = extractTenantContext(request);
    if (!tenantCtx) {
      return NextResponse.json(
        { error: "Missing tenant context" },
        { status: 401 },
      );
    }

    setTenantContext(tenantCtx);

    const body = await request.json();

    // Validate request body
    const validationResult = assignmentSuggestionsSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const data: AssignmentSuggestionsSchema = validationResult.data;

    // Get vehicle details with fleets
    const vehicle = await db.query.vehicles.findFirst({
      where: eq(vehicles.id, data.vehicleId),
      with: {
        vehicleFleets: {
          with: {
            fleet: true,
          },
          where: (vf, { eq }) => eq(vf.active, true),
        },
      },
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    if (vehicle.companyId !== tenantCtx.companyId) {
      return NextResponse.json(
        { error: "Vehicle does not belong to this company" },
        { status: 403 },
      );
    }

    // Get orders and required skills
    const orderIds = data.routeStops.map((s) => s.orderId);
    const ordersList = await db.query.orders.findMany({
      where: and(
        eq(orders.companyId, tenantCtx.companyId),
        inArray(orders.id, orderIds),
      ),
    });

    // Collect required skills
    const requiredSkills = new Set<string>();
    for (const order of ordersList) {
      if (order.requiredSkills) {
        const skills =
          typeof order.requiredSkills === "string"
            ? JSON.parse(order.requiredSkills)
            : order.requiredSkills;
        for (const skill of skills as string[]) {
          requiredSkills.add(skill);
        }
      }
    }

    // Get vehicle fleet IDs
    const vehicleFleetIds =
      vehicle.vehicleFleets?.map((vf) => vf.fleetId) || [];
    const _primaryVehicleFleetId = vehicleFleetIds[0] || null;

    // Get available drivers (users with CONDUCTOR role) from same fleet or secondary fleets
    const availableDrivers = await db.query.users.findMany({
      where: and(
        eq(users.companyId, tenantCtx.companyId),
        eq(users.role, USER_ROLES.CONDUCTOR),
        eq(users.active, true),
        vehicleFleetIds.length > 0
          ? sql`(${users.primaryFleetId} IN (${sql.join(
              vehicleFleetIds.map((id) => sql`${id}`),
              sql`, `,
            )}) OR ${users.id} IN (
          SELECT user_id FROM user_secondary_fleets
          WHERE fleet_id IN (${sql.join(
            vehicleFleetIds.map((id) => sql`${id}`),
            sql`, `,
          )})
          AND active = true
          AND company_id = ${tenantCtx.companyId}
        ))`
          : sql`1=1`,
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
      },
    });

    // Filter by status and calculate scores
    const scoredDrivers = [];

    for (const driver of availableDrivers) {
      // Check status
      if (
        driver.driverStatus === "UNAVAILABLE" ||
        driver.driverStatus === "ABSENT"
      ) {
        continue;
      }

      // Check license
      const now = new Date();
      const licenseExpiry = driver.licenseExpiry
        ? new Date(driver.licenseExpiry)
        : null;
      const daysUntilExpiry = licenseExpiry
        ? Math.ceil(
            (licenseExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          )
        : -1;

      if (
        daysUntilExpiry < 0 &&
        DEFAULT_ASSIGNMENT_CONFIG.requireLicenseValid
      ) {
        continue; // Skip expired licenses
      }

      // Calculate skills match
      const driverSkillIds = new Set(driver.userSkills.map((ds) => ds.skillId));

      const matchedSkills = Array.from(requiredSkills).filter((skillId) =>
        driverSkillIds.has(skillId),
      );

      const skillsMatch =
        requiredSkills.size > 0
          ? (matchedSkills.length / requiredSkills.size) * 100
          : 100;

      // Check skill expiration
      let hasExpiredSkills = false;
      for (const ds of driver.userSkills) {
        if (ds.expiresAt && new Date(ds.expiresAt) < now) {
          hasExpiredSkills = true;
          break;
        }
      }

      // Calculate fleet match score
      let fleetMatch = 25;
      if (
        driver.primaryFleetId &&
        vehicleFleetIds.includes(driver.primaryFleetId)
      ) {
        fleetMatch = 100;
      } else {
        // Secondary fleet match is already filtered in the query
        fleetMatch = 75;
      }

      // Calculate license score
      let licenseScore = 100;
      if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
        licenseScore = Math.round((daysUntilExpiry / 30) * 100);
      }

      // Calculate availability score
      let availabilityScore = 100;
      if (driver.driverStatus === "COMPLETED") {
        availabilityScore = 50;
      } else if (driver.driverStatus !== "AVAILABLE") {
        availabilityScore = 50;
      }

      // Calculate overall score based on strategy
      const weights = getStrategyWeights(data.strategy);
      const score = Math.round(
        (skillsMatch * weights.skills +
          availabilityScore * weights.availability +
          licenseScore * weights.license +
          fleetMatch * weights.fleet) /
          (weights.skills +
            weights.availability +
            weights.license +
            weights.fleet),
      );

      // Collect warnings
      const warnings: string[] = [];
      if (hasExpiredSkills) {
        warnings.push("Has expired skills");
      }
      if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
        warnings.push(`License expires in ${daysUntilExpiry} days`);
      }
      if (skillsMatch < 100 && requiredSkills.size > 0) {
        warnings.push(
          `${matchedSkills.length}/${requiredSkills.size} skills matched`,
        );
      }
      if (
        !driver.primaryFleetId ||
        !vehicleFleetIds.includes(driver.primaryFleetId)
      ) {
        warnings.push("Driver from secondary fleet");
      }

      // Collect errors
      const errors: string[] = [];
      if (daysUntilExpiry < 0) {
        errors.push("License expired");
      }
      if (skillsMatch === 0 && requiredSkills.size > 0) {
        errors.push("Missing required skills");
      }

      scoredDrivers.push({
        driverId: driver.id,
        driverName: driver.name,
        score,
        factors: {
          skillsMatch: Math.round(skillsMatch),
          availability: availabilityScore,
          licenseValid: licenseScore,
          fleetMatch,
          workload: 100, // No workload info in single route suggestion
        },
        warnings,
        errors,
        details: {
          identification: driver.identification,
          status: driver.driverStatus,
          fleetId: driver.primaryFleetId,
          fleetName: driver.primaryFleet?.name,
          licenseNumber: driver.licenseNumber,
          licenseExpiry: driver.licenseExpiry,
        },
      });
    }

    // Sort by score (descending) and limit
    const suggestions = scoredDrivers
      .sort((a, b) => b.score - a.score)
      .slice(0, data.limit);

    return NextResponse.json({
      data: suggestions,
      meta: {
        vehicleId: data.vehicleId,
        vehiclePlate: vehicle.plate,
        strategy: data.strategy,
        totalCandidates: scoredDrivers.length,
        returned: suggestions.length,
        requiredSkills: Array.from(requiredSkills),
      },
    });
  } catch (error) {
    console.error("Error getting assignment suggestions:", error);
    return NextResponse.json(
      { error: "Error getting assignment suggestions" },
      { status: 500 },
    );
  }
}

function getStrategyWeights(strategy: string) {
  switch (strategy) {
    case "SKILLS_FIRST":
      return { skills: 5, availability: 2, license: 3, fleet: 1 };
    case "AVAILABILITY":
      return { skills: 2, availability: 5, license: 3, fleet: 1 };
    case "FLEET_MATCH":
      return { skills: 2, availability: 2, license: 3, fleet: 5 };
    default:
      return { skills: 1, availability: 1, license: 1, fleet: 1 };
  }
}
