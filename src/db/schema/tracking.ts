import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";
import { vehicles } from "./vehicles";
import { orders } from "./orders";
import { optimizationJobs } from "./optimization";

// ============================================
// DRIVER LOCATION TRACKING
// ============================================

/**
 * Source of location data
 */
export const LOCATION_SOURCE = {
  GPS: "GPS", // From device GPS
  MANUAL: "MANUAL", // Manually entered
  GEOFENCE: "GEOFENCE", // Triggered by geofence
  NETWORK: "NETWORK", // From network/cell tower
} as const;

/**
 * Driver locations - stores GPS tracking history
 * Used for real-time monitoring and route auditing
 */
export const driverLocations = pgTable("driver_locations", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  driverId: uuid("driver_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id, {
    onDelete: "set null",
  }),
  // Route context (nullable - driver may not be on a route)
  jobId: uuid("job_id").references(() => optimizationJobs.id, {
    onDelete: "set null",
  }),
  routeId: varchar("route_id", { length: 100 }),
  stopSequence: integer("stop_sequence"), // Current stop being approached

  // GPS coordinates
  latitude: varchar("latitude", { length: 20 }).notNull(),
  longitude: varchar("longitude", { length: 20 }).notNull(),
  accuracy: integer("accuracy"), // Meters
  altitude: integer("altitude"), // Meters (optional)
  speed: integer("speed"), // km/h
  heading: integer("heading"), // Degrees 0-360

  // Metadata
  source: varchar("source", { length: 20 })
    .notNull()
    .$type<keyof typeof LOCATION_SOURCE>()
    .default("GPS"),
  batteryLevel: integer("battery_level"), // Percentage 0-100
  isMoving: boolean("is_moving").default(true),

  // Timestamps
  recordedAt: timestamp("recorded_at").notNull(), // When GPS was captured on device
  createdAt: timestamp("created_at").notNull().defaultNow(), // When saved to DB
}, (table) => [
  index("driver_locations_company_id_idx").on(table.companyId),
  // Drops the single-column driver_id index — every query that
  // currently uses it also needs ordering by recorded_at DESC, so the
  // composite below covers it for free and makes "latest position per
  // driver" queries an index-only scan.
  index("driver_locations_driver_recorded_at_idx").on(
    table.driverId,
    table.recordedAt.desc(),
  ),
  index("driver_locations_recorded_at_idx").on(table.recordedAt),
]);

// ============================================
// TRACKING - Customer-facing delivery tracking
// ============================================

// Tracking tokens - URL-safe tokens for customer tracking links
export const trackingTokens = pgTable("tracking_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  trackingId: varchar("tracking_id", { length: 50 }).notNull(), // copied from order for fast lookup
  token: varchar("token", { length: 255 }).notNull().unique(),
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("tracking_tokens_token_idx").on(table.token),
  index("tracking_tokens_company_tracking_id_idx").on(table.companyId, table.trackingId),
]);

// Company tracking settings - per-company configuration for tracking pages
export const companyTrackingSettings = pgTable("company_tracking_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" })
    .unique(),
  trackingEnabled: boolean("tracking_enabled").notNull().default(false),
  showMap: boolean("show_map").notNull().default(true),
  showDriverLocation: boolean("show_driver_location").notNull().default(true),
  showDriverName: boolean("show_driver_name").notNull().default(false),
  showDriverPhoto: boolean("show_driver_photo").notNull().default(false),
  showEvidence: boolean("show_evidence").notNull().default(true),
  showEta: boolean("show_eta").notNull().default(true),
  showTimeline: boolean("show_timeline").notNull().default(true),
  brandColor: varchar("brand_color", { length: 20 }).default("#3B82F6"),
  logoUrl: varchar("logo_url", { length: 500 }),
  customMessage: varchar("custom_message", { length: 500 }),
  tokenExpiryHours: integer("token_expiry_hours").default(48),
  autoGenerateTokens: boolean("auto_generate_tokens").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
