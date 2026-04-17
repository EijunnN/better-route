import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";

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
}, (table) => [
  index("alerts_company_id_idx").on(table.companyId),
  index("alerts_company_status_idx").on(table.companyId, table.status),
  index("alerts_entity_idx").on(table.entityType, table.entityId),
]);

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
