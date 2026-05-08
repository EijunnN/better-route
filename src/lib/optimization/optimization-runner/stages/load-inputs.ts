/**
 * Stage 1 — Load: pull every piece of state the runner needs from the
 * database. Pure I/O. Returns a `LoadedInputs` snapshot the rest of the
 * pipeline operates on without re-querying.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  optimizationConfigurations,
  optimizationPresets,
  orders,
  USER_ROLES,
  users,
  vehicles,
  zoneVehicles,
  zones,
} from "@/db/schema";
import type { VehicleZoneAssignment, ZoneData } from "../../../geo/zone-utils";
import type { OptimizationInput } from "../types";

type OptConfigRow = NonNullable<
  Awaited<ReturnType<typeof db.query.optimizationConfigurations.findFirst>>
>;

type PendingOrder = Awaited<typeof db.query.orders.findMany> extends never
  ? never
  : Awaited<ReturnType<typeof db.query.orders.findMany>>[number];

type VehicleRow = Awaited<
  ReturnType<typeof db.query.vehicles.findMany>
>[number];

type DriverRow = Awaited<ReturnType<typeof db.query.users.findMany>>[number];

type PresetRow = Awaited<
  ReturnType<typeof db.query.optimizationPresets.findFirst>
>;

export interface LoadedInputs {
  config: OptConfigRow;
  pendingOrders: PendingOrder[];
  selectedVehicles: VehicleRow[];
  selectedDrivers: DriverRow[];
  zonesData: ZoneData[];
  zoneAssignmentsByVehicle: Map<string, VehicleZoneAssignment[]>;
  /** Preset bound to this configuration, or default for the company, or null. */
  preset: PresetRow | null;
}

export async function loadInputs(
  input: OptimizationInput,
): Promise<LoadedInputs> {
  // Configuration
  const config = await db.query.optimizationConfigurations.findFirst({
    where: eq(optimizationConfigurations.id, input.configurationId),
  });
  if (!config) {
    throw new Error("Configuration not found");
  }

  // Pending orders for this company
  const pendingOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.companyId, input.companyId),
      eq(orders.status, "PENDING"),
      eq(orders.active, true),
    ),
  });

  // Selected vehicles (with their fleets resolved for downstream display)
  const selectedVehicles = await db.query.vehicles.findMany({
    where: and(
      eq(vehicles.companyId, input.companyId),
      inArray(vehicles.id, input.vehicleIds),
      eq(vehicles.active, true),
    ),
    with: {
      vehicleFleets: {
        with: { fleet: true },
      },
    },
  });

  // Vehicle zone assignments
  const vehicleZoneAssignments = await db
    .select()
    .from(zoneVehicles)
    .where(
      and(
        eq(zoneVehicles.companyId, input.companyId),
        inArray(
          zoneVehicles.vehicleId,
          selectedVehicles.map((v) => v.id),
        ),
        eq(zoneVehicles.active, true),
      ),
    );

  const zoneAssignmentsByVehicle = new Map<string, VehicleZoneAssignment[]>();
  for (const assignment of vehicleZoneAssignments) {
    const existing = zoneAssignmentsByVehicle.get(assignment.vehicleId) || [];
    existing.push({
      zoneId: assignment.zoneId,
      vehicleId: assignment.vehicleId,
      assignedDays: assignment.assignedDays,
      active: assignment.active,
    });
    zoneAssignmentsByVehicle.set(assignment.vehicleId, existing);
  }

  // Active zones
  const activeZones = await db
    .select()
    .from(zones)
    .where(and(eq(zones.companyId, input.companyId), eq(zones.active, true)));

  const zonesData: ZoneData[] = activeZones.map((z) => ({
    id: z.id,
    name: z.name,
    geometry: z.geometry,
    activeDays: z.activeDays,
    active: z.active,
    type: z.type || undefined,
    color: z.color || undefined,
  }));

  // Drivers (users with role CONDUCTOR)
  const selectedDrivers = await db.query.users.findMany({
    where: and(
      eq(users.companyId, input.companyId),
      inArray(users.id, input.driverIds),
      eq(users.active, true),
      eq(users.role, USER_ROLES.CONDUCTOR),
    ),
  });

  // Optimization preset bound to this configuration. The config's
  // `optimizationPresetId` wins — this is what the user picked for this run.
  // NULL falls back to the company's default preset, which keeps legacy
  // configs working. If there's no default either, the runner uses sensible
  // system defaults (the `??` fallbacks at vroomConfig assembly time).
  const preset = config.optimizationPresetId
    ? ((await db.query.optimizationPresets.findFirst({
        where: and(
          eq(optimizationPresets.id, config.optimizationPresetId),
          eq(optimizationPresets.companyId, input.companyId),
          eq(optimizationPresets.active, true),
        ),
      })) ?? null)
    : ((await db.query.optimizationPresets.findFirst({
        where: and(
          eq(optimizationPresets.companyId, input.companyId),
          eq(optimizationPresets.isDefault, true),
          eq(optimizationPresets.active, true),
        ),
      })) ?? null);

  return {
    config,
    pendingOrders,
    selectedVehicles,
    selectedDrivers,
    zonesData,
    zoneAssignmentsByVehicle,
    preset,
  };
}
