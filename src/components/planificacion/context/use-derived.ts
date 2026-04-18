"use client";

import type { PlanificacionDerived } from "./types";
import type { PlanificacionStateBag } from "./use-state";

/**
 * Computes derived/memoized values from state.
 * Kept as plain computation to preserve the exact reactivity behavior of the
 * original provider (no memoization was used there).
 */
export function usePlanificacionDerived(state: PlanificacionStateBag): PlanificacionDerived {
  const {
    selectedVehicleIds,
    selectedOrderIds,
    vehicles,
    orders,
    vehicleSearch,
    orderTab,
    orderSearch,
  } = state;

  // Derived values
  const selectedVehicleIdsSet = new Set(selectedVehicleIds);
  const selectedOrderIdsSet = new Set(selectedOrderIds);

  const filteredVehicles = vehicles.filter((v) => {
    const searchLower = vehicleSearch.toLowerCase();
    return (
      !vehicleSearch ||
      v.name.toLowerCase().includes(searchLower) ||
      (v.plate?.toLowerCase().includes(searchLower) ?? false) ||
      (v.assignedDriver?.name.toLowerCase().includes(searchLower) ?? false)
    );
  });

  let filteredOrders = orders;
  if (orderTab === "alertas") {
    filteredOrders = filteredOrders.filter((o) => !o.latitude || !o.longitude);
  } else if (orderTab === "conHorario") {
    filteredOrders = filteredOrders.filter((o) => o.timeWindowPresetId);
  }
  if (orderSearch) {
    const searchLower = orderSearch.toLowerCase();
    filteredOrders = filteredOrders.filter(
      (o) =>
        o.trackingId.toLowerCase().includes(searchLower) ||
        (o.customerName?.toLowerCase().includes(searchLower) ?? false) ||
        o.address.toLowerCase().includes(searchLower)
    );
  }

  const ordersWithIssues = orders.filter((o) => !o.latitude || !o.longitude);

  const selectedVehicles = vehicles.filter((v) => selectedVehicleIdsSet.has(v.id));

  const selectedOrders = orders.filter((o) => selectedOrderIdsSet.has(o.id));

  return {
    filteredVehicles,
    filteredOrders,
    ordersWithIssues,
    selectedVehicles,
    selectedOrders,
    selectedVehicleIdsSet,
    selectedOrderIdsSet,
    canProceedFromVehiculos: selectedVehicleIds.length > 0,
    canProceedFromVisitas: selectedOrderIds.length > 0,
  };
}
