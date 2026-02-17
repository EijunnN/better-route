import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

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
  dateFormat: varchar("date_format", { length: 20 })
    .notNull()
    .default("DD/MM/YYYY"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users),
  fleets: many(fleets),
  workflowStates: many(companyWorkflowStates),
  workflowTransitions: many(companyWorkflowTransitions),
}));

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
  primaryFleetId: uuid("primary_fleet_id"),

  // Metadata
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  company: one(companies, {
    fields: [users.companyId],
    references: [companies.id],
  }),
  primaryFleet: one(fleets, {
    fields: [users.primaryFleetId],
    references: [fleets.id],
  }),
  acknowledgedAlerts: many(alerts),
  receivedNotifications: many(alertNotifications),
  userSkills: many(userSkills),
  availability: many(userAvailability),
  secondaryFleets: many(userSecondaryFleets),
  statusHistory: many(userDriverStatusHistory),
  fleetPermissions: many(userFleetPermissions),
  assignedVehicles: many(vehicles),
  userRoles: many(userRoles),
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
});

export const fleetsRelations = relations(fleets, ({ one, many }) => ({
  company: one(companies, {
    fields: [fleets.companyId],
    references: [companies.id],
  }),
  vehicleFleets: many(vehicleFleets),
  primaryUsers: many(users),
  secondaryUsers: many(userSecondaryFleets),
  userPermissions: many(userFleetPermissions),
}));

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
});

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  company: one(companies, {
    fields: [vehicles.companyId],
    references: [companies.id],
  }),
  assignedDriver: one(users, {
    fields: [vehicles.assignedDriverId],
    references: [users.id],
  }),
  vehicleFleets: many(vehicleFleets),
  fleetHistory: many(vehicleFleetHistory),
  statusHistory: many(vehicleStatusHistory),
  skillAssignments: many(vehicleSkillAssignments),
}));

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
});

export const vehicleFleetsRelations = relations(vehicleFleets, ({ one }) => ({
  company: one(companies, {
    fields: [vehicleFleets.companyId],
    references: [companies.id],
  }),
  vehicle: one(vehicles, {
    fields: [vehicleFleets.vehicleId],
    references: [vehicles.id],
  }),
  fleet: one(fleets, {
    fields: [vehicleFleets.fleetId],
    references: [fleets.id],
  }),
}));

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

export const userFleetPermissionsRelations = relations(
  userFleetPermissions,
  ({ one }) => ({
    company: one(companies, {
      fields: [userFleetPermissions.companyId],
      references: [companies.id],
    }),
    user: one(users, {
      fields: [userFleetPermissions.userId],
      references: [users.id],
    }),
    fleet: one(fleets, {
      fields: [userFleetPermissions.fleetId],
      references: [fleets.id],
    }),
  }),
);

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

export const vehicleSkillsRelations = relations(
  vehicleSkills,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [vehicleSkills.companyId],
      references: [companies.id],
    }),
    userSkills: many(userSkills),
    vehicleAssignments: many(vehicleSkillAssignments),
  }),
);

// User Skills junction table (renamed from driver_skills)
export const userSkills = pgTable("user_skills", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => vehicleSkills.id, { onDelete: "cascade" }),
  obtainedAt: timestamp("obtained_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userSkillsRelations = relations(userSkills, ({ one }) => ({
  company: one(companies, {
    fields: [userSkills.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [userSkills.userId],
    references: [users.id],
  }),
  skill: one(vehicleSkills, {
    fields: [userSkills.skillId],
    references: [vehicleSkills.id],
  }),
}));

// Vehicle Skill Assignments - junction table for vehicle-skill relationship
export const vehicleSkillAssignments = pgTable("vehicle_skill_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => vehicleSkills.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const vehicleSkillAssignmentsRelations = relations(
  vehicleSkillAssignments,
  ({ one }) => ({
    company: one(companies, {
      fields: [vehicleSkillAssignments.companyId],
      references: [companies.id],
    }),
    vehicle: one(vehicles, {
      fields: [vehicleSkillAssignments.vehicleId],
      references: [vehicles.id],
    }),
    skill: one(vehicleSkills, {
      fields: [vehicleSkillAssignments.skillId],
      references: [vehicleSkills.id],
    }),
  }),
);

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

