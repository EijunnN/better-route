import { and, desc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  orders,
  routeStops,
  users,
  USER_ROLES,
  ORDER_STATUS,
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
 * GET /api/mobile/driver/my-orders
 *
 * Endpoint para la app movil de conductores.
 * Devuelve los pedidos asignados al conductor autenticado.
 * Util para ver pedidos antes de que se genere la ruta del dia.
 *
 * Headers requeridos:
 * - x-company-id: ID de la empresa
 * - x-user-id: ID del usuario (opcional si usa Bearer token)
 * - Authorization: Bearer {token}
 *
 * Query params opcionales:
 * - status: Filtrar por estado (ASSIGNED, IN_PROGRESS, COMPLETED, etc.)
 * - limit: Numero maximo de resultados (default: 50)
 * - offset: Desplazamiento para paginacion (default: 0)
 *
 * Respuesta:
 * - orders: Lista de pedidos asignados al conductor
 * - total: Numero total de pedidos
 * - summary: Resumen de pedidos por estado
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

    // Obtener parametros de query
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Obtener los pedidos asignados al conductor a traves de route_stops
    // Un pedido esta asignado a un conductor si tiene un route_stop con ese userId
    const assignedOrdersQuery = db
      .selectDistinct({
        orderId: routeStops.orderId,
      })
      .from(routeStops)
      .where(
        and(
          withTenantFilter(routeStops, [], tenantCtx.companyId),
          eq(routeStops.userId, driverId),
        ),
      );

    // Obtener los IDs de pedidos asignados
    const assignedOrderIds = await assignedOrdersQuery;
    const orderIds = assignedOrderIds.map((r) => r.orderId);

    if (orderIds.length === 0) {
      return NextResponse.json({
        data: {
          orders: [],
          total: 0,
          summary: {
            pending: 0,
            assigned: 0,
            inProgress: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
          },
        },
      });
    }

    // Construir condiciones de filtro
    const baseCondition = and(
      withTenantFilter(orders, [], tenantCtx.companyId),
      sql`${orders.id} IN ${orderIds}`,
      eq(orders.active, true),
    );

    // Validar que el status sea valido
    const validStatuses = Object.keys(ORDER_STATUS);
    const isValidStatus = statusFilter && validStatuses.includes(statusFilter);

    const filterCondition =
      statusFilter && isValidStatus
        ? and(baseCondition, sql`${orders.status} = ${statusFilter}`)
        : baseCondition;

    // Obtener pedidos con paginacion
    const ordersData = await db.query.orders.findMany({
      where: filterCondition,
      orderBy: [desc(orders.updatedAt)],
      limit,
      offset,
      with: {
        timeWindowPreset: {
          columns: {
            name: true,
            startTime: true,
            endTime: true,
            strictness: true,
          },
        },
      },
    });

    // Obtener el total de pedidos (sin paginacion)
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(filterCondition);

    const total = countResult[0]?.count || 0;

    // Obtener resumen por estado (todos los pedidos asignados, sin filtro de status)
    const summaryResult = await db
      .select({
        status: orders.status,
        count: sql<number>`count(*)`,
      })
      .from(orders)
      .where(baseCondition)
      .groupBy(orders.status);

    const summary = {
      pending: 0,
      assigned: 0,
      inProgress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    summaryResult.forEach((row) => {
      const statusKey = row.status?.toLowerCase().replace("_", "") as keyof typeof summary;
      if (row.status === "PENDING") summary.pending = Number(row.count);
      else if (row.status === "ASSIGNED") summary.assigned = Number(row.count);
      else if (row.status === "IN_PROGRESS") summary.inProgress = Number(row.count);
      else if (row.status === "COMPLETED") summary.completed = Number(row.count);
      else if (row.status === "FAILED") summary.failed = Number(row.count);
      else if (row.status === "CANCELLED") summary.cancelled = Number(row.count);
    });

    // Obtener informacion de las paradas asociadas a cada pedido
    const stopsInfo = await db.query.routeStops.findMany({
      where: and(
        withTenantFilter(routeStops, [], tenantCtx.companyId),
        eq(routeStops.userId, driverId),
        sql`${routeStops.orderId} IN ${orderIds}`,
      ),
      columns: {
        orderId: true,
        status: true,
        sequence: true,
        estimatedArrival: true,
        timeWindowStart: true,
        timeWindowEnd: true,
        routeId: true,
      },
    });

    const stopsMap = new Map(stopsInfo.map((s) => [s.orderId, s]));

    // Formatear respuesta de pedidos
    const formattedOrders = ordersData.map((order) => {
      const stopInfo = stopsMap.get(order.id);

      return {
        id: order.id,
        trackingId: order.trackingId,
        status: order.status,
        // Cliente
        customer: {
          name: order.customerName,
          phone: order.customerPhone,
          email: order.customerEmail,
        },
        // Ubicacion
        address: order.address,
        latitude: order.latitude,
        longitude: order.longitude,
        // Capacidad requerida
        capacity: {
          weight: order.weightRequired,
          volume: order.volumeRequired,
          value: order.orderValue,
          units: order.unitsRequired,
        },
        // Ventana horaria
        timeWindow: {
          presetName: order.timeWindowPreset?.name || null,
          start: order.timeWindowStart || order.timeWindowPreset?.startTime || null,
          end: order.timeWindowEnd || order.timeWindowPreset?.endTime || null,
          strictness: order.strictness || order.timeWindowPreset?.strictness || "SOFT",
        },
        // Tipo de pedido y prioridad
        orderType: order.orderType,
        priority: order.priority,
        // Fecha prometida
        promisedDate: order.promisedDate?.toISOString() || null,
        // Skills requeridas
        requiredSkills: order.requiredSkills
          ? order.requiredSkills.split(",").map((s) => s.trim())
          : [],
        // Notas
        notes: order.notes,
        // Campos personalizados
        customFields: order.customFields,
        // Informacion de la parada (si existe)
        stop: stopInfo
          ? {
              status: stopInfo.status,
              sequence: stopInfo.sequence,
              routeId: stopInfo.routeId,
              estimatedArrival: stopInfo.estimatedArrival?.toISOString() || null,
              timeWindowStart: stopInfo.timeWindowStart?.toISOString() || null,
              timeWindowEnd: stopInfo.timeWindowEnd?.toISOString() || null,
            }
          : null,
        // Fechas
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      };
    });

    return NextResponse.json({
      data: {
        orders: formattedOrders,
        total: Number(total),
        limit,
        offset,
        summary,
      },
    });
  } catch (error) {
    console.error("Error fetching driver orders:", error);

    // Manejar error de autenticacion
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "No autorizado. Por favor inicie sesion." },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { error: "Error al obtener los pedidos del conductor" },
      { status: 500 },
    );
  }
}
