import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users } from "./users";
import { TIME_WINDOW_STRICTNESS } from "./orders";

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
    selectedVehicleIds: jsonb("selected_vehicle_ids").notNull().$type<string[]>(),
    selectedDriverIds: jsonb("selected_driver_ids").notNull().$type<string[]>(),
    // Optimization parameters
    objective: varchar("objective", { length: 20 })
      .notNull()
      .$type<keyof typeof OPTIMIZATION_OBJECTIVE>()
      .default("BALANCED"),
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
    // Engine selection — VROOM is the only supported value (legacy column kept for data).
    optimizerType: varchar("optimizer_type", { length: 20 }).notNull().default("VROOM"),
    // Which optimization preset to apply when this config is run. NULL means
    // "use whatever preset is marked isDefault=true for the company" — keeps
    // legacy configs working. ON DELETE SET NULL: deleting a preset doesn't
    // break historical configs; they fall back to the default.
    optimizationPresetId: uuid("optimization_preset_id").references(
      (): AnyPgColumn => optimizationPresets.id,
      { onDelete: "set null" },
    ),
    // Metadata
    status: varchar("status", { length: 50 }).notNull().default("DRAFT"), // DRAFT, CONFIGURED, CONFIRMED
    confirmedAt: timestamp("confirmed_at"),
    confirmedBy: uuid("confirmed_by").references(() => users.id),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
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
  result: jsonb("result"), // Optimization results
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
}, (table) => [
  index("optimization_jobs_company_id_idx").on(table.companyId),
  index("optimization_jobs_company_status_idx").on(table.companyId, table.status),
  index("optimization_jobs_config_idx").on(table.configurationId),
]);

// Optimization presets - saved optimization configurations
export const optimizationPresets = pgTable("optimization_presets", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // Optimization flags. Kept minimal — only values the runner actually
  // passes to VROOM. Removed PyVRP-era knobs (mergeSimilar, simplify, etc.)
  // and `openEnd` boolean after routeEndMode="OPEN_END" covered it.
  balanceVisits: boolean("balance_visits").notNull().default(false),
  minimizeVehicles: boolean("minimize_vehicles").notNull().default(false),
  openStart: boolean("open_start").notNull().default(false),
  oneRoutePerVehicle: boolean("one_route_per_vehicle").notNull().default(true),
  flexibleTimeWindows: boolean("flexible_time_windows")
    .notNull()
    .default(false),
  // Group orders with same coordinates as single stop
  groupSameLocation: boolean("group_same_location").notNull().default(true),
  // Parameters
  maxDistanceKm: integer("max_distance_km").default(200),
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
    // Active capacity dimensions
    activeDimensions: jsonb("active_dimensions").notNull().default(["WEIGHT", "VOLUME"]),
    // Priority mapping by order type
    priorityMapping: jsonb("priority_mapping").notNull().default({ NEW: 50, RESCHEDULED: 80, URGENT: 100 }),
    // Default time windows
    defaultTimeWindows: jsonb("default_time_windows"),
    // Metadata
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);

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
