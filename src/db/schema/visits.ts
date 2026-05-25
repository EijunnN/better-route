import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { optimizationJobs } from "./optimization";
import { orders } from "./orders";
import { routeStops } from "./routing";
import { users } from "./users";

/**
 * Visit outcome values. SUCCESS = order was delivered; FAILURE = the
 * driver attempted but didn't deliver (and recorded a reason).
 */
export const VISIT_OUTCOME = {
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
} as const;

/**
 * `delivery_visits` — immutable record of every physical attempt to
 * deliver an Order. See ADR-0005.
 *
 * Append-only: application code never UPDATEs or DELETEs from this
 * table. Each terminal transition on a `RouteStop` (driver marks
 * COMPLETED or FAILED) inserts one row.
 *
 * Two coordinate pairs:
 *  - `intended_*`: where the driver was supposed to go (the address
 *    the RouteStop had at the moment of the attempt).
 *  - `gps_*`: where the driver actually was when they confirmed the
 *    outcome. May diverge from intended for legitimate reasons (GPS
 *    noise indoors, customer coordinated remotely, etc.).
 *
 * Trazability for an Order = `SELECT * FROM delivery_visits
 * WHERE order_id = X ORDER BY attempted_at`.
 */
export const deliveryVisits = pgTable(
  "delivery_visits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    routeStopId: uuid("route_stop_id")
      .notNull()
      .references(() => routeStops.id, { onDelete: "cascade" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Plan (OptimizationJob) the RouteStop belonged to. */
    planId: uuid("plan_id").references(() => optimizationJobs.id, {
      onDelete: "set null",
    }),
    /** When the driver opened the stop (started the visit). */
    attemptedAt: timestamp("attempted_at").notNull().defaultNow(),
    /** When the driver confirmed the outcome. */
    completedAt: timestamp("completed_at").notNull().defaultNow(),
    outcome: varchar("outcome", { length: 20 })
      .notNull()
      .$type<keyof typeof VISIT_OUTCOME>(),
    /**
     * Failure reason — free-text now, sourced from the company's
     * `companyDeliveryPolicy.failureReasons` picker. Legacy enum keys
     * like `CUSTOMER_ABSENT` are still valid here for historical rows.
     */
    failureReason: varchar("failure_reason", { length: 80 }),
    notes: text("notes"),
    /** Photo URLs stored in R2. */
    evidenceUrls: jsonb("evidence_urls").$type<string[]>(),
    /** Address the RouteStop had at attempt time. */
    intendedAddress: text("intended_address").notNull(),
    intendedLatitude: varchar("intended_latitude", { length: 20 }).notNull(),
    intendedLongitude: varchar("intended_longitude", { length: 20 }).notNull(),
    /** Driver's real GPS position when confirming outcome. May diverge. */
    gpsLatitude: varchar("gps_latitude", { length: 20 }),
    gpsLongitude: varchar("gps_longitude", { length: 20 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("delivery_visits_company_id_idx").on(table.companyId),
    index("delivery_visits_order_id_idx").on(table.orderId),
    index("delivery_visits_route_stop_id_idx").on(table.routeStopId),
    index("delivery_visits_driver_id_idx").on(table.driverId),
    index("delivery_visits_attempted_at_idx").on(table.attemptedAt),
  ],
);

export type DeliveryVisit = typeof deliveryVisits.$inferSelect;
export type NewDeliveryVisit = typeof deliveryVisits.$inferInsert;
