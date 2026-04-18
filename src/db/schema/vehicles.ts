import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";

// Vehicle status types
export const VEHICLE_STATUS = {
  AVAILABLE: "AVAILABLE",
  IN_MAINTENANCE: "IN_MAINTENANCE",
  ASSIGNED: "ASSIGNED",
  INACTIVE: "INACTIVE",
} as const;

// Load types for vehicles (Liviano/Pesado)
export const LOAD_TYPES = {
  LIGHT: "LIGHT",
  HEAVY: "HEAVY",
} as const;

export const vehicles = pgTable("vehicles", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),

  // New identification fields
  name: varchar("name", { length: 255 }).notNull(),
  useNameAsPlate: boolean("use_name_as_plate").notNull().default(false),
  plate: varchar("plate", { length: 50 }),

  // New capacity fields
  loadType: varchar("load_type", { length: 50 }).$type<
    keyof typeof LOAD_TYPES
  >(),
  maxOrders: integer("max_orders").notNull().default(20),

  // New origin fields
  originAddress: text("origin_address"),
  originLatitude: varchar("origin_latitude", { length: 20 }),
  originLongitude: varchar("origin_longitude", { length: 20 }),

  // Assigned driver
  assignedDriverId: uuid("assigned_driver_id").references(() => users.id, {
    onDelete: "set null",
  }),

  // Workday configuration
  workdayStart: time("workday_start"),
  workdayEnd: time("workday_end"),
  hasBreakTime: boolean("has_break_time").notNull().default(false),
  breakDuration: integer("break_duration"),
  breakTimeStart: time("break_time_start"),
  breakTimeEnd: time("break_time_end"),

  // Legacy fields (kept for backward compatibility)
  brand: varchar("brand", { length: 100 }),
  model: varchar("model", { length: 100 }),
  year: integer("year"),
  type: varchar("type", { length: 50 }),
  weightCapacity: integer("weight_capacity"),
  volumeCapacity: integer("volume_capacity"),
  // New capacity fields for multi-company support
  maxValueCapacity: integer("max_value_capacity"), // Capacidad de valorizado máximo
  maxUnitsCapacity: integer("max_units_capacity"), // Capacidad en unidades
  refrigerated: boolean("refrigerated").default(false),
  heated: boolean("heated").default(false),
  lifting: boolean("lifting").default(false),
  licenseRequired: varchar("license_required", { length: 10 }),
  insuranceExpiry: timestamp("insurance_expiry"),
  inspectionExpiry: timestamp("inspection_expiry"),

  status: varchar("status", { length: 50 })
    .notNull()
    .$type<keyof typeof VEHICLE_STATUS>()
    .default("AVAILABLE"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("vehicles_company_id_idx").on(table.companyId),
  index("vehicles_company_status_idx").on(table.companyId, table.status),
  index("vehicles_assigned_driver_idx").on(table.assignedDriverId),
]);

// Vehicle status history for tracking status changes
export const vehicleStatusHistory = pgTable("vehicle_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  previousStatus: varchar("previous_status", { length: 50 }).$type<
    keyof typeof VEHICLE_STATUS
  >(),
  newStatus: varchar("new_status", { length: 50 })
    .notNull()
    .$type<keyof typeof VEHICLE_STATUS>(),
  userId: uuid("user_id").references(() => users.id),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
