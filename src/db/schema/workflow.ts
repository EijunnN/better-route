import {
  boolean,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";

// ============================================
// DELIVERY POLICY - Per-company presentation & policy layer.
// The workflow STRUCTURE (states + transitions) is crystalized in code
// at `src/lib/workflow/states.ts` — this table only stores the
// per-company customization that an operator might tweak from the UI:
// labels, colours, photo/signature/notes requirements, failure reasons.
// One row per company; auto-seeded with sensible defaults at company
// creation time.
// ============================================

// Re-export so existing call-sites (`import { SYSTEM_STATES } from
// "@/db/schema"`) continue to work without a breaking import shuffle.
export { SYSTEM_STATES, type SystemState } from "@/lib/workflow/states";

export const companyDeliveryPolicy = pgTable("company_delivery_policy", {
  // PK is companyId so we get "one row per company" enforced by the
  // DB, and so the FK cascade cleans up automatically.
  companyId: uuid("company_id")
    .primaryKey()
    .references(() => companies.id, { onDelete: "cascade" }),

  // Branding / i18n — one label and one colour per system state.
  labelPending: varchar("label_pending", { length: 100 })
    .notNull()
    .default("Pendiente"),
  labelInProgress: varchar("label_in_progress", { length: 100 })
    .notNull()
    .default("En progreso"),
  labelCompleted: varchar("label_completed", { length: 100 })
    .notNull()
    .default("Entregado"),
  labelFailed: varchar("label_failed", { length: 100 })
    .notNull()
    .default("No entregado"),
  labelCancelled: varchar("label_cancelled", { length: 100 })
    .notNull()
    .default("Omitido"),

  colorPending: varchar("color_pending", { length: 7 })
    .notNull()
    .default("#6B7280"),
  colorInProgress: varchar("color_in_progress", { length: 7 })
    .notNull()
    .default("#3B82F6"),
  colorCompleted: varchar("color_completed", { length: 7 })
    .notNull()
    .default("#16A34A"),
  colorFailed: varchar("color_failed", { length: 7 })
    .notNull()
    .default("#DC4840"),
  colorCancelled: varchar("color_cancelled", { length: 7 })
    .notNull()
    .default("#9CA3AF"),

  // Policy on the COMPLETED transition — what evidence the driver
  // must submit to mark a stop as successfully delivered.
  completedRequiresPhoto: boolean("completed_requires_photo")
    .notNull()
    .default(true),
  completedRequiresSignature: boolean("completed_requires_signature")
    .notNull()
    .default(false),
  completedRequiresNotes: boolean("completed_requires_notes")
    .notNull()
    .default(false),

  // Policy on the FAILED transition — a reason is always required;
  // photo is optional (some operators want it, some don't).
  failedRequiresPhoto: boolean("failed_requires_photo")
    .notNull()
    .default(false),
  failedRequiresNotes: boolean("failed_requires_notes")
    .notNull()
    .default(true),

  // Closed list of reason strings the driver picks from when failing
  // a stop. Stored as JSONB array; the UI presents it as a tags input.
  failureReasons: jsonb("failure_reasons")
    .$type<string[]>()
    .notNull()
    .default([
      "Cliente ausente",
      "Dirección incorrecta",
      "Paquete dañado",
      "Cliente rechazó",
      "Zona insegura",
      "Reprogramado",
      "Otro",
    ]),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
