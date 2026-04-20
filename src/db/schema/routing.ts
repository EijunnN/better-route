import {
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
import { vehicles } from "./vehicles";
import { orders } from "./orders";
import { optimizationJobs } from "./optimization";
import { companyWorkflowStates } from "./workflow";

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
  // Values for company-defined custom fields with entity="route_stops".
  // Shape: { [fieldDefinitionCode]: value } — validated against
  // companyFieldDefinitions at write time, not enforced by DB.
  customFields: jsonb("custom_fields").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("route_stops_company_id_idx").on(table.companyId),
  index("route_stops_job_id_idx").on(table.jobId),
  index("route_stops_user_id_idx").on(table.userId),
  index("route_stops_order_id_idx").on(table.orderId),
  index("route_stops_status_idx").on(table.status),
]);

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
  routeIds: jsonb("route_ids").notNull().$type<string[]>(),
  vehicleIds: jsonb("vehicle_ids").notNull().$type<string[]>(),
  // Reassignment details stored as JSON array of reassignments
  // Each entry: { userId, userName, stopIds, stopCount }
  reassignments: jsonb("reassignments").notNull(),
  reason: text("reason"),
  executedBy: uuid("executed_by").references(() => users.id),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
