import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  companies,
  companyTrackingSettings,
  driverLocations,
  orders,
  routeStops,
  trackingTokens,
  users,
} from "@/db/schema";

/**
 * GET /api/public/tracking/[token]
 * Public (unauthenticated) endpoint for customers to track their orders.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    if (!token || token.length > 255) {
      return NextResponse.json(
        { error: "Token inválido" },
        { status: 400 },
      );
    }

    // 1. Look up the tracking token
    const tokenRecord = await db.query.trackingTokens.findFirst({
      where: and(
        eq(trackingTokens.token, token),
        eq(trackingTokens.active, true),
      ),
    });

    if (!tokenRecord) {
      return NextResponse.json(
        { error: "Enlace de seguimiento no encontrado o inactivo" },
        { status: 404 },
      );
    }

    // Check expiration
    if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Enlace de seguimiento expirado" },
        { status: 410 },
      );
    }

    // 2. Load the order
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, tokenRecord.orderId),
    });

    if (!order) {
      return NextResponse.json(
        { error: "Pedido no encontrado" },
        { status: 404 },
      );
    }

    // 3. Load company info
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, tokenRecord.companyId),
      columns: {
        id: true,
        commercialName: true,
      },
    });

    // 4. Load company tracking settings
    const settings = await db.query.companyTrackingSettings.findFirst({
      where: eq(companyTrackingSettings.companyId, tokenRecord.companyId),
    });

    // Default settings if none configured
    const effectiveSettings = {
      showMap: settings?.showMap ?? true,
      showDriverLocation: settings?.showDriverLocation ?? true,
      showDriverName: settings?.showDriverName ?? false,
      showDriverPhoto: settings?.showDriverPhoto ?? false,
      showEvidence: settings?.showEvidence ?? true,
      showEta: settings?.showEta ?? true,
      showTimeline: settings?.showTimeline ?? true,
    };

    // 5. Load the latest route stop for this order
    const stop = await db.query.routeStops.findFirst({
      where: eq(routeStops.orderId, tokenRecord.orderId),
      orderBy: [desc(routeStops.createdAt)],
    });

    // 6. Load driver info and location if applicable
    let driverData: {
      name?: string;
      photo?: string | null;
      location?: {
        latitude: number;
        longitude: number;
        speed: number | null;
        heading: number | null;
        recordedAt: string;
      } | null;
    } | null = null;

    if (stop?.userId && (effectiveSettings.showDriverName || effectiveSettings.showDriverLocation || effectiveSettings.showDriverPhoto)) {
      const driver = await db.query.users.findFirst({
        where: eq(users.id, stop.userId),
        columns: {
          id: true,
          name: true,
        },
      });

      if (driver) {
        driverData = {};

        if (effectiveSettings.showDriverName) {
          driverData.name = driver.name;
        }

        if (effectiveSettings.showDriverLocation) {
          const latestLocation = await db
            .select({
              latitude: driverLocations.latitude,
              longitude: driverLocations.longitude,
              speed: driverLocations.speed,
              heading: driverLocations.heading,
              recordedAt: driverLocations.recordedAt,
            })
            .from(driverLocations)
            .where(
              and(
                eq(driverLocations.companyId, tokenRecord.companyId),
                eq(driverLocations.driverId, driver.id),
              ),
            )
            .orderBy(desc(driverLocations.recordedAt))
            .limit(1);

          driverData.location = latestLocation[0]
            ? {
                latitude: parseFloat(latestLocation[0].latitude),
                longitude: parseFloat(latestLocation[0].longitude),
                speed: latestLocation[0].speed,
                heading: latestLocation[0].heading,
                recordedAt: latestLocation[0].recordedAt.toISOString(),
              }
            : null;
        }
      }
    }

    // 7. Build timeline from stop timestamps
    const timeline: { status: string; timestamp: string | null; label: string }[] = [];

    if (effectiveSettings.showTimeline) {
      timeline.push({
        status: "PENDING",
        timestamp: order.createdAt?.toISOString() ?? null,
        label: "Pedido registrado",
      });

      if (stop) {
        // ASSIGNED - when the stop was created (order was assigned to a route)
        timeline.push({
          status: "ASSIGNED",
          timestamp: stop.createdAt?.toISOString() ?? null,
          label: "Asignado a ruta",
        });

        if (stop.startedAt) {
          timeline.push({
            status: "IN_PROGRESS",
            timestamp: stop.startedAt.toISOString(),
            label: "En camino",
          });
        }

        if (stop.status === "COMPLETED" && stop.completedAt) {
          timeline.push({
            status: "COMPLETED",
            timestamp: stop.completedAt.toISOString(),
            label: "Entregado",
          });
        }

        if (stop.status === "FAILED" && stop.completedAt) {
          timeline.push({
            status: "FAILED",
            timestamp: stop.completedAt.toISOString(),
            label: "Entrega fallida",
          });
        }
      }
    }

    // 8. Build response
    const response = {
      company: {
        name: company?.commercialName ?? null,
        logoUrl: settings?.logoUrl ?? null,
        brandColor: settings?.brandColor ?? "#3B82F6",
        customMessage: settings?.customMessage ?? null,
      },
      settings: effectiveSettings,
      order: {
        trackingId: order.trackingId,
        status: order.status,
        address: order.address,
        latitude: order.latitude ? parseFloat(order.latitude) : null,
        longitude: order.longitude ? parseFloat(order.longitude) : null,
        customerName: order.customerName,
        promisedDate: order.promisedDate?.toISOString() ?? null,
        timeWindowStart: order.timeWindowStart,
        timeWindowEnd: order.timeWindowEnd,
      },
      stop: stop
        ? {
            status: stop.status,
            sequence: stop.sequence,
            estimatedArrival: stop.estimatedArrival?.toISOString() ?? null,
            startedAt: stop.startedAt?.toISOString() ?? null,
            completedAt: stop.completedAt?.toISOString() ?? null,
            failureReason: stop.status === "FAILED" ? stop.failureReason : null,
            evidenceUrls: effectiveSettings.showEvidence ? stop.evidenceUrls : null,
            notes: stop.notes,
          }
        : null,
      driver: driverData,
      timeline,
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, max-age=30, s-maxage=30",
      },
    });
  } catch (error) {
    console.error("Error in public tracking endpoint:", error);
    return NextResponse.json(
      { error: "Error al obtener información de seguimiento" },
      { status: 500 },
    );
  }
}
