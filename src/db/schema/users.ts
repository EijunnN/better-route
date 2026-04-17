import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { fleets } from "./fleets";

// User roles - Unified with system roles
// These are the legacy role codes stored in users.role field
// New system uses roles table with dynamic permissions
export const USER_ROLES = {
  ADMIN_SISTEMA: "ADMIN_SISTEMA",
  ADMIN_FLOTA: "ADMIN_FLOTA",
  PLANIFICADOR: "PLANIFICADOR",
  MONITOR: "MONITOR",
  CONDUCTOR: "CONDUCTOR",
} as const;

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  // companyId is nullable for ADMIN_SISTEMA who can manage all companies
  companyId: uuid("company_id").references(() => companies.id, {
    onDelete: "restrict",
  }),
  // Basic user fields
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 })
    .notNull()
    .$type<keyof typeof USER_ROLES>(),
  phone: varchar("phone", { length: 50 }),

  // Driver-specific fields (nullable - only required if role=CONDUCTOR)
  identification: varchar("identification", { length: 50 }),
  birthDate: timestamp("birth_date"),
  photo: text("photo"),
  licenseNumber: varchar("license_number", { length: 100 }),
  licenseExpiry: timestamp("license_expiry"),
  licenseCategories: varchar("license_categories", { length: 255 }),
  certifications: text("certifications"),
  driverStatus: varchar("driver_status", { length: 50 }).$type<
    keyof typeof DRIVER_STATUS
  >(),
  primaryFleetId: uuid("primary_fleet_id").references(() => fleets.id, {
    onDelete: "set null",
  }),

  // Metadata
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("users_company_id_idx").on(table.companyId),
  index("users_company_role_idx").on(table.companyId, table.role),
]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  userId: uuid("user_id").references(() => users.id),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  changes: jsonb("changes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Driver status types
export const DRIVER_STATUS = {
  AVAILABLE: "AVAILABLE",
  ASSIGNED: "ASSIGNED",
  IN_ROUTE: "IN_ROUTE",
  ON_PAUSE: "ON_PAUSE",
  COMPLETED: "COMPLETED",
  UNAVAILABLE: "UNAVAILABLE",
  ABSENT: "ABSENT",
} as const;

// Valid driver status transitions
export const DRIVER_STATUS_TRANSITIONS: Record<
  keyof typeof DRIVER_STATUS,
  (keyof typeof DRIVER_STATUS)[]
> = {
  AVAILABLE: ["ASSIGNED", "UNAVAILABLE", "ABSENT"],
  ASSIGNED: ["IN_ROUTE", "AVAILABLE", "UNAVAILABLE", "ABSENT"],
  IN_ROUTE: ["ON_PAUSE", "COMPLETED", "UNAVAILABLE", "ABSENT"],
  ON_PAUSE: ["IN_ROUTE", "AVAILABLE", "UNAVAILABLE", "ABSENT"],
  COMPLETED: ["AVAILABLE", "ASSIGNED", "UNAVAILABLE"],
  UNAVAILABLE: ["AVAILABLE"],
  ABSENT: ["AVAILABLE", "UNAVAILABLE"],
};

// NOTE: Table "drivers" has been removed and merged with "users"
// Users with role "CONDUCTOR" now contain all driver-specific fields

// Days of week
export const DAYS_OF_WEEK = {
  MONDAY: "MONDAY",
  TUESDAY: "TUESDAY",
  WEDNESDAY: "WEDNESDAY",
  THURSDAY: "THURSDAY",
  FRIDAY: "FRIDAY",
  SATURDAY: "SATURDAY",
  SUNDAY: "SUNDAY",
} as const;

// User availability by day of week (renamed from driver_availability)
export const userAvailability = pgTable("user_availability", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  dayOfWeek: varchar("day_of_week", { length: 10 })
    .notNull()
    .$type<keyof typeof DAYS_OF_WEEK>(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  isDayOff: boolean("is_day_off").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// User driver status history for tracking driver status changes (renamed from driver_status_history)
export const userDriverStatusHistory = pgTable("user_driver_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  previousStatus: varchar("previous_status", { length: 50 }).$type<
    keyof typeof DRIVER_STATUS
  >(),
  newStatus: varchar("new_status", { length: 50 })
    .notNull()
    .$type<keyof typeof DRIVER_STATUS>(),
  changedBy: uuid("changed_by").references(() => users.id),
  reason: text("reason"),
  context: text("context"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
