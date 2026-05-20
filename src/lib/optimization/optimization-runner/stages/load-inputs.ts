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
  zones,
  zoneVehicles,
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

  // Most loads are independent — race them. vehicleZoneAssignments depends
  // on selectedVehicles' ids, so it's loaded in a second wave.
  const [
    pendingOrders,
    selectedVehicles,
    activeZones,
    selectedDrivers,
    preset,
  ] = await Promise.all([
    db.query.orders.findMany({
      where: and(
        eq(orders.companyId, input.companyId),
        eq(orders.status, "PENDING"),
        eq(orders.active, true),
      ),
    }),
    db.query.vehicles.findMany({
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
    }),
    db
      .select()
      .from(zones)
      .where(and(eq(zones.companyId, input.companyId), eq(zones.active, true))),
    db.query.users.findMany({
      where: and(
        eq(users.companyId, input.companyId),
        inArray(users.id, input.driverIds),
        eq(users.active, true),
        eq(users.role, USER_ROLES.CONDUCTOR),
      ),
    }),
    // Optimization preset bound to this configuration. The config's
    // `optimizationPresetId` wins — this is what the user picked for this
    // run. NULL falls back to the company's default preset, which keeps
    // legacy configs working. If there's no default either, the runner
    // uses sensible system defaults (the `??` fallbacks at vroomConfig
    // assembly time).
    config.optimizationPresetId
      ? db.query.optimizationPresets
          .findFirst({
            where: and(
              eq(optimizationPresets.id, config.optimizationPresetId),
              eq(optimizationPresets.companyId, input.companyId),
              eq(optimizationPresets.active, true),
            ),
          })
          .then((p) => p ?? null)
      : db.query.optimizationPresets
          .findFirst({
            where: and(
              eq(optimizationPresets.companyId, input.companyId),
              eq(optimizationPresets.isDefault, true),
              eq(optimizationPresets.active, true),
            ),
          })
          .then((p) => p ?? null),
  ]);

  // Vehicle zone assignments (depends on selectedVehicles ids)
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

  const zonesData: ZoneData[] = activeZones.map((z) => ({
    id: z.id,
    name: z.name,
    geometry: z.geometry,
    activeDays: z.activeDays,
    active: z.active,
    type: z.type || undefined,
    color: z.color || undefined,
  }));

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
