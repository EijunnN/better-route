import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";

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
}, (table) => [
  uniqueIndex("role_permissions_role_permission_idx").on(table.roleId, table.permissionId),
]);

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
}, (table) => [
  uniqueIndex("user_roles_user_role_idx").on(table.userId, table.roleId),
]);
