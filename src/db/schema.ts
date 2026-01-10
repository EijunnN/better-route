import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  time,
  uuid,
  varchar,
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

export const usersRelations = relations(users, ({ one }) => ({
  company: one(companies, {
    fields: [users.companyId],
    references: [companies.id],
  }),
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
