import { and, desc, eq, gte, lt } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  driverLocations,
  optimizationJobs,
  routeStops,
  users,
  vehicles,
  USER_ROLES,
  LOCATION_SOURCE,
} from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { setTenantContext } from "@/lib/infra/tenant";
import { getAuthenticatedUser } from "@/lib/auth/auth-api";

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

/**
 * Validates latitude value
 */
function isValidLatitude(lat: number): boolean {
  return typeof lat === "number" && lat >= -90 && lat <= 90;
}

/**
 * Validates longitude value
 */
function isValidLongitude(lng: number): boolean {
  return typeof lng === "number" && lng >= -180 && lng <= 180;
}

/**
 * POST /api/mobile/driver/location
 *
 * Endpoint para que la app móvil envíe la ubicación GPS del conductor.
 * Guarda el historial de ubicaciones para tracking en tiempo real.
 *
 * Headers requeridos:
 * - x-company-id: ID de la empresa
 * - Authorization: Bearer {token}
 *
 * Body:
 * {
 *   latitude: number (-90 to 90)
 *   longitude: number (-180 to 180)
 *   accuracy?: number (meters)
 *   altitude?: number (meters)
 *   speed?: number (km/h)
 *   heading?: number (degrees 0-360)
 *   batteryLevel?: number (0-100)
 *   recordedAt: string (ISO8601 timestamp)
 *   source?: "GPS" | "MANUAL" | "GEOFENCE" | "NETWORK"
 * }
 *
 * Respuesta:
 * - success: boolean
 * - locationId: string (ID del registro guardado)
 * - savedAt: string (timestamp del servidor)
 */