export const vehicleFleetHistoryRelations = relations(
  vehicleFleetHistory,
  ({ one }) => ({
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
  }),
);

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

export const vehicleStatusHistoryRelations = relations(
  vehicleStatusHistory,
  ({ one }) => ({
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
  }),
);

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

export const userAvailabilityRelations = relations(
  userAvailability,
  ({ one }) => ({
    company: one(companies, {
      fields: [userAvailability.companyId],
      references: [companies.id],
    }),
    user: one(users, {
      fields: [userAvailability.userId],
      references: [users.id],
    }),
  }),
);

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
});

export const userSecondaryFleetsRelations = relations(
  userSecondaryFleets,
  ({ one }) => ({
    company: one(companies, {
      fields: [userSecondaryFleets.companyId],
      references: [companies.id],
    }),
    user: one(users, {
      fields: [userSecondaryFleets.userId],
      references: [users.id],
    }),
    fleet: one(fleets, {
      fields: [userSecondaryFleets.fleetId],
      references: [fleets.id],
    }),
  }),
);

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

export const userDriverStatusHistoryRelations = relations(
  userDriverStatusHistory,
  ({ one }) => ({
    company: one(companies, {
      fields: [userDriverStatusHistory.companyId],
      references: [companies.id],
    }),
    user: one(users, {
      fields: [userDriverStatusHistory.userId],
      references: [users.id],
    }),
    changedByUser: one(users, {
      fields: [userDriverStatusHistory.changedBy],
      references: [users.id],
    }),
  }),
);

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

export const timeWindowPresetsRelations = relations(
  timeWindowPresets,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [timeWindowPresets.companyId],
      references: [companies.id],
    }),
    orders: many(orders),
  }),
);

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
  trackingId: varchar("tracking_id", { length: 50 }).notNull().unique(),
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
export const csvColumnMappingTemplates = pgTable(
  "csv_column_mapping_templates",
  {
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
  },
);

export const csvColumnMappingTemplatesRelations = relations(
  csvColumnMappingTemplates,
  ({ one }) => ({
    company: one(companies, {
      fields: [csvColumnMappingTemplates.companyId],
      references: [companies.id],
    }),
  }),
);

// Optimization objective types
export const OPTIMIZATION_OBJECTIVE = {
  DISTANCE: "DISTANCE",
  TIME: "TIME",
  BALANCED: "BALANCED",
} as const;

// Optimization configurations for route planning
export const optimizationConfigurations = pgTable(
  "optimization_configurations",
  {
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
    status: varchar("status", { length: 50 }).notNull().default("DRAFT"), // DRAFT, CONFIGURED, CONFIRMED
    confirmedAt: timestamp("confirmed_at"),
    confirmedBy: uuid("confirmed_by").references(() => users.id),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);

export const optimizationConfigurationsRelations = relations(
  optimizationConfigurations,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [optimizationConfigurations.companyId],
      references: [companies.id],
    }),
    jobs: many(optimizationJobs),
  }),
);

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

export const optimizationJobsRelations = relations(
  optimizationJobs,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [optimizationJobs.companyId],
      references: [companies.id],
    }),
    configuration: one(optimizationConfigurations, {
      fields: [optimizationJobs.configurationId],
      references: [optimizationConfigurations.id],
    }),
    routeStops: many(routeStops),
    outputHistory: many(outputHistory),
    planMetrics: many(planMetrics),
  }),
);

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
  ruleId: uuid("rule_id").references(() => alertRules.id, {
    onDelete: "set null",
  }),
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

export const alertNotificationsRelations = relations(
  alertNotifications,
  ({ one }) => ({
    alert: one(alerts, {
      fields: [alertNotifications.alertId],
      references: [alerts.id],
    }),
    recipient: one(users, {
      fields: [alertNotifications.recipientId],
      references: [users.id],
    }),
  }),
);

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

