/**
 * Quick diagnostic: given a tracking token, dump the token row, its
 * order, and every routeStop tied to that order — including raw
 * `evidenceUrls`. Helps when the public tracking page shows data that
 * doesn't match the order the user *thinks* the link points to.
 *
 *   bun run scripts/inspect-tracking-token.ts <token>
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, routeStops, trackingTokens } from "@/db/schema";

const token = process.argv[2];
if (!token) {
  console.error("Uso: bun run scripts/inspect-tracking-token.ts <token>");
  process.exit(1);
}

const tk = await db.query.trackingTokens.findFirst({
  where: eq(trackingTokens.token, token),
});

if (!tk) {
  console.error(`No se encontró tracking token "${token}"`);
  process.exit(1);
}

console.log("\n=== TRACKING TOKEN ===");
console.log({
  token: tk.token,
  orderId: tk.orderId,
  companyId: tk.companyId,
  active: tk.active,
  expiresAt: tk.expiresAt?.toISOString() ?? null,
  createdAt: tk.createdAt?.toISOString(),
});

const order = await db.query.orders.findFirst({
  where: eq(orders.id, tk.orderId),
});

console.log("\n=== ORDER (linked to token) ===");
console.log(
  order
    ? {
        id: order.id,
        trackingId: order.trackingId,
        status: order.status,
        customerName: order.customerName,
      }
    : "NULL — orphan token!",
);

if (!order) process.exit(1);

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
