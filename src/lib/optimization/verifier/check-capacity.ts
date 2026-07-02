import type { VerifierFn, Violation, ViolationSeverity } from "./types";
import { orderById, sumBy, vehicleById } from "./utils";

/**
 * For every route, sum demand across its stops per dimension and compare to
 * the assigned vehicle's capacity.
 *
 * Severity follows the company profile (SEMANTICS A3): dimensions in
 * `config.profile.activeDimensions` are HARD — the solver constrained them,
 * so an excess is a real defect. Inactive dimensions degrade to INFO: the
 * solver never saw them (a VALUE-only company doesn't constrain weight), so
 * flagging them HARD blocked valid plans — but the physical overload signal
 * is still worth surfacing.
 *
 * `maxOrders` is always HARD; it isn't a profile dimension.
 */
export const checkCapacity: VerifierFn = ({
  orders,
  vehicles,
  config,
  plan,
}) => {
  const violations: Violation[] = [];
  const orderMap = orderById(orders);
  const vehicleMap = vehicleById(vehicles);

  // Mirror the solver's safeguard: an empty/missing profile falls back to
  // DEFAULT_DIMENSIONS = [WEIGHT, VOLUME] (profile-schema/resolve.ts).
  const activeDimensions = new Set<string>(
    config.profile?.activeDimensions?.length
      ? config.profile.activeDimensions
      : ["WEIGHT", "VOLUME"],
  );
  const severityFor = (dimension: string): ViolationSeverity =>
    activeDimensions.has(dimension) ? "HARD" : "INFO";

  for (const route of plan.routes) {
    const vehicle = vehicleMap.get(route.vehicleId);
    if (!vehicle) continue;

    const routeOrders = route.stops
      .map((s) => orderMap.get(s.orderId))
      .filter((o): o is NonNullable<typeof o> => !!o);

    const totalWeight = sumBy(routeOrders, (o) => o.weightRequired || 0);
    const totalVolume = sumBy(routeOrders, (o) => o.volumeRequired || 0);
    const totalValue = sumBy(routeOrders, (o) => o.orderValue || 0);
    const totalUnits = sumBy(routeOrders, (o) => o.unitsRequired || 0);
    const totalStops = route.stops.length;

    if (vehicle.maxWeight > 0 && totalWeight > vehicle.maxWeight) {
      violations.push({
        code: "CAPACITY_EXCEEDED_WEIGHT",
        severity: severityFor("WEIGHT"),
        vehicleId: route.vehicleId,
        vehicleIdentifier: route.vehicleIdentifier,
        expected: `<= ${vehicle.maxWeight}`,
        actual: totalWeight,
        message: `Route weight exceeds vehicle capacity`,
      });
    }
    if (vehicle.maxVolume > 0 && totalVolume > vehicle.maxVolume) {
      violations.push({
        code: "CAPACITY_EXCEEDED_VOLUME",
        severity: severityFor("VOLUME"),
        vehicleId: route.vehicleId,
        vehicleIdentifier: route.vehicleIdentifier,
        expected: `<= ${vehicle.maxVolume}`,
        actual: totalVolume,
        message: `Route volume exceeds vehicle capacity`,
      });
    }
    if (
      vehicle.maxValueCapacity !== undefined &&
      vehicle.maxValueCapacity > 0 &&
      totalValue > vehicle.maxValueCapacity
    ) {
      violations.push({
        code: "CAPACITY_EXCEEDED_VALUE",
        severity: severityFor("VALUE"),
        vehicleId: route.vehicleId,
        vehicleIdentifier: route.vehicleIdentifier,
        expected: `<= ${vehicle.maxValueCapacity}`,
        actual: totalValue,
        message: `Route value exceeds vehicle capacity`,
      });
    }
    if (
      vehicle.maxUnitsCapacity !== undefined &&
      vehicle.maxUnitsCapacity > 0 &&
      totalUnits > vehicle.maxUnitsCapacity
    ) {
      violations.push({
        code: "CAPACITY_EXCEEDED_UNITS",
        severity: severityFor("UNITS"),
        vehicleId: route.vehicleId,
        vehicleIdentifier: route.vehicleIdentifier,
        expected: `<= ${vehicle.maxUnitsCapacity}`,
        actual: totalUnits,
        message: `Route units exceed vehicle capacity`,
      });
    }
    if (
      vehicle.maxOrders !== undefined &&
      vehicle.maxOrders > 0 &&
      totalStops > vehicle.maxOrders
    ) {
      violations.push({
        code: "MAX_ORDERS_EXCEEDED",
        severity: "HARD",
        vehicleId: route.vehicleId,
        vehicleIdentifier: route.vehicleIdentifier,
        expected: `<= ${vehicle.maxOrders}`,
        actual: totalStops,
        message: `Route has more stops than vehicle max_orders`,
      });
    }
  }

  return violations;
};
