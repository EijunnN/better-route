/**
 * Trace a time window from order → routeStop so we can see at which
 * layer the +5h offset (Lima vs UTC) is being introduced.
 *
 *   bun run scripts/inspect-time-window.ts <trackingId>
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, routeStops } from "@/db/schema";

const trackingId = process.argv[2];
if (!trackingId) {
  console.error("Uso: bun run scripts/inspect-time-window.ts <trackingId>");
  process.exit(1);
}

const order = await db.query.orders.findFirst({
  where: eq(orders.trackingId, trackingId),
});

if (!order) {
  console.error(`No se encontró order con trackingId="${trackingId}"`);
  process.exit(1);
}

console.log("\n=== ORDER ===");
console.log({
  id: order.id,
  trackingId: order.trackingId,
  status: order.status,
  promisedDate: order.promisedDate?.toISOString() ?? null,
  promisedDateLocal: order.promisedDate?.toString() ?? null,
  timeWindowStart_raw: order.timeWindowStart,
  timeWindowEnd_raw: order.timeWindowEnd,
});

const stops = await db.query.routeStops.findMany({
  where: eq(routeStops.orderId, order.id),
  orderBy: [desc(routeStops.createdAt)],
});

console.log(`\n=== ROUTE STOPS (${stops.length}) ===`);
for (const s of stops) {
  console.log({
    id: s.id,
    status: s.status,
    sequence: s.sequence,
    timeWindowStart_iso: s.timeWindowStart?.toISOString() ?? null,
    timeWindowEnd_iso: s.timeWindowEnd?.toISOString() ?? null,
    timeWindowStart_local: s.timeWindowStart?.toString() ?? null,
    timeWindowEnd_local: s.timeWindowEnd?.toString() ?? null,
  });
}

process.exit(0);
