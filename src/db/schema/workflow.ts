import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";

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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("workflow_states_company_id_idx").on(table.companyId),
]);

export const companyWorkflowTransitions = pgTable("company_workflow_transitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  fromStateId: uuid("from_state_id").notNull().references(() => companyWorkflowStates.id, { onDelete: "cascade" }),
  toStateId: uuid("to_state_id").notNull().references(() => companyWorkflowStates.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("workflow_transitions_company_id_idx").on(table.companyId),
]);
