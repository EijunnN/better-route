// Type for grouped orders (multiple orders at same location)
export interface GroupedOrder {
  // Representative order (first one in the group)
  id: string;
  trackingId: string;
  address: string;
  latitude: string | number;
  longitude: string | number;
  weightRequired: number;
  volumeRequired: number;
  promisedDate: Date | null;
  serviceTime: number;
  // All orders in this group (including the representative)
  groupedOrderIds: string[];
  groupedTrackingIds: string[];
}

// Map to track grouped orders for ungrouping later
export type OrderGroupMap = Map<string, { orderIds: string[]; trackingIds: string[] }>;

/**
 * Group orders that share the same coordinates
 * Returns grouped orders and a map to ungroup later
 */
export function groupOrdersByLocation<
  T extends {
    id: string;
    trackingId: string;
    latitude: string | number;
    longitude: string | number;
  },
>(
  orders: T[],
): {
  groupedOrders: (T & {
    groupedOrderIds: string[];
    groupedTrackingIds: string[];
  })[];
  groupMap: OrderGroupMap;
} {
  const locationMap = new Map<string, T[]>();

  // Group by coordinates (rounded to 6 decimal places for precision)
  for (const order of orders) {
    const lat = parseFloat(String(order.latitude)).toFixed(6);
    const lng = parseFloat(String(order.longitude)).toFixed(6);
    const key = `${lat},${lng}`;

    const existing = locationMap.get(key) || [];
    existing.push(order);
    locationMap.set(key, existing);
  }

  const groupedOrders: (T & {
    groupedOrderIds: string[];
    groupedTrackingIds: string[];
  })[] = [];
  const groupMap: OrderGroupMap = new Map();

  for (const [, ordersAtLocation] of locationMap) {
    // Use first order as representative
    const representative = ordersAtLocation[0];
    const orderIds = ordersAtLocation.map((o) => o.id);
    const trackingIds = ordersAtLocation.map((o) => o.trackingId);

    groupedOrders.push({
      ...representative,
      groupedOrderIds: orderIds,
      groupedTrackingIds: trackingIds,
    });

    // Store mapping for ungrouping
    groupMap.set(representative.id, { orderIds, trackingIds });
  }

  return { groupedOrders, groupMap };
}
