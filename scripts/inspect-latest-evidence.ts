/**
 * Diagnostic: surface the latest orders + their route stops so we can
 * confirm whether a fresh delivery actually persisted evidenceUrls.
 *
 *   bun run scripts/inspect-latest-evidence.ts
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, routeStops, trackingTokens } from "@/db/schema";

const recentOrders = await db.query.orders.findMany({
  orderBy: [desc(orders.createdAt)],
  limit: 5,
});

console.log(`\nÚltimas ${recentOrders.length} órdenes:\n`);

for (const o of recentOrders) {
  const stops = await db.query.routeStops.findMany({
    where: eq(routeStops.orderId, o.id),
    orderBy: [desc(routeStops.updatedAt ?? routeStops.createdAt)],
  });
  const tokens = await db.query.trackingTokens.findMany({
    where: eq(trackingTokens.orderId, o.id),
    orderBy: [desc(trackingTokens.createdAt)],
    limit: 1,
  });

  console.log("─".repeat(72));
  console.log(`Order:    ${o.trackingId} — ${o.customerName}`);
  console.log(`Status:   ${o.status}`);
  console.log(`Created:  ${o.createdAt?.toISOString()}`);
  console.log(`OrderId:  ${o.id}`);
  console.log(
    `Token:    ${tokens[0] ? `http://localhost:3000/tracking/${tokens[0].token}` : "(sin tracking token)"}`,
  );
  console.log(`Stops:    ${stops.length}`);
  for (const s of stops) {
    const ev = s.evidenceUrls;
    const evDesc =
      ev === null
        ? "NULL"
        : Array.isArray(ev) && ev.length === 0
          ? "[]"
          : Array.isArray(ev)
            ? `[${ev.length} URL${ev.length === 1 ? "" : "s"}]`
            : `unexpected: ${typeof ev}`;
    console.log(
      `  • ${s.status.padEnd(11)} | seq=${s.sequence} | ev=${evDesc.padEnd(12)} | notes=${JSON.stringify(s.notes ?? null)}`,
    );
    if (Array.isArray(ev) && ev.length > 0) {
      for (const url of ev) console.log(`      → ${url}`);
    }
  }
  console.log();
}

process.exit(0);
