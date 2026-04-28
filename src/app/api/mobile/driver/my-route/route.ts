import { and, asc, eq, gte, lt } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  optimizationJobs,
  routeStops,
  USER_ROLES,
  users,
  vehicles,
} from "@/db/schema";
import { withTenantFilter } from "@/db/tenant-aware";
import { getAuthenticatedUser } from "@/lib/auth/auth-api";
import { Action, EntityType } from "@/lib/auth/authorization";
import { requireRoutePermission } from "@/lib/infra/api-middleware";
import { setTenantContext } from "@/lib/infra/tenant";
import { extractTenantContextAuthed } from "@/lib/routing/route-helpers";
import { safeParseJson } from "@/lib/utils/safe-json";

/**
 * GET /api/mobile/driver/my-route
 *
 * Endpoint para la app movil de conductores.
 * Devuelve la ruta activa del conductor autenticado para el dia actual.
 *
 * Headers requeridos:
 * - x-company-id: ID de la empresa
 * - x-user-id: ID del usuario (opcional si usa Bearer token)
 * - Authorization: Bearer {token}
 *
 * Respuesta:
 * - driver: Datos del conductor (nombre, foto, vehiculo asignado)
 * - route: Datos de la ruta (paradas ordenadas, metricas)
 * - Si no hay ruta para hoy, route es null
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRoutePermission(
      request,
      EntityType.ROUTE,
      Action.READ,
    );
    if (authResult instanceof NextResponse) return authResult;
    const tenantCtx = extractTenantContextAuthed(request, authResult);
    if (tenantCtx instanceof NextResponse) return tenantCtx;
    setTenantContext(tenantCtx);

    // Obtener el usuario autenticado
    const authUser = await getAuthenticatedUser(request);

    // Verificar que el usuario sea un conductor
    if (authUser.role !== USER_ROLES.CONDUCTOR) {
      return NextResponse.json(
        { error: "Este endpoint es solo para conductores" },
        { status: 403 },
      );
    }

    const driverId = authUser.userId;

    // Obtener el inicio del dia actual (medianoche)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Fetch driver info, today's stops, and assigned vehicle in parallel
    const [driver, allTodayStops, assignedVehicle] = await Promise.all([
      db.query.users.findFirst({
        where: and(
          withTenantFilter(users, [], tenantCtx.companyId),
          eq(users.id, driverId),
        ),
        columns: {
          id: true,
          name: true,
          email: true,
          phone: true,
          photo: true,
          identification: true,
          driverStatus: true,
          licenseNumber: true,
          licenseExpiry: true,
          licenseCategories: true,
        },
      }),
      db.query.routeStops.findMany({
        where: and(
          eq(routeStops.companyId, tenantCtx.companyId),
          eq(routeStops.userId, driverId),
          gte(routeStops.createdAt, today),
          lt(routeStops.createdAt, tomorrow),
        ),
        orderBy: [asc(routeStops.sequence)],
        with: {
          order: {
            columns: {
              id: true,
              trackingId: true,
              customerName: true,
              customerPhone: true,
              customerEmail: true,
              notes: true,
              weightRequired: true,
              volumeRequired: true,
              orderValue: true,
              unitsRequired: true,
              customFields: true,
              // Pulled in for the time window fallback below — when
              // the route stop's timestamp is missing (the optimizer
              // didn't stamp one because the order had no resolved
              // window at plan time), we compose a timestamp from the
              // order's HH:MM string so the driver still sees the
              // window instead of `--:--`.
              timeWindowStart: true,
              timeWindowEnd: true,
              promisedDate: true,
            },
          },
        },
      }),
      db.query.vehicles.findFirst({
        where: and(
          withTenantFilter(vehicles, [], tenantCtx.companyId),
          eq(vehicles.assignedDriverId, driverId),
          eq(vehicles.active, true),
        ),
      }),
    ]);

    if (!driver) {
      return NextResponse.json(
        { error: "Conductor no encontrado" },
        { status: 404 },
      );
    }

    // Respuesta base del conductor
    const driverResponse = {
      id: driver.id,
      name: driver.name,
      email: driver.email,
      phone: driver.phone,
      photo: driver.photo,
      identification: driver.identification,
      status: driver.driverStatus || "AVAILABLE",
      license: {
        number: driver.licenseNumber,
        expiry: driver.licenseExpiry?.toISOString() || null,
        categories: driver.licenseCategories,
      },
    };

    const hasStopsToday = allTodayStops.length > 0;
    // Usar el job más reciente para metadata (distancia, duración)
    const latestStop = hasStopsToday
      ? allTodayStops.reduce(
          (latest, s) => (s.createdAt > latest.createdAt ? s : latest),
          allTodayStops[0],
        )
      : null;
    const activeJobId = latestStop?.jobId ?? null;
    const routeVehicleId = latestStop?.vehicleId ?? null;

    // Si no hay ruta para hoy, devolver conductor con vehiculo pero sin ruta
    if (!activeJobId) {
      return NextResponse.json({
        data: {
          driver: driverResponse,
          vehicle: assignedVehicle
            ? {
                id: assignedVehicle.id,
                name: assignedVehicle.name,
                plate: assignedVehicle.plate,
                brand: assignedVehicle.brand,
                model: assignedVehicle.model,
                maxOrders: assignedVehicle.maxOrders,
                origin: {
                  address: assignedVehicle.originAddress,
                  latitude: assignedVehicle.originLatitude,
                  longitude: assignedVehicle.originLongitude,
                },
              }
            : null,
          route: null,
          metrics: null,
          message: "No tienes rutas asignadas para hoy",
        },
      });
    }

    // Fetch job and route vehicle in parallel
    const [activeJob, routeVehicle] = await Promise.all([
      db.query.optimizationJobs.findFirst({
        where: eq(optimizationJobs.id, activeJobId),
      }),
      routeVehicleId
        ? db.query.vehicles.findFirst({
            where: and(
              withTenantFilter(vehicles, [], tenantCtx.companyId),
              eq(vehicles.id, routeVehicleId),
            ),
          })
        : Promise.resolve(assignedVehicle),
    ]);

    if (!activeJob) {
      return NextResponse.json({
        data: {
          driver: driverResponse,
          vehicle: null,
          route: null,
          metrics: null,
        },
      });
    }

    // Usar todas las paradas del día (ya cargadas con órdenes desde la query inicial).
    // Deduplicar por orderId: si una orden aparece en múltiples jobs, usar la del job más reciente.
    const stopsByOrder = new Map<string, (typeof allTodayStops)[0]>();
    for (const stop of allTodayStops) {
      const existing = stopsByOrder.get(stop.orderId);
      if (!existing || stop.createdAt > existing.createdAt) {
        stopsByOrder.set(stop.orderId, stop);
      }
    }
    const stops = [...stopsByOrder.values()].sort((a, b) => {
      // Agrupar: primero stops activos (PENDING/IN_PROGRESS), luego terminados
      const activeStatuses = ["PENDING", "IN_PROGRESS"];
      const aActive = activeStatuses.includes(a.status) ? 0 : 1;
      const bActive = activeStatuses.includes(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (a.sequence ?? 0) - (b.sequence ?? 0);
    });

    // Si no hay paradas
    if (stops.length === 0) {
      return NextResponse.json({
        data: {
          driver: driverResponse,
          vehicle: routeVehicle
            ? {
                id: routeVehicle.id,
                name: routeVehicle.name,
                plate: routeVehicle.plate,
                brand: routeVehicle.brand,
                model: routeVehicle.model,
                maxOrders: routeVehicle.maxOrders,
                origin: {
                  address: routeVehicle.originAddress,
                  latitude: routeVehicle.originLatitude,
                  longitude: routeVehicle.originLongitude,
                },
              }
            : null,
          route: null,
          metrics: null,
          message: "No hay paradas asignadas",
        },
      });
    }

    // Respuesta del vehiculo
    const vehicleResponse = routeVehicle
      ? {
          id: routeVehicle.id,
          name: routeVehicle.name,
          plate: routeVehicle.plate,
          brand: routeVehicle.brand,
          model: routeVehicle.model,
          maxOrders: routeVehicle.maxOrders,
          origin: {
            address: routeVehicle.originAddress,
            latitude: routeVehicle.originLatitude,
            longitude: routeVehicle.originLongitude,
          },
        }
      : null;

    // Calcular metricas de la ruta
    const completedStops = stops.filter((s) => s.status === "COMPLETED").length;
    const pendingStops = stops.filter((s) => s.status === "PENDING").length;
    const inProgressStops = stops.filter(
      (s) => s.status === "IN_PROGRESS",
    ).length;
    const failedStops = stops.filter((s) => s.status === "FAILED").length;
    const skippedStops = stops.filter((s) => s.status === "SKIPPED").length;

    // Calcular metricas de distancia y duracion desde el resultado del job
    let totalDistance = 0;
    let totalDuration = 0;

    if (activeJob.result && routeVehicle) {
      try {
        const parsedResult = safeParseJson<{
          routes?: Array<{
            vehicleId?: string;
            totalDistance?: number;
            totalDuration?: number;
          }>;
        }>(activeJob.result);
        const vehicleRoute = parsedResult.routes?.find(
          (r: { vehicleId?: string }) => r.vehicleId === routeVehicle.id,
        );
        if (vehicleRoute) {
          totalDistance = vehicleRoute.totalDistance || 0;
          totalDuration = vehicleRoute.totalDuration || 0;
        }
      } catch {
        // Ignorar errores de parse
      }
    }

    // Calcular peso y volumen total
    let totalWeight = 0;
    let totalVolume = 0;
    let totalValue = 0;
    let totalUnits = 0;

    stops.forEach((stop) => {
      if (stop.order) {
        totalWeight += stop.order.weightRequired || 0;
        totalVolume += stop.order.volumeRequired || 0;
        totalValue += stop.order.orderValue || 0;
        totalUnits += stop.order.unitsRequired || 0;
      }
    });

    // Compose a timestamp from the order's HH:MM time and a base
    // date so the mobile fallback below has something to render. The
    // route stop's column is a real `timestamp` (Date), the order's
    // column is `time` (HH:MM:SS string) — different shapes for the
    // same logical data because the optimizer joins date + time when
    // it stamps the route. Falls back to today if the order has no
    // promised date attached.
    const composeTimestamp = (
      base: Date | null | undefined,
      time: string | null | undefined,
    ): string | null => {
      if (!time) return null;
      const parts = time.split(":");
      const h = Number(parts[0]);
      const m = Number(parts[1]);
      const s = parts[2] !== undefined ? Number(parts[2]) : 0;
      if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return null;
      const composed = new Date(base ?? Date.now());
      composed.setHours(h, m, s, 0);
      return composed.toISOString();
    };

    // Construir lista de paradas para la app movil
    const stopsData = stops.map((stop) => ({
      id: stop.id,
      jobId: stop.jobId,
      sequence: stop.sequence,
      status: stop.status,
      // Ubicacion
      address: stop.address,
      latitude: stop.latitude,
      longitude: stop.longitude,
      // Tiempos
      estimatedArrival: stop.estimatedArrival?.toISOString() || null,
      estimatedServiceTime: stop.estimatedServiceTime,
      timeWindow: {
        start:
          stop.timeWindowStart?.toISOString() ??
          composeTimestamp(
            stop.order?.promisedDate,
            stop.order?.timeWindowStart,
          ),
        end:
          stop.timeWindowEnd?.toISOString() ??
          composeTimestamp(stop.order?.promisedDate, stop.order?.timeWindowEnd),
      },
      // Timestamps de ejecucion
      startedAt: stop.startedAt?.toISOString() || null,
      completedAt: stop.completedAt?.toISOString() || null,
      // Notas y motivo de fallo
      notes: stop.notes,
      failureReason: stop.failureReason,
      evidenceUrls: stop.evidenceUrls,
      // Datos del pedido
      order: stop.order
        ? {
            id: stop.order.id,
            trackingId: stop.order.trackingId,
            customerName: stop.order.customerName,
            customerPhone: stop.order.customerPhone,
            customerEmail: stop.order.customerEmail,
            notes: stop.order.notes,
            weight: stop.order.weightRequired,
            volume: stop.order.volumeRequired,
            value: stop.order.orderValue,
            units: stop.order.unitsRequired,
            customFields: stop.order.customFields,
          }
        : null,
    }));

    const routeId = stops[0].routeId;
    const allJobIds = [...new Set(stops.map((s) => s.jobId))];

    return NextResponse.json({
      data: {
        driver: driverResponse,
        vehicle: vehicleResponse,
        route: {
          id: routeId,
          jobId: activeJob.id,
          jobIds: allJobIds,
          jobCreatedAt: activeJob.createdAt.toISOString(),
          stops: stopsData,
        },
        metrics: {
          totalStops: stops.length,
          completedStops,
          pendingStops,
          inProgressStops,
          failedStops,
          skippedStops,
          progressPercentage:
            stops.length > 0
              ? Math.round((completedStops / stops.length) * 100)
              : 0,
          totalDistance, // en metros
          totalDuration, // en segundos
          totalWeight,
          totalVolume,
          totalValue,
          totalUnits,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching driver route:", error);

    // Manejar error de autenticacion
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "No autorizado. Por favor inicie sesion." },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { error: "Error al obtener la ruta del conductor" },
      { status: 500 },
    );
  }
}