export async function POST(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Contexto de tenant faltante" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    // Autenticar usuario
    const authUser = await getAuthenticatedUser(request);

    // Verificar que sea conductor
    if (authUser.role !== USER_ROLES.CONDUCTOR) {
      return NextResponse.json(
        { error: "Este endpoint es solo para conductores" },
        { status: 403 },
      );
    }

    const driverId = authUser.userId;
    const companyId = tenantCtx.companyId;

    // Parsear body
    const body = await request.json();
    const {
      latitude,
      longitude,
      accuracy,
      altitude,
      speed,
      heading,
      batteryLevel,
      recordedAt,
      source = "GPS",
    } = body;

    // Validar campos requeridos
    if (latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { error: "latitude y longitude son requeridos" },
        { status: 400 },
      );
    }

    // Validar coordenadas
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (!isValidLatitude(lat)) {
      return NextResponse.json(
        { error: "latitude debe estar entre -90 y 90" },
        { status: 400 },
      );
    }

    if (!isValidLongitude(lng)) {
      return NextResponse.json(
        { error: "longitude debe estar entre -180 y 180" },
        { status: 400 },
      );
    }

    // Validar source
    const validSources = Object.keys(LOCATION_SOURCE);
    if (source && !validSources.includes(source)) {
      return NextResponse.json(
        { error: `source debe ser uno de: ${validSources.join(", ")}` },
        { status: 400 },
      );
    }

    // Validar recordedAt
    let recordedAtDate: Date;
    if (recordedAt) {
      recordedAtDate = new Date(recordedAt);
      if (isNaN(recordedAtDate.getTime())) {
        return NextResponse.json(
          { error: "recordedAt debe ser un timestamp ISO8601 válido" },
          { status: 400 },
        );
      }
      // No permitir timestamps muy en el futuro (más de 1 minuto)
      if (recordedAtDate.getTime() > Date.now() + 60000) {
        return NextResponse.json(
          { error: "recordedAt no puede ser en el futuro" },
          { status: 400 },
        );
      }
    } else {
      recordedAtDate = new Date();
    }

    // Validar accuracy (si se proporciona)
    if (accuracy !== undefined && (typeof accuracy !== "number" || accuracy < 0)) {
      return NextResponse.json(
        { error: "accuracy debe ser un número positivo (metros)" },
        { status: 400 },
      );
    }

    // Validar speed (si se proporciona)
    if (speed !== undefined && (typeof speed !== "number" || speed < 0)) {
      return NextResponse.json(
        { error: "speed debe ser un número positivo (km/h)" },
        { status: 400 },
      );
    }

    // Validar heading (si se proporciona)
    if (heading !== undefined && (typeof heading !== "number" || heading < 0 || heading > 360)) {
      return NextResponse.json(
        { error: "heading debe estar entre 0 y 360 grados" },
        { status: 400 },
      );
    }

    // Validar batteryLevel (si se proporciona)
    if (batteryLevel !== undefined && (typeof batteryLevel !== "number" || batteryLevel < 0 || batteryLevel > 100)) {
      return NextResponse.json(
        { error: "batteryLevel debe estar entre 0 y 100" },
        { status: 400 },
      );
    }

    // Buscar vehículo asignado al conductor
    const assignedVehicle = await db.query.vehicles.findFirst({
      where: and(
        withTenantFilter(vehicles, [], companyId),
        eq(vehicles.assignedDriverId, driverId),
      ),
      columns: {
        id: true,
      },
    });

    // Buscar job activo del día actual (para contexto de ruta)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const activeJob = await db.query.optimizationJobs.findFirst({
      where: and(
        withTenantFilter(optimizationJobs, [], companyId),
        eq(optimizationJobs.status, "COMPLETED"),
        gte(optimizationJobs.createdAt, today),
        lt(optimizationJobs.createdAt, tomorrow),
      ),
      columns: {
        id: true,
      },
      orderBy: desc(optimizationJobs.createdAt),
    });

    // Buscar parada actual del conductor (si tiene ruta)
    let routeId: string | null = null;
    let stopSequence: number | null = null;

    if (activeJob) {
      const currentStop = await db.query.routeStops.findFirst({
        where: and(
          eq(routeStops.jobId, activeJob.id),
          eq(routeStops.userId, driverId),
        ),
        columns: {
          routeId: true,
          sequence: true,
          status: true,
        },
        orderBy: [
          // Priorizar paradas en progreso, luego pendientes
          desc(routeStops.sequence),
        ],
      });

      if (currentStop) {
        routeId = currentStop.routeId;
        stopSequence = currentStop.sequence;
      }
    }

    // Determinar si está en movimiento (speed > 5 km/h)
    const isMoving = speed !== undefined ? speed > 5 : null;

    // Guardar ubicación
    const [savedLocation] = await db
      .insert(driverLocations)
      .values({
        companyId,
        driverId,
        vehicleId: assignedVehicle?.id || null,
        jobId: activeJob?.id || null,
        routeId,
        stopSequence,
        latitude: lat.toString(),
        longitude: lng.toString(),
        accuracy: accuracy ? Math.round(accuracy) : null,
        altitude: altitude ? Math.round(altitude) : null,
        speed: speed ? Math.round(speed) : null,
        heading: heading ? Math.round(heading) : null,
        source: source as keyof typeof LOCATION_SOURCE,
        batteryLevel: batteryLevel ? Math.round(batteryLevel) : null,
        isMoving,
        recordedAt: recordedAtDate,
      })
      .returning({
        id: driverLocations.id,
        createdAt: driverLocations.createdAt,
      });

    return NextResponse.json({
      success: true,
      locationId: savedLocation.id,
      savedAt: savedLocation.createdAt.toISOString(),
    }, { status: 201 });

  } catch (error) {
    console.error("Error saving driver location:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { error: "Error al guardar ubicación" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/mobile/driver/location
 *
 * Obtiene la última ubicación conocida del conductor autenticado.
 *
 * Headers requeridos:
 * - x-company-id: ID de la empresa
 * - Authorization: Bearer {token}
 *
 * Respuesta:
 * - location: Última ubicación o null si no hay registros
 */
export async function GET(request: NextRequest) {
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Contexto de tenant faltante" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
    const authUser = await getAuthenticatedUser(request);

    if (authUser.role !== USER_ROLES.CONDUCTOR) {
      return NextResponse.json(
        { error: "Este endpoint es solo para conductores" },
        { status: 403 },
      );
    }

    const driverId = authUser.userId;
    const companyId = tenantCtx.companyId;

    // Obtener última ubicación
    const lastLocation = await db.query.driverLocations.findFirst({
      where: and(
        eq(driverLocations.companyId, companyId),
        eq(driverLocations.driverId, driverId),
      ),
      orderBy: desc(driverLocations.recordedAt),
    });

    if (!lastLocation) {
      return NextResponse.json({
        location: null,
        message: "No hay ubicaciones registradas",
      });
    }

    return NextResponse.json({
      location: {
        id: lastLocation.id,
        latitude: parseFloat(lastLocation.latitude),
        longitude: parseFloat(lastLocation.longitude),
        accuracy: lastLocation.accuracy,
        altitude: lastLocation.altitude,
        speed: lastLocation.speed,
        heading: lastLocation.heading,
        source: lastLocation.source,
        batteryLevel: lastLocation.batteryLevel,
        isMoving: lastLocation.isMoving,
        recordedAt: lastLocation.recordedAt.toISOString(),
        savedAt: lastLocation.createdAt.toISOString(),
      },
    });

  } catch (error) {
    console.error("Error fetching driver location:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { error: "Error al obtener ubicación" },
      { status: 500 },
    );
  }
}