// Delivery failure reasons - required when marking a stop as FAILED
export const DELIVERY_FAILURE_REASONS = {
  CUSTOMER_ABSENT: "CUSTOMER_ABSENT", // Cliente ausente
  CUSTOMER_REFUSED: "CUSTOMER_REFUSED", // Cliente rechazó la entrega
  ADDRESS_NOT_FOUND: "ADDRESS_NOT_FOUND", // Dirección incorrecta o no encontrada
  PACKAGE_DAMAGED: "PACKAGE_DAMAGED", // Paquete dañado
  RESCHEDULE_REQUESTED: "RESCHEDULE_REQUESTED", // Cliente solicitó reprogramación
  UNSAFE_AREA: "UNSAFE_AREA", // Zona insegura o de difícil acceso
  OTHER: "OTHER", // Otro motivo (especificar en notas)
} as const;

// Spanish labels for failure reasons (for UI display)
export const DELIVERY_FAILURE_LABELS: Record<
  keyof typeof DELIVERY_FAILURE_REASONS,
  string
> = {
  CUSTOMER_ABSENT: "Cliente ausente",
  CUSTOMER_REFUSED: "Cliente rechazó la entrega",
  ADDRESS_NOT_FOUND: "Dirección incorrecta o no encontrada",
  PACKAGE_DAMAGED: "Paquete dañado",
  RESCHEDULE_REQUESTED: "Cliente solicitó reprogramación",
  UNSAFE_AREA: "Zona insegura o de difícil acceso",
  OTHER: "Otro motivo",
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
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
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
  // Failure tracking (required when status = FAILED)
  failureReason: varchar("failure_reason", { length: 50 }).$type<
    keyof typeof DELIVERY_FAILURE_REASONS
  >(),
  // Evidence URLs for failed deliveries (photos from driver app)
  evidenceUrls: jsonb("evidence_urls").$type<string[]>(),
  // Custom workflow state reference
  workflowStateId: uuid("workflow_state_id").references(() => companyWorkflowStates.id, { onDelete: "set null" }),
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
  user: one(users, {
    fields: [routeStops.userId],
    references: [users.id],
  }),
  vehicle: one(vehicles, {
    fields: [routeStops.vehicleId],
    references: [vehicles.id],
  }),
  order: one(orders, {
    fields: [routeStops.orderId],
    references: [orders.id],
  }),
  workflowState: one(companyWorkflowStates, {
    fields: [routeStops.workflowStateId],
    references: [companyWorkflowStates.id],
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
  previousStatus: varchar("previous_status", { length: 20 }).$type<
    keyof typeof STOP_STATUS
  >(),
  newStatus: varchar("new_status", { length: 20 })
    .notNull()
    .$type<keyof typeof STOP_STATUS>(),
  userId: uuid("user_id").references(() => users.id),
  notes: text("notes"),
  metadata: jsonb("metadata"), // Additional context about the change
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const routeStopHistoryRelations = relations(
  routeStopHistory,
  ({ one }) => ({
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
  }),
);

// Reassignment history - tracks user (driver) reassignments due to absence
export const reassignmentsHistory = pgTable("reassignments_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  jobId: uuid("job_id").references(() => optimizationJobs.id, {
    onDelete: "set null",
  }),
  absentUserId: uuid("absent_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  absentUserName: varchar("absent_user_name", { length: 255 }).notNull(),
  routeIds: text("route_ids").notNull(), // JSON array of route IDs
  vehicleIds: text("vehicle_ids").notNull(), // JSON array of vehicle IDs
  // Reassignment details stored as JSON array of reassignments
  // Each entry: { userId, userName, stopIds, stopCount }
  reassignments: text("reassignments").notNull(),
  reason: text("reason"),
  executedBy: uuid("executed_by").references(() => users.id),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reassignmentsHistoryRelations = relations(
  reassignmentsHistory,
  ({ one }) => ({
    company: one(companies, {
      fields: [reassignmentsHistory.companyId],
      references: [companies.id],
    }),
    job: one(optimizationJobs, {
      fields: [reassignmentsHistory.jobId],
      references: [optimizationJobs.id],
    }),
    absentUser: one(users, {
      fields: [reassignmentsHistory.absentUserId],
      references: [users.id],
    }),
    executedByUser: one(users, {
      fields: [reassignmentsHistory.executedBy],
      references: [users.id],
    }),
  }),
);

// Output format types
export const OUTPUT_FORMAT = {
  JSON: "JSON",
  CSV: "CSV",
  PDF: "PDF",
} as const;

// Output generation status types
export const OUTPUT_STATUS = {
  PENDING: "PENDING",
  GENERATED: "GENERATED",
  FAILED: "FAILED",
} as const;

// Output history - tracks generated output files for route plans
export const outputHistory = pgTable("output_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  jobId: uuid("job_id")
    .notNull()
    .references(() => optimizationJobs.id, { onDelete: "cascade" }),
  generatedBy: uuid("generated_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  format: varchar("format", { length: 10 })
    .notNull()
    .$type<keyof typeof OUTPUT_FORMAT>()
    .default("JSON"),
  status: varchar("status", { length: 20 })
    .notNull()
    .$type<keyof typeof OUTPUT_STATUS>()
    .default("PENDING"),
  fileUrl: text("file_url"), // URL to generated file (if stored externally)
  error: text("error"), // Error message if generation failed
  metadata: jsonb("metadata"), // Additional metadata about the output
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const outputHistoryRelations = relations(outputHistory, ({ one }) => ({
  company: one(companies, {
    fields: [outputHistory.companyId],
    references: [companies.id],
  }),
  job: one(optimizationJobs, {
    fields: [outputHistory.jobId],
    references: [optimizationJobs.id],
  }),
  user: one(users, {
    fields: [outputHistory.generatedBy],
    references: [users.id],
  }),
}));

// Plan metrics - stores summary metrics for confirmed optimization plans
export const planMetrics = pgTable("plan_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  jobId: uuid("job_id")
    .notNull()
    .references(() => optimizationJobs.id, { onDelete: "cascade" }),
  configurationId: uuid("configuration_id")
    .notNull()
    .references(() => optimizationConfigurations.id, { onDelete: "cascade" }),
  // Route summary metrics
  totalRoutes: integer("total_routes").notNull(),
  totalStops: integer("total_stops").notNull(),
  totalDistance: integer("total_distance").notNull(), // meters
  totalDuration: integer("total_duration").notNull(), // seconds
  // Capacity utilization metrics
  averageUtilizationRate: integer("average_utilization_rate").notNull(), // 0-100
  maxUtilizationRate: integer("max_utilization_rate").notNull(), // 0-100
  minUtilizationRate: integer("min_utilization_rate").notNull(), // 0-100
  // Time window metrics
  timeWindowComplianceRate: integer("time_window_compliance_rate").notNull(), // 0-100
  totalTimeWindowViolations: integer("total_time_window_violations").notNull(),
  // Driver assignment metrics
  driverAssignmentCoverage: integer("driver_assignment_coverage").notNull(), // 0-100
  averageAssignmentQuality: integer("average_assignment_quality").notNull(), // 0-100
  assignmentsWithWarnings: integer("assignments_with_warnings").notNull(),
  assignmentsWithErrors: integer("assignments_with_errors").notNull(),
  // Assignment detail metrics
  skillCoverage: integer("skill_coverage").notNull(), // 0-100
  licenseCompliance: integer("license_compliance").notNull(), // 0-100
  fleetAlignment: integer("fleet_alignment").notNull(), // 0-100
  workloadBalance: integer("workload_balance").notNull(), // 0-100
  // Unassigned orders
  unassignedOrders: integer("unassigned_orders").notNull(),
  // Metadata
  objective: varchar("objective", { length: 20 }).$type<
    keyof typeof OPTIMIZATION_OBJECTIVE
  >(),
  processingTimeMs: integer("processing_time_ms").notNull(),
  // Trend comparison (optional - compared to previous session)
  comparedToJobId: uuid("compared_to_job_id").references(
    () => optimizationJobs.id,
  ),
  distanceChangePercent: integer("distance_change_percent"), // can be negative
  durationChangePercent: integer("duration_change_percent"), // can be negative
  complianceChangePercent: integer("compliance_change_percent"), // can be negative
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const planMetricsRelations = relations(planMetrics, ({ one }) => ({
  company: one(companies, {
    fields: [planMetrics.companyId],
    references: [companies.id],
  }),
  job: one(optimizationJobs, {
    fields: [planMetrics.jobId],
    references: [optimizationJobs.id],
  }),
  configuration: one(optimizationConfigurations, {
    fields: [planMetrics.configurationId],
    references: [optimizationConfigurations.id],
  }),
  comparedToJob: one(optimizationJobs, {
    fields: [planMetrics.comparedToJobId],
    references: [optimizationJobs.id],
  }),
}));

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
  // GeoJSON polygon coordinates stored as JSON
  // Format: { "type": "Polygon", "coordinates": [[[lng, lat], ...]] }
  geometry: text("geometry").notNull(),
  // Zone color for map visualization
  color: varchar("color", { length: 20 }).default("#3B82F6"),
  // Is this the default zone?
  isDefault: boolean("is_default").notNull().default(false),
  // Days of week this zone is active (JSON array: ["MONDAY", "TUESDAY", ...])
  activeDays: text("active_days"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const zonesRelations = relations(zones, ({ one, many }) => ({
  company: one(companies, {
    fields: [zones.companyId],
    references: [companies.id],
  }),
  vehicleAssignments: many(zoneVehicles),
}));

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
  // JSON array: ["MONDAY", "TUESDAY", ...]
  assignedDays: text("assigned_days"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const zoneVehiclesRelations = relations(zoneVehicles, ({ one }) => ({
  company: one(companies, {
    fields: [zoneVehicles.companyId],
    references: [companies.id],
  }),
  zone: one(zones, {
    fields: [zoneVehicles.zoneId],
    references: [zones.id],
  }),
  vehicle: one(vehicles, {
    fields: [zoneVehicles.vehicleId],
    references: [vehicles.id],
  }),
}));

// ============================================
// OPTIMIZATION SETTINGS - Route creation configuration
// ============================================

// Optimization presets - saved optimization configurations
export const optimizationPresets = pgTable("optimization_presets", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Optimization flags
  balanceVisits: boolean("balance_visits").notNull().default(false),
  minimizeVehicles: boolean("minimize_vehicles").notNull().default(false),
  openStart: boolean("open_start").notNull().default(false),
  openEnd: boolean("open_end").notNull().default(false),
  mergeSimilar: boolean("merge_similar").notNull().default(true),
  mergeSimilarV2: boolean("merge_similar_v2").notNull().default(false),
  oneRoutePerVehicle: boolean("one_route_per_vehicle").notNull().default(true),
  simplify: boolean("simplify").notNull().default(true),
  bigVrp: boolean("big_vrp").notNull().default(true),
  flexibleTimeWindows: boolean("flexible_time_windows")
    .notNull()
    .default(false),
  mergeByDistance: boolean("merge_by_distance").notNull().default(false),
  // Group orders with same coordinates as single stop
  groupSameLocation: boolean("group_same_location").notNull().default(true),
  // Parameters
  maxDistanceKm: integer("max_distance_km").default(200),
  vehicleRechargeTime: integer("vehicle_recharge_time").default(0), // minutes
  trafficFactor: integer("traffic_factor").default(50), // 0-100 scale
  // Route end configuration: DRIVER_ORIGIN | SPECIFIC_DEPOT | OPEN_END
  routeEndMode: varchar("route_end_mode", { length: 50 })
    .notNull()
    .default("DRIVER_ORIGIN"),
  endDepotLatitude: varchar("end_depot_latitude", { length: 50 }),
  endDepotLongitude: varchar("end_depot_longitude", { length: 50 }),
  endDepotAddress: varchar("end_depot_address", { length: 500 }),
  // Is this the default preset?
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const optimizationPresetsRelations = relations(
  optimizationPresets,
  ({ one }) => ({
    company: one(companies, {
      fields: [optimizationPresets.companyId],
      references: [companies.id],
    }),
  }),
);

// ============================================
// ROLES & PERMISSIONS - Configurable RBAC system
// ============================================

// Permission categories for UI grouping
export const PERMISSION_CATEGORIES = {
  ORDERS: "ORDERS",
  VEHICLES: "VEHICLES",
  DRIVERS: "DRIVERS",
  FLEETS: "FLEETS",
  ROUTES: "ROUTES",
  OPTIMIZATION: "OPTIMIZATION",
  ALERTS: "ALERTS",
  USERS: "USERS",
  SETTINGS: "SETTINGS",
  REPORTS: "REPORTS",
} as const;

// Permission actions
export const PERMISSION_ACTIONS = {
  VIEW: "VIEW",
  CREATE: "CREATE",
  EDIT: "EDIT",
  DELETE: "DELETE",
  IMPORT: "IMPORT",
  EXPORT: "EXPORT",
  ASSIGN: "ASSIGN",
  CONFIRM: "CONFIRM",
  CANCEL: "CANCEL",
  MANAGE: "MANAGE",
} as const;

// Roles - Custom roles per company
export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  // System roles cannot be edited or deleted by users
  isSystem: boolean("is_system").notNull().default(false),
  // Code for system roles (ADMIN, PLANIFICADOR, etc.)
  code: varchar("code", { length: 50 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rolesRelations = relations(roles, ({ one, many }) => ({
  company: one(companies, {
    fields: [roles.companyId],
    references: [companies.id],
  }),
  rolePermissions: many(rolePermissions),
  users: many(userRoles),
}));

// Permissions - System-wide permission catalog
export const permissions = pgTable("permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Entity this permission applies to (orders, vehicles, etc.)
  entity: varchar("entity", { length: 50 }).notNull(),
  // Action (view, create, edit, delete, etc.)
  action: varchar("action", { length: 50 }).notNull(),
  // Human-readable name for UI
  name: varchar("name", { length: 100 }).notNull(),
  // Description for UI tooltips
  description: text("description"),
  // Category for grouping in UI
  category: varchar("category", { length: 50 })
    .notNull()
    .$type<keyof typeof PERMISSION_CATEGORIES>(),
  // Order for display in UI
  displayOrder: integer("display_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

// Role Permissions - The ON/OFF switches
export const rolePermissions = pgTable("role_permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  permissionId: uuid("permission_id")
    .notNull()
    .references(() => permissions.id, { onDelete: "cascade" }),
  // The switch: true = ON, false = OFF
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rolePermissionsRelations = relations(
  rolePermissions,
  ({ one }) => ({
    role: one(roles, {
      fields: [rolePermissions.roleId],
      references: [roles.id],
    }),
    permission: one(permissions, {
      fields: [rolePermissions.permissionId],
      references: [permissions.id],
    }),
  }),
);

// User Roles - Many-to-many relationship between users and roles
export const userRoles = pgTable("user_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  // Is this the primary role for the user?
  isPrimary: boolean("is_primary").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));

// ============================================
// COMPANY OPTIMIZATION PROFILES - Per-company optimization settings
// ============================================

// Capacity dimension types
export const CAPACITY_DIMENSIONS = {
  WEIGHT: "WEIGHT",
  VOLUME: "VOLUME",
  VALUE: "VALUE",
  UNITS: "UNITS",
} as const;

// Company optimization profiles - defines what fields/dimensions are relevant
export const companyOptimizationProfiles = pgTable(
  "company_optimization_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" })
      .unique(),
    // Field toggles for orders
    enableOrderValue: boolean("enable_order_value").notNull().default(false),
    enableOrderType: boolean("enable_order_type").notNull().default(false),
    enableWeight: boolean("enable_weight").notNull().default(true),
    enableVolume: boolean("enable_volume").notNull().default(true),
    enableUnits: boolean("enable_units").notNull().default(false),
    // Active capacity dimensions (JSON array: ["WEIGHT", "VOLUME", "VALUE", "UNITS"])
    activeDimensions: text("active_dimensions").notNull().default('["WEIGHT","VOLUME"]'),
    // Priority mapping by order type (JSON: { "NEW": 50, "RESCHEDULED": 80, "URGENT": 100 })
    priorityMapping: text("priority_mapping").notNull().default('{"NEW":50,"RESCHEDULED":80,"URGENT":100}'),
    // Default time windows (JSON array of presets)
    defaultTimeWindows: text("default_time_windows"),
    // Metadata
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);

export const companyOptimizationProfilesRelations = relations(
  companyOptimizationProfiles,
  ({ one }) => ({
    company: one(companies, {
      fields: [companyOptimizationProfiles.companyId],
      references: [companies.id],
    }),
  }),
);

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
    .references(() => companies.id, { onDelete: "cascade" }),
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
});

export const driverLocationsRelations = relations(
  driverLocations,
  ({ one }) => ({
    company: one(companies, {
      fields: [driverLocations.companyId],
      references: [companies.id],
    }),
    driver: one(users, {
      fields: [driverLocations.driverId],
      references: [users.id],
    }),
    vehicle: one(vehicles, {
      fields: [driverLocations.vehicleId],
      references: [vehicles.id],
    }),
    job: one(optimizationJobs, {
      fields: [driverLocations.jobId],
      references: [optimizationJobs.id],
    }),
  }),
);

// ============================================
// CUSTOM WORKFLOW STATES - Per-company delivery workflow
// ============================================

export const SYSTEM_STATES = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export const companyWorkflowStates = pgTable("company_workflow_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 50 }).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  systemState: varchar("system_state", { length: 20 }).notNull(),
  color: varchar("color", { length: 7 }).notNull().default("#6B7280"),
  icon: varchar("icon", { length: 50 }),
  position: integer("position").notNull().default(0),
  requiresReason: boolean("requires_reason").notNull().default(false),
  requiresPhoto: boolean("requires_photo").notNull().default(false),
  requiresSignature: boolean("requires_signature").notNull().default(false),
  requiresNotes: boolean("requires_notes").notNull().default(false),
  reasonOptions: jsonb("reason_options"),
  isTerminal: boolean("is_terminal").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const companyWorkflowTransitions = pgTable("company_workflow_transitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  fromStateId: uuid("from_state_id").notNull().references(() => companyWorkflowStates.id, { onDelete: "cascade" }),
  toStateId: uuid("to_state_id").notNull().references(() => companyWorkflowStates.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const companyWorkflowStatesRelations = relations(companyWorkflowStates, ({ one, many }) => ({
  company: one(companies, {
    fields: [companyWorkflowStates.companyId],
    references: [companies.id],
  }),
  transitionsFrom: many(companyWorkflowTransitions, { relationName: "fromState" }),
  transitionsTo: many(companyWorkflowTransitions, { relationName: "toState" }),
  routeStops: many(routeStops),
}));

export const companyWorkflowTransitionsRelations = relations(companyWorkflowTransitions, ({ one }) => ({
  company: one(companies, {
    fields: [companyWorkflowTransitions.companyId],
    references: [companies.id],
  }),
  fromState: one(companyWorkflowStates, {
    fields: [companyWorkflowTransitions.fromStateId],
    references: [companyWorkflowStates.id],
    relationName: "fromState",
  }),
  toState: one(companyWorkflowStates, {
    fields: [companyWorkflowTransitions.toStateId],
    references: [companyWorkflowStates.id],
    relationName: "toState",
  }),
}));
