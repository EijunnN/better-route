import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  time,
  uuid,
  varchar,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  legalName: varchar("legal_name", { length: 255 }).notNull().unique(),
  commercialName: varchar("commercial_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  taxAddress: text("tax_address"),
  country: varchar("country", { length: 2 }).notNull(),
  timezone: varchar("timezone", { length: 50 }).notNull().default("UTC"),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  dateFormat: varchar("date_format", { length: 20 }).notNull().default("DD/MM/YYYY"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users),
  fleets: many(fleets),
}));

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  email: varchar("email", { length: 255 }).notNull(),
  password: varchar("password", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  company: one(companies, {
    fields: [users.companyId],
    references: [companies.id],
  }),
  acknowledgedAlerts: many(alerts),
  receivedNotifications: many(alertNotifications),
}));

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  userId: uuid("user_id").references(() => users.id),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  changes: text("changes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Fleet types
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
  type: varchar("type", { length: 50 })
    .notNull()
    .$type<keyof typeof FLEET_TYPES>(),
  weightCapacity: integer("weight_capacity").notNull(),
  volumeCapacity: integer("volume_capacity").notNull(),
  operationStart: time("operation_start").notNull(),
  operationEnd: time("operation_end").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fleetsRelations = relations(fleets, ({ one, many }) => ({
  company: one(companies, {
    fields: [fleets.companyId],
    references: [companies.id],
  }),
  vehicles: many(vehicles),
  drivers: many(drivers),
  secondaryDrivers: many(driverSecondaryFleets),
}));

// Vehicle status types
export const VEHICLE_STATUS = {
  AVAILABLE: "AVAILABLE",
  IN_MAINTENANCE: "IN_MAINTENANCE",
  ASSIGNED: "ASSIGNED",
  INACTIVE: "INACTIVE",
} as const;

export const vehicles = pgTable("vehicles", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  fleetId: uuid("fleet_id")
    .notNull()
    .references(() => fleets.id, { onDelete: "restrict" }),
  plate: varchar("plate", { length: 50 }).notNull(),
  brand: varchar("brand", { length: 100 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  year: integer("year").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  weightCapacity: integer("weight_capacity").notNull(),
  volumeCapacity: integer("volume_capacity").notNull(),
  refrigerated: boolean("refrigerated").notNull().default(false),
  heated: boolean("heated").notNull().default(false),
  lifting: boolean("lifting").notNull().default(false),
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
});

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  company: one(companies, {
    fields: [vehicles.companyId],
    references: [companies.id],
  }),
  fleet: one(fleets, {
    fields: [vehicles.fleetId],
    references: [fleets.id],
  }),
  fleetHistory: many(vehicleFleetHistory),
  statusHistory: many(vehicleStatusHistory),
}));

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

