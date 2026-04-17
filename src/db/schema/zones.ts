import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { vehicles } from "./vehicles";

// ============================================
// ZONES - Geographic zones for route planning
// ============================================

// Zone types
export const ZONE_TYPES = {
  DELIVERY: "DELIVERY",
  PICKUP: "PICKUP",
  MIXED: "MIXED",
  RESTRICTED: "RESTRICTED",
} as const;

// Zones - Geographic territories for assigning vehicles and days
export const zones = pgTable("zones", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 })
    .$type<keyof typeof ZONE_TYPES>()
    .default("DELIVERY"),
  // GeoJSON polygon coordinates
  // Format: { "type": "Polygon", "coordinates": [[[lng, lat], ...]] }
  geometry: jsonb("geometry").notNull(),
  // Zone color for map visualization
  color: varchar("color", { length: 20 }).default("#3B82F6"),
  // Is this the default zone?
  isDefault: boolean("is_default").notNull().default(false),
  // Days of week this zone is active
  activeDays: jsonb("active_days").$type<string[]>(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Zone-Vehicle assignments (which vehicles are dedicated to which zones)
export const zoneVehicles = pgTable("zone_vehicles", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "cascade" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  // Days of week this vehicle is assigned to this zone
  assignedDays: jsonb("assigned_days").$type<string[]>(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("zone_vehicles_vehicle_id_idx").on(table.vehicleId),
  index("zone_vehicles_zone_id_idx").on(table.zoneId),
]);
