import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { drivers, driverSkills, vehicleSkills } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import {
  validateDriverSkillsCompatibility,
  formatDriverSkillsCompatibilityResponse,
  calculateDriverSkillsQualityScore,
  type SkillWithExpiry,
} from "@/lib/validations/driver-skills-compatibility";

/**
 * Schema for checking driver skills compatibility
 */
const compatibilityCheckSchema = z.object({
  requiredSkillCodes: z.array(z.string()).min(1, "Debe proporcionar al menos una habilidad requerida"),
  allowExpiringSoon: z.boolean().optional().default(true),
  requireActiveOnly: z.boolean().optional().default(true),
});

type CompatibilityCheckInput = z.infer<typeof compatibilityCheckSchema>;

/**
 * GET /api/drivers/[id]/skills-compatibility
 *
 * Checks if a driver has the required skills for a route or order
 *
 * Query params:
 * - requiredSkillCodes: Comma-separated list of required skill codes
 * - allowExpiringSoon: Whether to accept skills expiring soon (default: true)
 * - requireActiveOnly: Whether to only consider active skills (default: true)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: driverId } = await params;

    // Parse and validate query parameters
    const searchParams = request.nextUrl.searchParams;
    const requiredSkillCodesParam = searchParams.get("requiredSkillCodes");

    if (!requiredSkillCodesParam) {
      return NextResponse.json(
        {
          error: "Se requiere el parámetro 'requiredSkillCodes'",
          details: "Proporcione una lista de códigos de habilidades separados por comas",
        },
        { status: 400 }
      );
    }

    const requiredSkillCodes = requiredSkillCodesParam.split(",").map(s => s.trim());
    const allowExpiringSoon = searchParams.get("allowExpiringSoon") !== "false";
    const requireActiveOnly = searchParams.get("requireActiveOnly") !== "false";

    // Check if driver exists
    const driver = await db.query.drivers.findFirst({
      where: eq(drivers.id, driverId),
    });

    if (!driver) {
      return NextResponse.json(
        {
          error: "Conductor no encontrado",
          details: `No se encontró un conductor con ID ${driverId}`,
        },
        { status: 404 }
      );
    }

    // Get driver's skills with expiry information
    const driverSkillsData = await db.query.driverSkills.findMany({
      where: eq(driverSkills.driverId, driverId),
      with: {
        skill: true,
      },
    });

    // Transform to compatibility format
    const skillsWithExpiry: SkillWithExpiry[] = driverSkillsData
      .filter(ds => requireActiveOnly ? ds.active : true)
      .map(ds => ({
        id: ds.skill.id,
        code: ds.skill.code,
        name: ds.skill.name,
        category: ds.skill.category,
        obtainedAt: ds.obtainedAt,
        expiresAt: ds.expiresAt,
        active: ds.active,
      }));

    // Validate compatibility
    const compatibilityResult = validateDriverSkillsCompatibility(
      skillsWithExpiry,
      requiredSkillCodes,
      {
        allowExpiringSoon,
        requireActiveOnly,
      }
    );

    // Calculate quality score
    const qualityScore = calculateDriverSkillsQualityScore(compatibilityResult);

    // Format response
    const response = {
      driverId,
      driverName: driver.name,
      driverIdentification: driver.identification,
      ...formatDriverSkillsCompatibilityResponse(compatibilityResult),
      qualityScore,
      driverSkills: skillsWithExpiry.map(s => ({
        code: s.code,
        name: s.name,
        category: s.category,
        obtainedAt: s.obtainedAt,
        expiresAt: s.expiresAt,
        active: s.active,
        required: requiredSkillCodes.includes(s.code),
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error checking driver skills compatibility:", error);
    return NextResponse.json(
      {
        error: "Error al verificar compatibilidad de habilidades",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/drivers/[id]/skills-compatibility
 *
 * Checks driver skills compatibility with POST body for complex requests
 *
 * Body:
 * - requiredSkillCodes: Array of required skill codes
 * - allowExpiringSoon: Whether to accept skills expiring soon (default: true)
 * - requireActiveOnly: Whether to only consider active skills (default: true)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: driverId } = await params;

    // Parse and validate request body
    const body = await request.json();

    const validationResult = compatibilityCheckSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Datos de solicitud inválidos",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { requiredSkillCodes, allowExpiringSoon, requireActiveOnly } =
      validationResult.data;

    // Check if driver exists
    const driver = await db.query.drivers.findFirst({
      where: eq(drivers.id, driverId),
    });

    if (!driver) {
      return NextResponse.json(
        {
          error: "Conductor no encontrado",
          details: `No se encontró un conductor con ID ${driverId}`,
        },
        { status: 404 }
      );
    }

    // Get driver's skills with expiry information
    const driverSkillsData = await db.query.driverSkills.findMany({
      where: eq(driverSkills.driverId, driverId),
      with: {
        skill: true,
      },
    });

    // Transform to compatibility format
    const skillsWithExpiry: SkillWithExpiry[] = driverSkillsData
      .filter(ds => requireActiveOnly ? ds.active : true)
      .map(ds => ({
        id: ds.skill.id,
        code: ds.skill.code,
        name: ds.skill.name,
        category: ds.skill.category,
        obtainedAt: ds.obtainedAt,
        expiresAt: ds.expiresAt,
        active: ds.active,
      }));

    // Validate compatibility
    const compatibilityResult = validateDriverSkillsCompatibility(
      skillsWithExpiry,
      requiredSkillCodes,
      {
        allowExpiringSoon,
        requireActiveOnly,
      }
    );

    // Calculate quality score
    const qualityScore = calculateDriverSkillsQualityScore(compatibilityResult);

    // Format response
    const response = {
      driverId,
      driverName: driver.name,
      driverIdentification: driver.identification,
      ...formatDriverSkillsCompatibilityResponse(compatibilityResult),
      qualityScore,
      driverSkills: skillsWithExpiry.map(s => ({
        code: s.code,
        name: s.name,
        category: s.category,
        obtainedAt: s.obtainedAt,
        expiresAt: s.expiresAt,
        active: s.active,
        required: requiredSkillCodes.includes(s.code),
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error checking driver skills compatibility:", error);

    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: "Cuerpo de solicitud inválido",
          details: "El cuerpo de la solicitud debe ser JSON válido",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Error al verificar compatibilidad de habilidades",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
