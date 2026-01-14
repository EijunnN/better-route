import { and, desc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { setTenantContext } from "@/lib/tenant";
import { ORDER_STATUS } from "@/lib/validations/order";

/**
 * GeoJSON API endpoint for order visualization on map
 * Returns orders as GeoJSON FeatureCollection for map rendering
 */

function extractTenantContext(request: NextRequest) {
  const companyId = request.headers.get("x-company-id");
  const userId = request.headers.get("x-user-id");
  if (!companyId) return null;
  return { companyId, userId: userId || undefined };
}

// Query parameter validation schema
const geojsonQuerySchema = z.object({
  status: z
    .enum([...ORDER_STATUS, "ALL"])
    .optional()
    .default("ALL"),
  search: z.string().optional(),
  // Bounding box filter: minLng,minLat,maxLng,maxLat
  bbox: z.string().optional(),
  // Clustering zoom level (for future optimization)
  zoom: z.coerce.number().min(0).max(22).optional(),
  limit: z.coerce.number().min(1).max(10000).optional().default(5000),
});

// Status to hex color mapping for map markers
const STATUS_COLORS: Record<string, string> = {
  PENDING: "#6B7280", // gray-500
  ASSIGNED: "#2563EB", // blue-600
  IN_PROGRESS: "#EAB308", // yellow-500
  COMPLETED: "#16A34A", // green-600
  FAILED: "#DC2626", // red-600
  CANCELLED: "#9CA3AF", // gray-400
};

export async function GET(request: NextRequest) {
  try {
    // Extract tenant context
    const tenantContext = extractTenantContext(request);
    if (!tenantContext) {
      return NextResponse.json(
        { error: "Tenant context required" },
        { status: 401 },
      );
    }

    setTenantContext(tenantContext);

    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = Object.fromEntries(searchParams.entries());
    const validatedParams = geojsonQuerySchema.safeParse(queryParams);

    if (!validatedParams.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: validatedParams.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { status, search, bbox, limit } = validatedParams.data;

    // Build query conditions
    const conditions = [eq(orders.companyId, tenantContext.companyId)];

    // Filter by status if not ALL
    if (status !== "ALL") {
      conditions.push(eq(orders.status, status));
    }

    // Search filter
    if (search) {
      conditions.push(
        sql`(${orders.trackingId} ILIKE ${`%${search}%`} OR ${orders.customerName} ILIKE ${`%${search}%`} OR ${orders.address} ILIKE ${`%${search}%`})`,
      );
    }

    // Bounding box filter for performance
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(",").map(Number);
      if (
        !Number.isNaN(minLng) &&
        !Number.isNaN(minLat) &&
        !Number.isNaN(maxLng) &&
        !Number.isNaN(maxLat) &&
        minLng >= -180 &&
        minLng <= 180 &&
        maxLng >= -180 &&
        maxLng <= 180 &&
        minLat >= -90 &&
        minLat <= 90 &&
        maxLat >= -90 &&
        maxLat <= 90 &&
        minLng < maxLng &&
        minLat < maxLat
      ) {
        conditions.push(
          sql`CAST(${orders.longitude} AS DOUBLE PRECISION) >= ${minLng}
              AND CAST(${orders.longitude} AS DOUBLE PRECISION) <= ${maxLng}
              AND CAST(${orders.latitude} AS DOUBLE PRECISION) >= ${minLat}
              AND CAST(${orders.latitude} AS DOUBLE PRECISION) <= ${maxLat}`,
        );
      }
    }

    // Fetch orders from database
    const ordersList = await db
      .select({
        id: orders.id,
        trackingId: orders.trackingId,
        customerName: orders.customerName,
        address: orders.address,
        latitude: orders.latitude,
        longitude: orders.longitude,
        status: orders.status,
      })
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt))
      .limit(limit);

    // Convert to GeoJSON FeatureCollection
    const features = ordersList
      .filter((order) => {
        // Filter out invalid coordinates
        const lat = parseFloat(order.latitude);
        const lng = parseFloat(order.longitude);
        return (
          !Number.isNaN(lat) &&
          !Number.isNaN(lng) &&
          lat >= -90 &&
          lat <= 90 &&
          lng >= -180 &&
          lng <= 180 &&
          !(lat === 0 && lng === 0) // Filter out null island
        );
      })
      .map((order) => {
        const lat = parseFloat(order.latitude);
        const lng = parseFloat(order.longitude);

        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [lng, lat], // GeoJSON uses [longitude, latitude] order
          },
          properties: {
            id: order.id,
            trackingId: order.trackingId,
            customerName: order.customerName || "",
            address: order.address,
            status: order.status,
            color: STATUS_COLORS[order.status] || STATUS_COLORS.PENDING,
          },
        };
      });

    const geojson = {
      type: "FeatureCollection",
      features,
      // Metadata for client-side handling
      metadata: {
        total: features.length,
        limit,
        filtered: status !== "ALL" ? status : undefined,
        bbox: bbox || undefined,
      },
    };

    return NextResponse.json(geojson);
  } catch (error) {
    console.error("Error generating GeoJSON:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
