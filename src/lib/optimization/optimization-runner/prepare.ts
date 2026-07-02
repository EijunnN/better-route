/**
 * Order grouping — collapse orders that share an exact location into one
 * VROOM job so the solver doesn't schedule N separate visits to the same
 * door. The grouped job carries the SUM of the group's demand and service
 * time; using only the representative's values (the old behavior) made
 * VROOM optimize with undercounted capacity and optimistic ETAs for every
 * stop after a large group.
 */

// Map to track grouped orders for ungrouping later
export type OrderGroupMap = Map<
  string,
  { orderIds: string[]; trackingIds: string[] }
>;

/** Fields the aggregation understands. All optional — summed when present. */
interface GroupableOrder {
  id: string;
  trackingId: string;
  latitude: string | number;
  longitude: string | number;
  weightRequired?: number;
  volumeRequired?: number;
  orderValue?: number;
  unitsRequired?: number;
  serviceTime?: number;
  priority?: number | null;
  orderType?: "NEW" | "RESCHEDULED" | "URGENT" | null;
  timeWindowStart?: string;
  timeWindowEnd?: string;
}

const ORDER_TYPE_PRECEDENCE: Record<string, number> = {
  URGENT: 3,
  RESCHEDULED: 2,
  NEW: 1,
};

/**
 * Group orders that share the same coordinates AND the same time window.
 * Orders at one location with different windows stay in separate groups —
 * a single visit can't honor two disjoint windows, and intersecting them
 * silently would fabricate a window nobody asked for.
 *
 * Returns grouped orders (with aggregated demand/service) and a map to
 * ungroup later.
 */
export function groupOrdersByLocation<T extends GroupableOrder>(
  orders: T[],
): {
  groupedOrders: (T & {
    groupedOrderIds: string[];
    groupedTrackingIds: string[];
  })[];
  groupMap: OrderGroupMap;
} {
  const locationMap = new Map<string, T[]>();

  // Group by coordinates (rounded to 6 decimal places ≈ 0.1 m) + window.
  for (const order of orders) {
    const lat = parseFloat(String(order.latitude)).toFixed(6);
    const lng = parseFloat(String(order.longitude)).toFixed(6);
    const window = `${order.timeWindowStart ?? ""}-${order.timeWindowEnd ?? ""}`;
    const key = `${lat},${lng}|${window}`;

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
    const representative = ordersAtLocation[0];
    const orderIds = ordersAtLocation.map((o) => o.id);
    const trackingIds = ordersAtLocation.map((o) => o.trackingId);

    if (ordersAtLocation.length === 1) {
      groupedOrders.push({
        ...representative,
        groupedOrderIds: orderIds,
        groupedTrackingIds: trackingIds,
      });
      groupMap.set(representative.id, { orderIds, trackingIds });
      continue;
    }

    // Aggregate demand across the whole group — VROOM must see the real
    // load and the real time at the door, not the first order's slice.
    let weightRequired = 0;
    let volumeRequired = 0;
    let orderValue = 0;
    let unitsRequired = 0;
    let serviceTime = 0;
    let priority: number | undefined;
    let orderType = representative.orderType ?? undefined;

    for (const o of ordersAtLocation) {
      weightRequired += o.weightRequired ?? 0;
      volumeRequired += o.volumeRequired ?? 0;
      orderValue += o.orderValue ?? 0;
      unitsRequired += o.unitsRequired ?? 1;
      serviceTime += o.serviceTime ?? 300;
      if (o.priority !== null && o.priority !== undefined) {
        priority =
          priority === undefined ? o.priority : Math.max(priority, o.priority);
      }
      const candidate = o.orderType ?? undefined;
      if (
        candidate &&
        (ORDER_TYPE_PRECEDENCE[candidate] ?? 0) >
          (orderType ? (ORDER_TYPE_PRECEDENCE[orderType] ?? 0) : 0)
      ) {
        orderType = candidate;
      }
    }

    groupedOrders.push({
      ...representative,
      weightRequired,
      volumeRequired,
      orderValue,
      unitsRequired,
      serviceTime,
      priority: priority ?? representative.priority,
      orderType,
      groupedOrderIds: orderIds,
      groupedTrackingIds: trackingIds,
    });

    // Store mapping for ungrouping
    groupMap.set(representative.id, { orderIds, trackingIds });
  }

  return { groupedOrders, groupMap };
}
