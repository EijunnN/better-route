/**
 * Quick diagnostic: dump every routeStop row tied to a given order
 * trackingId and show whether `evidenceUrls` is actually persisted.
 *
 *   bun run scripts/inspect-order-evidence.ts ORD-0006
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, routeStops } from "@/db/schema";

const trackingId = process.argv[2];
if (!trackingId) {
  console.error("Uso: bun run scripts/inspect-order-evidence.ts <trackingId>");
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
  customerName: order.customerName,
});

const stops = await db.query.routeStops.findMany({
  where: eq(routeStops.orderId, order.id),
  orderBy: [desc(routeStops.createdAt)],
});

console.log(`\n=== ROUTE STOPS (${stops.length}) ===`);
for (const s of stops) {
  console.log({
    id: s.id,
    sequence: s.sequence,
    status: s.status,
    createdAt: s.createdAt?.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
    evidenceUrls: s.evidenceUrls,
    evidenceUrlsType: typeof s.evidenceUrls,
    evidenceUrlsIsArray: Array.isArray(s.evidenceUrls),
    notes: s.notes,
    failureReason: s.failureReason,
  });
}

process.exit(0);