export const drivers = pgTable("drivers", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  fleetId: uuid("fleet_id")
    .notNull()
    .references(() => fleets.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  identification: varchar("identification", { length: 50 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  birthDate: timestamp("birth_date"),
  photo: text("photo"),
  licenseNumber: varchar("license_number", { length: 100 }).notNull(),
  licenseExpiry: timestamp("licence_expiry").notNull(),
  licenseCategories: varchar("license_categories", { length: 255 }),
  certifications: text("certifications"),
  status: varchar("status", { length: 50 })
    .notNull()
    .$type<keyof typeof DRIVER_STATUS>()
    .default("AVAILABLE"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const driversRelations = relations(drivers, ({ one, many }) => ({
  company: one(companies, {
    fields: [drivers.companyId],
    references: [companies.id],
  }),
  fleet: one(fleets, {
    fields: [drivers.fleetId],
    references: [fleets.id],
  }),
  driverSkills: many(driverSkills),
  availability: many(driverAvailability),
  secondaryFleets: many(driverSecondaryFleets),
  statusHistory: many(driverStatusHistory),
}));

// Vehicle skill categories
export const VEHICLE_SKILL_CATEGORIES = {
  EQUIPMENT: "EQUIPMENT",
  TEMPERATURE: "TEMPERATURE",
  CERTIFICATIONS: "CERTIFICATIONS",
  SPECIAL: "SPECIAL",
} as const;

export const vehicleSkills = pgTable("vehicle_skills", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 })
    .notNull()
    .$type<keyof typeof VEHICLE_SKILL_CATEGORIES>(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const vehicleSkillsRelations = relations(vehicleSkills, ({ one, many }) => ({
  company: one(companies, {
    fields: [vehicleSkills.companyId],
    references: [companies.id],
  }),
  driverSkills: many(driverSkills),
}));

// Driver Skills junction table
export const driverSkills = pgTable("driver_skills", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  driverId: uuid("driver_id")
    .notNull()
    .references(() => drivers.id, { onDelete: "cascade" }),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => vehicleSkills.id, { onDelete: "cascade" }),
  obtainedAt: timestamp("obtained_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const driverSkillsRelations = relations(driverSkills, ({ one }) => ({
  company: one(companies, {
    fields: [driverSkills.companyId],
    references: [companies.id],
  }),
  driver: one(drivers, {
    fields: [driverSkills.driverId],
    references: [drivers.id],
  }),
  skill: one(vehicleSkills, {
    fields: [driverSkills.skillId],
    references: [vehicleSkills.id],
  }),
}));

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
  newFleetId: uuid("new_fleet_id")
    .notNull()
    .references(() => fleets.id, { onDelete: "restrict" }),
  userId: uuid("user_id").references(() => users.id),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vehicleFleetHistoryRelations = relations(vehicleFleetHistory, ({ one }) => ({
  company: one(companies, {
    fields: [vehicleFleetHistory.companyId],
    references: [companies.id],
  }),
  vehicle: one(vehicles, {
    fields: [vehicleFleetHistory.vehicleId],
    references: [vehicles.id],
  }),
  previousFleet: one(fleets, {
    fields: [vehicleFleetHistory.previousFleetId],
    references: [fleets.id],
  }),
  newFleet: one(fleets, {
    fields: [vehicleFleetHistory.newFleetId],
    references: [fleets.id],
  }),
  user: one(users, {
    fields: [vehicleFleetHistory.userId],
    references: [users.id],
  }),
}));

// Vehicle status history for tracking status changes
export const vehicleStatusHistory = pgTable("vehicle_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  previousStatus: varchar("previous_status", { length: 50 })
    .$type<keyof typeof VEHICLE_STATUS>(),
  newStatus: varchar("new_status", { length: 50 })
    .notNull()
    .$type<keyof typeof VEHICLE_STATUS>(),
  userId: uuid("user_id").references(() => users.id),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vehicleStatusHistoryRelations = relations(vehicleStatusHistory, ({ one }) => ({
  company: one(companies, {
    fields: [vehicleStatusHistory.companyId],
    references: [companies.id],
  }),
  vehicle: one(vehicles, {
    fields: [vehicleStatusHistory.vehicleId],
    references: [vehicles.id],
  }),
  user: one(users, {
    fields: [vehicleStatusHistory.userId],
    references: [users.id],
  }),
}));

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

// Driver availability by day of week
export const driverAvailability = pgTable("driver_availability", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  driverId: uuid("driver_id")
    .notNull()
    .references(() => drivers.id, { onDelete: "cascade" }),
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

export const driverAvailabilityRelations = relations(driverAvailability, ({ one }) => ({
  company: one(companies, {
    fields: [driverAvailability.companyId],
    references: [companies.id],
  }),
  driver: one(drivers, {
    fields: [driverAvailability.driverId],
    references: [drivers.id],
  }),
}));

// Secondary fleets for drivers (many-to-many relationship)
export const driverSecondaryFleets = pgTable("driver_secondary_fleets", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  driverId: uuid("driver_id")
    .notNull()
    .references(() => drivers.id, { onDelete: "cascade" }),
  fleetId: uuid("fleet_id")
    .notNull()
    .references(() => fleets.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const driverSecondaryFleetsRelations = relations(driverSecondaryFleets, ({ one }) => ({
  company: one(companies, {
    fields: [driverSecondaryFleets.companyId],
    references: [companies.id],
  }),
  driver: one(drivers, {
    fields: [driverSecondaryFleets.driverId],
    references: [drivers.id],
  }),
  fleet: one(fleets, {
    fields: [driverSecondaryFleets.fleetId],
    references: [fleets.id],
  }),
}));

// Driver status history for tracking status changes
export const driverStatusHistory = pgTable("driver_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  driverId: uuid("driver_id")
    .notNull()
    .references(() => drivers.id, { onDelete: "cascade" }),
  previousStatus: varchar("previous_status", { length: 50 })
    .$type<keyof typeof DRIVER_STATUS>(),
  newStatus: varchar("new_status", { length: 50 })
    .notNull()
    .$type<keyof typeof DRIVER_STATUS>(),
  userId: uuid("user_id").references(() => users.id),
  reason: text("reason"),
  context: text("context"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const driverStatusHistoryRelations = relations(driverStatusHistory, ({ one }) => ({
  company: one(companies, {
    fields: [driverStatusHistory.companyId],
    references: [companies.id],
  }),
  driver: one(drivers, {
    fields: [driverStatusHistory.driverId],
    references: [drivers.id],
  }),
  user: one(users, {
    fields: [driverStatusHistory.userId],
    references: [users.id],
  }),
}));

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

export const timeWindowPresetsRelations = relations(timeWindowPresets, ({ one, many }) => ({
  company: one(companies, {
    fields: [timeWindowPresets.companyId],
    references: [companies.id],
  }),
  orders: many(orders),
}));

// Order status types
export const ORDER_STATUS = {
  PENDING: "PENDING",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
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
    { onDelete: "set null" }
  ),
  strictness: varchar("strictness", { length: 20 })
    .$type<keyof typeof TIME_WINDOW_STRICTNESS>(), // Allows overriding preset strictness, null means inherit from preset
  promisedDate: timestamp("promised_date"),
  // Capacity requirements
  weightRequired: integer("weight_required"),
  volumeRequired: integer("volume_required"),
  // Skill requirements (comma-separated skill codes)
  requiredSkills: text("required_skills"),
  // Additional notes
  notes: text("notes"),
  // Status and metadata
  status: varchar("status", { length: 50 })
    .notNull()
    .$type<keyof typeof ORDER_STATUS>()
    .default("PENDING"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ordersRelations = relations(orders, ({ one }) => ({
  company: one(companies, {
    fields: [orders.companyId],
    references: [companies.id],
  }),
  timeWindowPreset: one(timeWindowPresets, {
    fields: [orders.timeWindowPresetId],
    references: [timeWindowPresets.id],
  }),
}));

// CSV column mapping templates for reusable import configurations
export const csvColumnMappingTemplates = pgTable("csv_column_mapping_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Column mapping stored as JSON: { "csv_column": "system_field" }
  columnMapping: text("column_mapping").notNull(), // JSON string
  // List of required fields that must be mapped
  requiredFields: text("required_fields").notNull(), // JSON array string
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const csvColumnMappingTemplatesRelations = relations(csvColumnMappingTemplates, ({ one }) => ({
  company: one(companies, {
    fields: [csvColumnMappingTemplates.companyId],
    references: [companies.id],
  }),
}));

// Optimization objective types
export const OPTIMIZATION_OBJECTIVE = {
  DISTANCE: "DISTANCE",
  TIME: "TIME",
  BALANCED: "BALANCED",
} as const;

// Optimization configurations for route planning
export const optimizationConfigurations = pgTable("optimization_configurations", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  // Depot location
  depotLatitude: varchar("depot_latitude", { length: 20 }).notNull(),
  depotLongitude: varchar("depot_longitude", { length: 20 }).notNull(),
  depotAddress: text("depot_address"),
  // Vehicle and driver selection (stored as JSON arrays)
  selectedVehicleIds: text("selected_vehicle_ids").notNull(), // JSON array of UUIDs
  selectedDriverIds: text("selected_driver_ids").notNull(), // JSON array of UUIDs
  // Optimization parameters
  objective: varchar("objective", { length: 20 })
    .notNull()
    .$type<keyof typeof OPTIMIZATION_OBJECTIVE>()
    .default("BALANCED"),
  // Capacity constraints
  capacityEnabled: boolean("capacity_enabled").notNull().default(true),
  // Time window settings
  workWindowStart: time("work_window_start").notNull(),
  workWindowEnd: time("work_window_end").notNull(),
  serviceTimeMinutes: integer("service_time_minutes").notNull().default(10),
  timeWindowStrictness: varchar("time_window_strictness", { length: 20 })
    .notNull()
    .$type<keyof typeof TIME_WINDOW_STRICTNESS>()
    .default("SOFT"),
  // Strategy parameters
  penaltyFactor: integer("penalty_factor").notNull().default(3),
  maxRoutes: integer("max_routes"),
  // Metadata
  status: varchar("status", { length: 50 })
    .notNull()
    .default("DRAFT"), // DRAFT, CONFIGURED, CONFIRMED
  confirmedAt: timestamp("confirmed_at"),
  confirmedBy: uuid("confirmed_by").references(() => users.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const optimizationConfigurationsRelations = relations(optimizationConfigurations, ({ one, many }) => ({
  company: one(companies, {
    fields: [optimizationConfigurations.companyId],
    references: [companies.id],
  }),
  jobs: many(optimizationJobs),
}));

// Optimization job status types
export const OPTIMIZATION_JOB_STATUS = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

// Optimization jobs for async execution tracking
export const optimizationJobs = pgTable("optimization_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  configurationId: uuid("configuration_id")
    .notNull()
    .references(() => optimizationConfigurations.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 })
    .notNull()
    .$type<keyof typeof OPTIMIZATION_JOB_STATUS>()
    .default("PENDING"),
  progress: integer("progress").notNull().default(0), // 0-100
  result: text("result"), // JSON string containing optimization results
  error: text("error"), // Error message if failed
  // Timestamps for job lifecycle
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  // Timeout configuration
  timeoutMs: integer("timeout_ms").notNull().default(300000), // 5 minutes default
  // Input hash for result caching
  inputHash: varchar("input_hash", { length: 64 }),
  // Metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const optimizationJobsRelations = relations(optimizationJobs, ({ one, many }) => ({
  company: one(companies, {
    fields: [optimizationJobs.companyId],
    references: [companies.id],
  }),
  configuration: one(optimizationConfigurations, {
    fields: [optimizationJobs.configurationId],
    references: [optimizationConfigurations.id],
  }),
  routeStops: many(routeStops),
}));

// Alert severity levels
export const ALERT_SEVERITY = {
  CRITICAL: "CRITICAL",
  WARNING: "WARNING",
  INFO: "INFO",
} as const;

// Alert types
export const ALERT_TYPE = {
  // Driver alerts
  DRIVER_LICENSE_EXPIRING: "DRIVER_LICENSE_EXPIRING",
  DRIVER_LICENSE_EXPIRED: "DRIVER_LICENSE_EXPIRED",
  DRIVER_ABSENT: "DRIVER_ABSENT",
  DRIVER_UNAVAILABLE: "DRIVER_UNAVAILABLE",
  DRIVER_CERTIFICATION_EXPIRING: "DRIVER_CERTIFICATION_EXPIRING",
  // Vehicle alerts
  VEHICLE_INSURANCE_EXPIRING: "VEHICLE_INSURANCE_EXPIRING",
  VEHICLE_INSPECTION_EXPIRING: "VEHICLE_INSPECTION_EXPIRING",
  VEHICLE_IN_MAINTENANCE: "VEHICLE_IN_MAINTENANCE",
  // Route/Order alerts
  TIME_WINDOW_VIOLATION: "TIME_WINDOW_VIOLATION",
  STOP_FAILED: "STOP_FAILED",
  STOP_SKIPPED: "STOP_SKIPPED",
  ROUTE_DELAYED: "ROUTE_DELAYED",
  // Optimization alerts
  OPTIMIZATION_FAILED: "OPTIMIZATION_FAILED",
  PLAN_INCOMPLETE: "PLAN_INCOMPLETE",
  CAPACITY_ISSUE: "CAPACITY_ISSUE",
} as const;

// Alert status types
export const ALERT_STATUS = {
  ACTIVE: "ACTIVE",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  RESOLVED: "RESOLVED",
  DISMISSED: "DISMISSED",
} as const;

// Alert notification channels
export const NOTIFICATION_CHANNEL = {
  IN_APP: "IN_APP",
  EMAIL: "EMAIL",
  SMS: "SMS",
  WEBHOOK: "WEBHOOK",
} as const;

// Alert notification status
export const NOTIFICATION_STATUS = {
  PENDING: "PENDING",
  SENT: "SENT",
  DELIVERED: "DELIVERED",
  FAILED: "FAILED",
} as const;

// Alert rules - configurable alert conditions
export const alertRules = pgTable("alert_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 })
    .notNull()
    .$type<keyof typeof ALERT_TYPE>(),
  severity: varchar("severity", { length: 20 })
    .notNull()
    .$type<keyof typeof ALERT_SEVERITY>()
    .default("WARNING"),
  threshold: integer("threshold"), // e.g., 30 days for license expiry
  metadata: jsonb("metadata"), // Additional configuration for specific alert types
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const alertRulesRelations = relations(alertRules, ({ one, many }) => ({
  company: one(companies, {
    fields: [alertRules.companyId],
    references: [companies.id],
  }),
  alerts: many(alerts),
}));

// Alert instances - actual alerts that have been triggered
export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  ruleId: uuid("rule_id").references(() => alertRules.id, { onDelete: "set null" }),
  severity: varchar("severity", { length: 20 })
    .notNull()
    .$type<keyof typeof ALERT_SEVERITY>(),
  type: varchar("type", { length: 50 })
    .notNull()
    .$type<keyof typeof ALERT_TYPE>(),
  entityType: varchar("entity_type", { length: 50 }).notNull(), // DRIVER, VEHICLE, ORDER, ROUTE, JOB
  entityId: uuid("entity_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  metadata: jsonb("metadata"), // Flexible data for specific alert types
  status: varchar("status", { length: 20 })
    .notNull()
    .$type<keyof typeof ALERT_STATUS>()
    .default("ACTIVE"),
  acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const alertsRelations = relations(alerts, ({ one, many }) => ({
  company: one(companies, {
    fields: [alerts.companyId],
    references: [companies.id],
  }),
  rule: one(alertRules, {
    fields: [alerts.ruleId],
    references: [alertRules.id],
  }),
  acknowledgedByUser: one(users, {
    fields: [alerts.acknowledgedBy],
    references: [users.id],
  }),
  notifications: many(alertNotifications),
}));

// Alert notifications - tracking delivery of alerts
export const alertNotifications = pgTable("alert_notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  alertId: uuid("alert_id")
    .notNull()
    .references(() => alerts.id, { onDelete: "cascade" }),
  recipientId: uuid("recipient_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  channel: varchar("channel", { length: 20 })
    .notNull()
    .$type<keyof typeof NOTIFICATION_CHANNEL>(),
  status: varchar("status", { length: 20 })
    .notNull()
    .$type<keyof typeof NOTIFICATION_STATUS>()
    .default("PENDING"),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  error: text("error"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const alertNotificationsRelations = relations(alertNotifications, ({ one }) => ({
  alert: one(alerts, {
    fields: [alertNotifications.alertId],
    references: [alerts.id],
  }),
  recipient: one(users, {
    fields: [alertNotifications.recipientId],
    references: [users.id],
  }),
}));

// Stop status types for route execution tracking
export const STOP_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;

// Valid stop status transitions
export const STOP_STATUS_TRANSITIONS: Record<
  keyof typeof STOP_STATUS,
  (keyof typeof STOP_STATUS)[]
> = {
  PENDING: ["IN_PROGRESS", "FAILED", "SKIPPED"],
  IN_PROGRESS: ["COMPLETED", "FAILED", "SKIPPED", "PENDING"],
  COMPLETED: [], // Terminal state - no transitions allowed
  FAILED: ["PENDING", "SKIPPED"], // Can retry or skip
  SKIPPED: [], // Terminal state - no transitions allowed
};

// Route stops - individual stops within optimized routes
export const routeStops = pgTable("route_stops", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  jobId: uuid("job_id")
    .notNull()
    .references(() => optimizationJobs.id, { onDelete: "cascade" }),
  routeId: varchar("route_id", { length: 100 }).notNull(), // Route identifier from optimization result
  driverId: uuid("driver_id")
    .notNull()
    .references(() => drivers.id, { onDelete: "restrict" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "restrict" }),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  sequence: integer("sequence").notNull(), // Order in the route (1, 2, 3, ...)
  // Stop details
  address: text("address").notNull(),
  latitude: varchar("latitude", { length: 20 }).notNull(),
  longitude: varchar("longitude", { length: 20 }).notNull(),
  // Time information
  estimatedArrival: timestamp("estimated_arrival"),
  estimatedServiceTime: integer("estimated_service_time"), // seconds
  timeWindowStart: timestamp("time_window_start"),
  timeWindowEnd: timestamp("time_window_end"),
  // Status tracking
  status: varchar("status", { length: 20 })
    .notNull()
    .$type<keyof typeof STOP_STATUS>()
    .default("PENDING"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  // Optional notes for status changes
  notes: text("notes"),
  // Metadata
  metadata: jsonb("metadata"), // Flexible data for stop-specific info
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const routeStopsRelations = relations(routeStops, ({ one, many }) => ({
  company: one(companies, {
    fields: [routeStops.companyId],
    references: [companies.id],
  }),
  job: one(optimizationJobs, {
    fields: [routeStops.jobId],
    references: [optimizationJobs.id],
  }),
  driver: one(drivers, {
    fields: [routeStops.driverId],
    references: [drivers.id],
  }),
  vehicle: one(vehicles, {
    fields: [routeStops.vehicleId],
    references: [vehicles.id],
  }),
  order: one(orders, {
    fields: [routeStops.orderId],
    references: [orders.id],
  }),
  history: many(routeStopHistory),
}));

// Route stop history - audit trail for stop status changes
export const routeStopHistory = pgTable("route_stop_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  routeStopId: uuid("route_stop_id")
    .notNull()
    .references(() => routeStops.id, { onDelete: "cascade" }),
  previousStatus: varchar("previous_status", { length: 20 })
    .$type<keyof typeof STOP_STATUS>(),
  newStatus: varchar("new_status", { length: 20 })
    .notNull()
    .$type<keyof typeof STOP_STATUS>(),
  userId: uuid("user_id").references(() => users.id),
  notes: text("notes"),
  metadata: jsonb("metadata"), // Additional context about the change
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const routeStopHistoryRelations = relations(routeStopHistory, ({ one }) => ({
  company: one(companies, {
    fields: [routeStopHistory.companyId],
    references: [companies.id],
  }),
  routeStop: one(routeStops, {
    fields: [routeStopHistory.routeStopId],
    references: [routeStops.id],
  }),
  user: one(users, {
    fields: [routeStopHistory.userId],
    references: [users.id],
  }),
}));
