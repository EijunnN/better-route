import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";

// Time window preset types
export const TIME_WINDOW_TYPES = {
  SHIFT: "SHIFT",
  RANGE: "RANGE",
  EXACT: "EXACT",
} as const;

// Time window strictness levels
export const TIME_WINDOW_STRICTNESS = {
  HARD: "HARD",
  SOFT: "SOFT",
} as const;

export const timeWindowPresets = pgTable("time_window_presets", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 })
    .notNull()
    .$type<keyof typeof TIME_WINDOW_TYPES>(),
  startTime: time("start_time"),
  endTime: time("end_time"),
  exactTime: time("exact_time"),
  toleranceMinutes: integer("tolerance_minutes"),
  strictness: varchar("strictness", { length: 20 })
    .notNull()
    .$type<keyof typeof TIME_WINDOW_STRICTNESS>()
    .default("HARD"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Order status types
export const ORDER_STATUS = {
  PENDING: "PENDING",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

// Order types for prioritization (NEW, RESCHEDULED, URGENT)
export const ORDER_TYPES = {
  NEW: "NEW",
  RESCHEDULED: "RESCHEDULED",
  URGENT: "URGENT",
} as const;

// Orders for logistics planning
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  trackingId: varchar("tracking_id", { length: 50 }).notNull(),
  customerName: varchar("customer_name", { length: 255 }),
  customerPhone: varchar("customer_phone", { length: 50 }),
  customerEmail: varchar("customer_email", { length: 255 }),
  address: text("address").notNull(),
  latitude: varchar("latitude", { length: 20 }).notNull(),
  longitude: varchar("longitude", { length: 20 }).notNull(),
  // Time window configuration
  timeWindowPresetId: uuid("time_window_preset_id").references(
    () => timeWindowPresets.id,
    { onDelete: "set null" },
  ),
  strictness: varchar("strictness", { length: 20 }).$type<
    keyof typeof TIME_WINDOW_STRICTNESS
  >(), // Allows overriding preset strictness, null means inherit from preset
  promisedDate: timestamp("promised_date"),
  // Capacity requirements
  weightRequired: integer("weight_required"),
  volumeRequired: integer("volume_required"),
  // New capacity fields for multi-company support
  orderValue: integer("order_value"), // Valorizado en céntimos
  unitsRequired: integer("units_required"), // Número de unidades
  // Order type for prioritization
  orderType: varchar("order_type", { length: 20 }).$type<
    keyof typeof ORDER_TYPES
  >(),
  // Priority for VROOM (0-100, higher = more important)
  priority: integer("priority").default(50),
  // Direct time window fields (alternative to preset)
  timeWindowStart: time("time_window_start"),
  timeWindowEnd: time("time_window_end"),
  // Skill requirements (comma-separated skill codes)
  requiredSkills: text("required_skills"),
  // Additional notes
  notes: text("notes"),
  // Custom fields (company-defined dynamic fields stored as JSONB)
  customFields: jsonb("custom_fields").default({}),
  // Status and metadata
  status: varchar("status", { length: 50 })
    .notNull()
    .$type<keyof typeof ORDER_STATUS>()
    .default("PENDING"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("orders_company_id_idx").on(table.companyId),
  index("orders_status_idx").on(table.status),
  index("orders_company_status_idx").on(table.companyId, table.status),
  uniqueIndex("orders_tracking_id_active_unique")
    .on(table.trackingId)
    .where(sql`${table.active} = true`),
]);

// CSV column mapping templates for reusable import configurations
export const csvColumnMappingTemplates = pgTable(
  "csv_column_mapping_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    // Column mapping stored as JSON: { "csv_column": "system_field" }
    columnMapping: jsonb("column_mapping").notNull(),
    // List of required fields that must be mapped
    requiredFields: jsonb("required_fields").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);
