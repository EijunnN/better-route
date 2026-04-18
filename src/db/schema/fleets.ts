import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";
import { vehicles } from "./vehicles";

// Fleet types (kept for backward compatibility)
export const FLEET_TYPES = {
  HEAVY_LOAD: "HEAVY_LOAD",
  LIGHT_LOAD: "LIGHT_LOAD",
  EXPRESS: "EXPRESS",
  REFRIGERATED: "REFRIGERATED",
  SPECIAL: "SPECIAL",
} as const;

export const fleets = pgTable("fleets", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Campos legacy (mantenidos para compatibilidad)
  type: varchar("type", { length: 50 }).$type<keyof typeof FLEET_TYPES>(),
  weightCapacity: integer("weight_capacity"),
  volumeCapacity: integer("volume_capacity"),
  operationStart: time("operation_start"),
  operationEnd: time("operation_end"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("fleets_company_id_idx").on(table.companyId),
]);

// Vehicle-Fleet many-to-many relationship
export const vehicleFleets = pgTable("vehicle_fleets", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  fleetId: uuid("fleet_id")
    .notNull()
    .references(() => fleets.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("vehicle_fleets_vehicle_fleet_idx").on(table.vehicleId, table.fleetId),
  index("vehicle_fleets_fleet_id_idx").on(table.fleetId),
]);

// User-Fleet permissions (for viewing fleets)
export const userFleetPermissions = pgTable("user_fleet_permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fleetId: uuid("fleet_id")
    .notNull()
    .references(() => fleets.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Secondary fleets for users (many-to-many relationship, renamed from driver_secondary_fleets)
export const userSecondaryFleets = pgTable("user_secondary_fleets", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fleetId: uuid("fleet_id")
    .notNull()
    .references(() => fleets.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_secondary_fleets_user_fleet_idx").on(table.userId, table.fleetId),
]);

// Vehicle fleet history for tracking fleet changes
export const vehicleFleetHistory = pgTable("vehicle_fleet_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  previousFleetId: uuid("previous_fleet_id").references(() => fleets.id),
  newFleetId: uuid("new_fleet_id").references(() => fleets.id, {
    onDelete: "restrict",
  }),
  userId: uuid("user_id").references(() => users.id),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
