import { and, desc, eq, gte, lt } from "drizzle-orm";
import { after, type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  driverLocations,
  LOCATION_SOURCE,
  optimizationJobs,
  routeStops,
  USER_ROLES,
  vehicles,
} from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { getAuthenticatedUser } from "@/lib/auth/auth-api";
import { Action, EntityType } from "@/lib/auth/authorization";
import { recomputeRouteEtas } from "@/lib/eta";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { withContractHeader } from "@/lib/mobile-contract";
import { publishDriverLocationEvent } from "@/lib/realtime";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import { AUTH_ERRORS } from "@/lib/validations/auth";

// Pre-filtro del jobId del body: un string no-uuid en un eq() contra una
// columna uuid revienta en Postgres (22P02) con 500 en vez de ignorarse.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 *   routeId?: string (contexto de ruta del cliente)
 *   stopSequence?: number
 *   jobId?: string (uuid del optimization job)
 * }
 *
 * Respuesta:
 * - success: boolean
 * - locationId: string (ID del registro guardado)
 * - savedAt: string (timestamp del servidor)
 */
async function handlePost(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ROUTE_STOP,
      Action.UPDATE,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

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
      routeId: bodyRouteId,
      stopSequence: bodyStopSequence,
      jobId: bodyJobId,
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
      if (Number.isNaN(recordedAtDate.getTime())) {
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
    if (
      accuracy !== undefined &&
      (typeof accuracy !== "number" || accuracy < 0)
    ) {
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
    if (
      heading !== undefined &&
      (typeof heading !== "number" || heading < 0 || heading > 360)
    ) {
      return NextResponse.json(
        { error: "heading debe estar entre 0 y 360 grados" },
        { status: 400 },
      );
    }

    // Validar batteryLevel (si se proporciona)
    if (
      batteryLevel !== undefined &&
      (typeof batteryLevel !== "number" ||
        batteryLevel < 0 ||
        batteryLevel > 100)
    ) {
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

    // Contexto de ruta (FIX-7, refinado): el contexto que manda el cliente
    // gana solo si le pertenece — jobId se valida contra el tenant y routeId
    // contra los routeStops del propio driver. Un valor mal tipado o ajeno se
    // trata como ausente en vez de 400: un ping GPS nunca debe perderse por
    // contexto defectuoso. routeId/stopSequence se resuelven como PAR
    // coherente: o del body (routeId validado), o derivados juntos del mismo
    // stop — nunca mezclados de rutas distintas.
    let jobId: string | null = null;

    if (typeof bodyJobId === "string" && UUID_PATTERN.test(bodyJobId)) {
      const bodyJob = await db.query.optimizationJobs.findFirst({
        where: and(
          withTenantFilter(optimizationJobs, [], companyId),
          eq(optimizationJobs.id, bodyJobId),
        ),
        columns: { id: true },
      });
      jobId = bodyJob?.id ?? null;
    }

    if (!jobId) {
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
      jobId = activeJob?.id ?? null;
    }

    let routeId: string | null = null;
    let stopSequence: number | null = null;

    const claimedRouteId =
      typeof bodyRouteId === "string" &&
      bodyRouteId.length > 0 &&
      bodyRouteId.length <= 100
        ? bodyRouteId
        : null;

    if (claimedRouteId) {
      // El filtro por companyId es redundante con userId (ADR-0008: defensa
      // en profundidad como costo aceptado).
      const ownedStop = await db.query.routeStops.findFirst({
        where: and(
          eq(routeStops.companyId, companyId),
          eq(routeStops.routeId, claimedRouteId),
          eq(routeStops.userId, driverId),
        ),
        columns: {
          sequence: true,
        },
        orderBy: [desc(routeStops.sequence)],
      });

      if (ownedStop) {
        routeId = claimedRouteId;
        stopSequence =
          typeof bodyStopSequence === "number" &&
          Number.isInteger(bodyStopSequence)
            ? bodyStopSequence
            : ownedStop.sequence;
      }
    }

    if (routeId === null && jobId) {
      const currentStop = await db.query.routeStops.findFirst({
        where: and(
          eq(routeStops.companyId, companyId),
          eq(routeStops.jobId, jobId),
          eq(routeStops.userId, driverId),
        ),
        columns: {
          routeId: true,
          sequence: true,
        },
        orderBy: [desc(routeStops.sequence)],
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
        vehicleId: assignedVehicle?.id ?? null,
        jobId,
        routeId,
        stopSequence,
        latitude: lat.toString(),
        longitude: lng.toString(),
        // FIX-6: != null en vez de truthiness — 0 es un valor válido para
        // todos estos campos (accuracy perfecta, altitud al nivel del mar,
        // detenido, rumbo norte, batería agotada).
        accuracy: accuracy != null ? Math.round(accuracy) : null,
        altitude: altitude != null ? Math.round(altitude) : null,
        speed: speed != null ? Math.round(speed) : null,
        heading: heading != null ? Math.round(heading) : null,
        source: source as keyof typeof LOCATION_SOURCE,
        batteryLevel: batteryLevel != null ? Math.round(batteryLevel) : null,
        isMoving,
        recordedAt: recordedAtDate,
      })
      .returning({
        id: driverLocations.id,
        createdAt: driverLocations.createdAt,
      });

    // Push the new position onto the in-process monitoring bus so
    // every dashboard with an open SSE stream patches the marker
    // immediately. Without this, the driver only moves on the map at
    // the next 10s SWR poll — which felt stuck for the operator.
    publishDriverLocationEvent({
      companyId,
      driverId,
      routeId,
      latitude: lat,
      longitude: lng,
      heading: heading != null ? Math.round(heading) : null,
      speed: speed != null ? Math.round(speed) : null,
      isMoving,
    });

    // ETA en vivo: recalcular (con throttle interno) desde la nueva posición,
    // fuera del request para no sumar latencia al ping del driver.
    if (routeId) {
      const etaRouteId = routeId;
      after(() =>
        recomputeRouteEtas({
          companyId,
          driverId,
          routeId: etaRouteId,
          latitude: lat,
          longitude: lng,
        }).catch((err) =>
          console.warn("[ETA] recompute tras ping falló:", err),
        ),
      );
    }

    return NextResponse.json(
      {
        success: true,
        locationId: savedLocation.id,
        savedAt: savedLocation.createdAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error saving driver location:", error);

    if (error instanceof Error && error.message === AUTH_ERRORS.UNAUTHORIZED) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
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
async function handleGet(request: NextRequest) {
  let authResult: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    authResult = await getAuthenticatedUser(request);
  } catch {
    return NextResponse.json(
      { error: "Authentication required", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }
  const tenantCtx = extractTenantContextAuthed(request, authResult);
  if (tenantCtx instanceof NextResponse) return tenantCtx;
  setTenantContext(tenantCtx);

  try {
    // Self-only endpoint: returns ONLY the authenticated driver's own
    // location. Any other role is rejected — DRIVER:READ permission would
    // not be the right gate (admins shouldn't hit this endpoint either).
    if (authResult.role !== USER_ROLES.CONDUCTOR) {
      return NextResponse.json(
        { error: "Este endpoint es solo para conductores" },
        { status: 403 },
      );
    }

    const driverId = authResult.userId;
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

    return NextResponse.json(
      { error: "Error al obtener ubicación" },
      { status: 500 },
    );
  }
}

export const POST = withContractHeader(handlePost);
export const GET = withContractHeader(handleGet);
