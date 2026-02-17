import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  optimizationJobs,
  routeStops,
  users,
  vehicles,
  USER_ROLES,
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
  const tenantCtx = extractTenantContext(request);
  if (!tenantCtx) {
    return NextResponse.json(
      { error: "Contexto de tenant faltante" },
      { status: 401 },
    );
  }

  setTenantContext(tenantCtx);

  try {
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

    // Obtener datos del conductor
    const driver = await db.query.users.findFirst({
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
    });

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

    // Obtener el inicio del dia actual (medianoche)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Buscar el route_stop mas reciente del conductor para hoy.
    // Se ordena por createdAt DESC para obtener la parada del job MAS NUEVO,
    // evitando tomar paradas de un job anterior fallido del mismo dia.
    const todayStops = await db.query.routeStops.findMany({
      where: and(
        eq(routeStops.companyId, tenantCtx.companyId),
        eq(routeStops.userId, driverId),
        gte(routeStops.createdAt, today),
        lt(routeStops.createdAt, tomorrow),
      ),
      orderBy: [desc(routeStops.createdAt)],
      limit: 1,
    });

    // Buscar vehiculo asignado (para info complementaria)
    const assignedVehicle = await db.query.vehicles.findFirst({
      where: and(
        withTenantFilter(vehicles, [], tenantCtx.companyId),
        eq(vehicles.assignedDriverId, driverId),
        eq(vehicles.active, true),
      ),
    });

    const hasStopsToday = todayStops.length > 0;
    const activeJobId = hasStopsToday ? todayStops[0].jobId : null;
    const routeVehicleId = hasStopsToday ? todayStops[0].vehicleId : null;

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

    // Obtener el job
    const activeJob = await db.query.optimizationJobs.findFirst({
      where: eq(optimizationJobs.id, activeJobId),
    });

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

    // Obtener el vehiculo de la ruta (puede ser distinto al asignado permanentemente)
    const routeVehicle = routeVehicleId
      ? await db.query.vehicles.findFirst({
          where: and(
            withTenantFilter(vehicles, [], tenantCtx.companyId),
            eq(vehicles.id, routeVehicleId),
          ),
        })
      : assignedVehicle;

    // Obtener todas las paradas del conductor para este job
    const stops = await db.query.routeStops.findMany({
      where: and(
        eq(routeStops.jobId, activeJob.id),
        eq(routeStops.userId, driverId),
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
          },
        },
      },
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
        const parsedResult = JSON.parse(activeJob.result);
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

    // Construir lista de paradas para la app movil
    const stopsData = stops.map((stop) => ({
      id: stop.id,
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
        start: stop.timeWindowStart?.toISOString() || null,
        end: stop.timeWindowEnd?.toISOString() || null,
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

    return NextResponse.json({
      data: {
        driver: driverResponse,
        vehicle: vehicleResponse,
        route: {
          id: routeId,
          jobId: activeJob.id,
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
