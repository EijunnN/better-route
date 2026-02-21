/**
 * Factory functions for creating test data in the test database.
 *
 * Each factory inserts a record with sensible defaults that can be
 * overridden via partial input.  All IDs are auto-generated UUIDs.
 */
import { testDb } from "./test-db";
import {
  companies,
  users,
  fleets,
  vehicles,
  orders,
  optimizationConfigurations,
  optimizationJobs,
  routeStops,
  zones,
  zoneVehicles,
  companyWorkflowStates,
  companyWorkflowTransitions,
  companyFieldDefinitions,
  timeWindowPresets,
  vehicleSkills,
  userSkills,
  vehicleSkillAssignments,
  roles,
  userRoles,
  permissions,
  rolePermissions,
  driverLocations,
  reassignmentsHistory,
  planMetrics,
  optimizationPresets,
  companyOptimizationProfiles,
  csvColumnMappingTemplates,
  userAvailability,
  userSecondaryFleets,
  outputHistory,
} from "@/db/schema";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------
export async function createCompany(
  overrides: Partial<typeof companies.$inferInsert> = {},
) {
  const [record] = await testDb
    .insert(companies)
    .values({
      legalName: `Test Company ${Date.now()}`,
      commercialName: "Test Co",
      email: `company-${Date.now()}@test.com`,
      country: "PE",
      timezone: "America/Lima",
      currency: "PEN",
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
const DEFAULT_PASSWORD = "password123";
let hashedPasswordCache: string | null = null;

async function getHashedPassword(plain = DEFAULT_PASSWORD) {
  if (plain === DEFAULT_PASSWORD && hashedPasswordCache) {
    return hashedPasswordCache;
  }
  const hashed = await bcrypt.hash(plain, 10);
  if (plain === DEFAULT_PASSWORD) hashedPasswordCache = hashed;
  return hashed;
}

export async function createUser(
  overrides: Partial<typeof users.$inferInsert> & {
    companyId: string;
    plainPassword?: string;
  },
) {
  const password = await getHashedPassword(overrides.plainPassword);
  const ts = Date.now();
  const [record] = await testDb
    .insert(users)
    .values({
      name: `User ${ts}`,
      email: `user-${ts}@test.com`,
      username: `user_${ts}`,
      password,
      role: "PLANIFICADOR",
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

/** Shorthand factories for each role. */
export const createAdmin = (companyId: string | null, extra: Record<string, unknown> = {}) =>
  createUser({ companyId, role: "ADMIN_SISTEMA", ...extra } as any);

export const createPlanner = (companyId: string, extra: Record<string, unknown> = {}) =>
  createUser({ companyId, role: "PLANIFICADOR", ...extra } as any);

export const createMonitor = (companyId: string, extra: Record<string, unknown> = {}) =>
  createUser({ companyId, role: "MONITOR", ...extra } as any);

export const createFleetAdmin = (companyId: string, extra: Record<string, unknown> = {}) =>
  createUser({ companyId, role: "ADMIN_FLOTA", ...extra } as any);

export const createDriver = (companyId: string, extra: Record<string, unknown> = {}) =>
  createUser({ companyId, role: "CONDUCTOR", ...extra } as any);

// ---------------------------------------------------------------------------
// Fleets
// ---------------------------------------------------------------------------
export async function createFleet(
  overrides: Partial<typeof fleets.$inferInsert> & { companyId: string },
) {
  const [record] = await testDb
    .insert(fleets)
    .values({
      name: `Fleet ${Date.now()}`,
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------
export async function createVehicle(
  overrides: Partial<typeof vehicles.$inferInsert> & { companyId: string },
) {
  const [record] = await testDb
    .insert(vehicles)
    .values({
      name: `Vehicle ${Date.now()}`,
      plate: `TEST-${Date.now().toString(36).toUpperCase()}`,
      maxOrders: 20,
      status: "AVAILABLE",
      active: true,
      originLatitude: "-12.0464",
      originLongitude: "-77.0428",
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export async function createOrder(
  overrides: Partial<typeof orders.$inferInsert> & { companyId: string },
) {
  const ts = Date.now();
  const [record] = await testDb
    .insert(orders)
    .values({
      trackingId: `TRK-${ts}`,
      address: "Av. Test 123, Lima",
      latitude: "-12.0464",
      longitude: "-77.0428",
      status: "PENDING",
      active: true,
      customFields: {},
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Optimization Configurations
// ---------------------------------------------------------------------------
export async function createOptimizationConfig(
  overrides: Partial<typeof optimizationConfigurations.$inferInsert> & {
    companyId: string;
  },
) {
  const [record] = await testDb
    .insert(optimizationConfigurations)
    .values({
      name: `Config ${Date.now()}`,
      depotLatitude: "-12.0464",
      depotLongitude: "-77.0428",
      selectedVehicleIds: [],
      selectedDriverIds: [],
      workWindowStart: "08:00",
      workWindowEnd: "18:00",
      status: "DRAFT",
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Optimization Jobs
// ---------------------------------------------------------------------------
export interface OptimizationResultFixture {
  routes: Array<{
    routeId: string;
    vehicleId: string;
    vehiclePlate: string;
    driverId?: string;
    stops: Array<{
      orderId: string;
      trackingId: string;
      sequence: number;
      address: string;
      latitude: string;
      longitude: string;
    }>;
    totalDistance: number;
    totalDuration: number;
    totalWeight: number;
    totalVolume: number;
    utilizationPercentage: number;
    timeWindowViolations: number;
  }>;
  unassignedOrders: Array<{
    orderId: string;
    trackingId: string;
    reason: string;
  }>;
  metrics: {
    totalDistance: number;
    totalDuration: number;
    totalRoutes: number;
    totalStops: number;
    utilizationRate: number;
    timeWindowComplianceRate: number;
  };
  summary: {
    optimizedAt: string;
    objective: string;
    processingTimeMs: number;
  };
}

export function buildOptimizationResult(
  routes: OptimizationResultFixture["routes"],
  unassigned: OptimizationResultFixture["unassignedOrders"] = [],
): OptimizationResultFixture {
  const totalStops = routes.reduce((s, r) => s + r.stops.length, 0);
  return {
    routes,
    unassignedOrders: unassigned,
    metrics: {
      totalDistance: routes.reduce((s, r) => s + r.totalDistance, 0),
      totalDuration: routes.reduce((s, r) => s + r.totalDuration, 0),
      totalRoutes: routes.length,
      totalStops,
      utilizationRate: 75,
      timeWindowComplianceRate: 90,
    },
    summary: {
      optimizedAt: new Date().toISOString(),
      objective: "BALANCED",
      processingTimeMs: 500,
    },
  };
}

export async function createOptimizationJob(
  overrides: Partial<typeof optimizationJobs.$inferInsert> & {
    companyId: string;
    configurationId: string;
  },
) {
  const [record] = await testDb
    .insert(optimizationJobs)
    .values({
      status: "COMPLETED",
      progress: 100,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Route Stops
// ---------------------------------------------------------------------------
export async function createRouteStop(
  overrides: Partial<typeof routeStops.$inferInsert> & {
    companyId: string;
    jobId: string;
    routeId: string;
    userId: string;
    vehicleId: string;
    orderId: string;
  },
) {
  const [record] = await testDb
    .insert(routeStops)
    .values({
      sequence: 1,
      address: "Av. Test 123, Lima",
      latitude: "-12.0464",
      longitude: "-77.0428",
      status: "PENDING",
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------
export async function createZone(
  overrides: Partial<typeof zones.$inferInsert> & { companyId: string },
) {
  const ts = Date.now();
  const [record] = await testDb
    .insert(zones)
    .values({
      name: `Zone ${ts}`,
      type: "DELIVERY",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-77.05, -12.04],
            [-77.04, -12.04],
            [-77.04, -12.05],
            [-77.05, -12.05],
            [-77.05, -12.04],
          ],
        ],
      },
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Zone Vehicles
// ---------------------------------------------------------------------------
export async function createZoneVehicle(
  overrides: Partial<typeof zoneVehicles.$inferInsert> & {
    companyId: string;
    zoneId: string;
    vehicleId: string;
  },
) {
  const [record] = await testDb
    .insert(zoneVehicles)
    .values({
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Workflow States
// ---------------------------------------------------------------------------
export async function createWorkflowState(
  overrides: Partial<typeof companyWorkflowStates.$inferInsert> & {
    companyId: string;
  },
) {
  const ts = Date.now();
  const [record] = await testDb
    .insert(companyWorkflowStates)
    .values({
      code: `STATE_${ts}`,
      label: `State ${ts}`,
      systemState: "PENDING",
      color: "#6B7280",
      position: 0,
      requiresReason: false,
      requiresPhoto: false,
      requiresSignature: false,
      requiresNotes: false,
      isTerminal: false,
      isDefault: false,
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Workflow Transitions
// ---------------------------------------------------------------------------
export async function createWorkflowTransition(
  overrides: Partial<typeof companyWorkflowTransitions.$inferInsert> & {
    companyId: string;
    fromStateId: string;
    toStateId: string;
  },
) {
  const [record] = await testDb
    .insert(companyWorkflowTransitions)
    .values({
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Field Definitions
// ---------------------------------------------------------------------------
export async function createFieldDefinition(
  overrides: Partial<typeof companyFieldDefinitions.$inferInsert> & {
    companyId: string;
  },
) {
  const ts = Date.now();
  const [record] = await testDb
    .insert(companyFieldDefinitions)
    .values({
      entity: "orders",
      code: `field_${ts}`,
      label: `Field ${ts}`,
      fieldType: "text",
      required: false,
      position: 0,
      showInList: false,
      showInMobile: true,
      showInCsv: true,
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Time Window Presets
// ---------------------------------------------------------------------------
export async function createTimeWindowPreset(
  overrides: Partial<typeof timeWindowPresets.$inferInsert> & {
    companyId: string;
  },
) {
  const ts = Date.now();
  const [record] = await testDb
    .insert(timeWindowPresets)
    .values({
      name: `Preset ${ts}`,
      type: "SHIFT",
      startTime: "08:00",
      endTime: "18:00",
      strictness: "HARD",
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Vehicle Skills
// ---------------------------------------------------------------------------
export async function createVehicleSkill(
  overrides: Partial<typeof vehicleSkills.$inferInsert> & {
    companyId: string;
  },
) {
  const ts = Date.now();
  const [record] = await testDb
    .insert(vehicleSkills)
    .values({
      name: `Skill ${ts}`,
      code: `SKILL_${ts}`,
      category: "EQUIPMENT",
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// User Skill Assignments
// ---------------------------------------------------------------------------
export async function createUserSkillAssignment(
  overrides: Partial<typeof userSkills.$inferInsert> & {
    companyId: string;
    userId: string;
    skillId: string;
  },
) {
  const [record] = await testDb
    .insert(userSkills)
    .values({
      obtainedAt: new Date(),
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Vehicle Skill Assignments
// ---------------------------------------------------------------------------
export async function createVehicleSkillAssignment(
  overrides: Partial<typeof vehicleSkillAssignments.$inferInsert> & {
    companyId: string;
    vehicleId: string;
    skillId: string;
  },
) {
  const [record] = await testDb
    .insert(vehicleSkillAssignments)
    .values({
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Roles (Custom)
// ---------------------------------------------------------------------------
export async function createRole(
  overrides: Partial<typeof roles.$inferInsert> & {
    companyId: string;
  },
) {
  const ts = Date.now();
  const [record] = await testDb
    .insert(roles)
    .values({
      name: `Role ${ts}`,
      code: `ROLE_${ts}`,
      isSystem: false,
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// User Roles
// ---------------------------------------------------------------------------
export async function createUserRole(
  overrides: Partial<typeof userRoles.$inferInsert> & {
    userId: string;
    roleId: string;
  },
) {
  const [record] = await testDb
    .insert(userRoles)
    .values({
      isPrimary: false,
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------
export async function createPermission(
  overrides: Partial<typeof permissions.$inferInsert> = {},
) {
  const ts = Date.now();
  const [record] = await testDb
    .insert(permissions)
    .values({
      entity: "orders",
      action: "VIEW",
      name: `Permission ${ts}`,
      category: "ORDERS",
      displayOrder: 0,
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Role Permissions
// ---------------------------------------------------------------------------
export async function createRolePermission(
  overrides: Partial<typeof rolePermissions.$inferInsert> & {
    roleId: string;
    permissionId: string;
  },
) {
  const [record] = await testDb
    .insert(rolePermissions)
    .values({
      enabled: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Driver Locations
// ---------------------------------------------------------------------------
export async function createDriverLocation(
  overrides: Partial<typeof driverLocations.$inferInsert> & {
    companyId: string;
    driverId: string;
  },
) {
  const [record] = await testDb
    .insert(driverLocations)
    .values({
      latitude: "-12.0464",
      longitude: "-77.0428",
      accuracy: 10,
      speed: 30,
      source: "GPS",
      recordedAt: new Date(),
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Reassignment History
// ---------------------------------------------------------------------------
export async function createReassignmentHistory(
  overrides: Partial<typeof reassignmentsHistory.$inferInsert> & {
    companyId: string;
    absentUserId: string;
  },
) {
  const [record] = await testDb
    .insert(reassignmentsHistory)
    .values({
      absentUserName: "Absent Driver",
      routeIds: ["route-1"],
      vehicleIds: ["vehicle-1"],
      reassignments: [],
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Plan Metrics
// ---------------------------------------------------------------------------
export async function createPlanMetrics(
  overrides: Partial<typeof planMetrics.$inferInsert> & {
    companyId: string;
    jobId: string;
    configurationId: string;
  },
) {
  const [record] = await testDb
    .insert(planMetrics)
    .values({
      totalRoutes: 1,
      totalStops: 5,
      totalDistance: 10000,
      totalDuration: 3600,
      averageUtilizationRate: 50,
      maxUtilizationRate: 80,
      minUtilizationRate: 20,
      timeWindowComplianceRate: 90,
      totalTimeWindowViolations: 0,
      driverAssignmentCoverage: 100,
      averageAssignmentQuality: 85,
      assignmentsWithWarnings: 0,
      assignmentsWithErrors: 0,
      skillCoverage: 100,
      licenseCompliance: 100,
      fleetAlignment: 100,
      workloadBalance: 80,
      unassignedOrders: 0,
      objective: "BALANCED",
      processingTimeMs: 500,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Optimization Presets
// ---------------------------------------------------------------------------
export async function createOptimizationPreset(
  overrides: Partial<typeof optimizationPresets.$inferInsert> & {
    companyId: string;
  },
) {
  const ts = Date.now();
  const [record] = await testDb
    .insert(optimizationPresets)
    .values({
      name: `Preset ${ts}`,
      isDefault: false,
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Company Optimization Profiles
// ---------------------------------------------------------------------------
export async function createCompanyProfile(
  overrides: Partial<typeof companyOptimizationProfiles.$inferInsert> & {
    companyId: string;
  },
) {
  const [record] = await testDb
    .insert(companyOptimizationProfiles)
    .values({
      enableWeight: true,
      enableVolume: true,
      enableOrderValue: false,
      enableOrderType: false,
      enableUnits: false,
      activeDimensions: ["WEIGHT", "VOLUME"],
      priorityMapping: { NEW: 50, RESCHEDULED: 80, URGENT: 100 },
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// CSV Column Mapping Templates
// ---------------------------------------------------------------------------
export async function createCsvMappingTemplate(
  overrides: Partial<typeof csvColumnMappingTemplates.$inferInsert> & {
    companyId: string;
  },
) {
  const ts = Date.now();
  const [record] = await testDb
    .insert(csvColumnMappingTemplates)
    .values({
      name: `Template ${ts}`,
      columnMapping: { tracking_id: "trackingId", address: "address" },
      requiredFields: ["trackingId", "address"],
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// User Availability
// ---------------------------------------------------------------------------
export async function createUserAvailability(
  overrides: Partial<typeof userAvailability.$inferInsert> & {
    companyId: string;
    userId: string;
  },
) {
  const [record] = await testDb
    .insert(userAvailability)
    .values({
      dayOfWeek: "MONDAY",
      startTime: "08:00",
      endTime: "18:00",
      isDayOff: false,
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// User Secondary Fleets
// ---------------------------------------------------------------------------
export async function createUserSecondaryFleet(
  overrides: Partial<typeof userSecondaryFleets.$inferInsert> & {
    companyId: string;
    userId: string;
    fleetId: string;
  },
) {
  const [record] = await testDb
    .insert(userSecondaryFleets)
    .values({
      active: true,
      ...overrides,
    })
    .returning();
  return record;
}

// ---------------------------------------------------------------------------
// Output History
// ---------------------------------------------------------------------------
export async function createOutputHistory(
  overrides: Partial<typeof outputHistory.$inferInsert> & {
    companyId: string;
    jobId: string;
    generatedBy: string;
  },
) {
  const [record] = await testDb
    .insert(outputHistory)
    .values({
      format: "JSON",
      status: "GENERATED",
      ...overrides,
    })
    .returning();
  return record;
}
