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

// ============================================
// CUSTOM FIELD DEFINITIONS - Per-company custom fields
// ============================================

export const FIELD_TYPES = {
  TEXT: "text",
  NUMBER: "number",
  SELECT: "select",
  DATE: "date",
  CURRENCY: "currency",
  PHONE: "phone",
  EMAIL: "email",
  BOOLEAN: "boolean",
} as const;

export const FIELD_ENTITIES = {
  ORDERS: "orders",
  ROUTE_STOPS: "route_stops",
} as const;

export const companyFieldDefinitions = pgTable("company_field_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  entity: varchar("entity", { length: 20 }).notNull().default("orders"),
  code: varchar("code", { length: 50 }).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  fieldType: varchar("field_type", { length: 20 }).notNull().default("text"),
  required: boolean("required").notNull().default(false),
  placeholder: varchar("placeholder", { length: 255 }),
  options: jsonb("options"),
  defaultValue: text("default_value"),
  position: integer("position").notNull().default(0),
  showInList: boolean("show_in_list").notNull().default(false),
  showInMobile: boolean("show_in_mobile").notNull().default(true),
  showInCsv: boolean("show_in_csv").notNull().default(true),
  validationRules: jsonb("validation_rules"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("field_definitions_company_id_idx").on(table.companyId),
]);
