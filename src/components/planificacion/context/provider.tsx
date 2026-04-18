"use client";

import { type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";
import type {
  PlanificacionState,
  PlanificacionActions,
  PlanificacionMeta,
  PlanificacionDerived,
} from "./types";
import { PlanificacionContext } from "./context-instance";
import { usePlanificacionState } from "./use-state";
import { usePlanificacionDerived } from "./use-derived";
import { usePlanificacionEffects } from "./use-effects";
import { usePlanificacionActions } from "./use-actions";

export function PlanificacionProvider({ children }: { children: ReactNode }) {
  // Hook order below is load-bearing: router -> companyContext -> toast ->
  // all useState (inside usePlanificacionState) -> useEffect (inside
  // usePlanificacionEffects). The split hooks never conditionally skip hook
  // calls, so React's rules-of-hooks invariant is preserved.
  const router = useRouter();
  const {
    effectiveCompanyId: companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  } = useCompanyContext();
  const { toast } = useToast();

  // All useState calls live here, in the same order as the original file.
  const state = usePlanificacionState();

  // useEffect(s) + data loaders. Must run after state so setters exist.
  const { loadOrders } = usePlanificacionEffects({ state, companyId });

  // Pure derivations from state — no hooks internally.
  const derived = usePlanificacionDerived(state);

  // Actions — no hooks internally. Actions may call loaders (e.g. CSV upload
  // refreshes orders after success), which is why loadOrders is passed in.
  const actions = usePlanificacionActions({
    state,
    derived,
    companyId,
    router,
    toast,
    loadOrders,
  });

  // Build context value
  const stateValue: PlanificacionState = {
    currentStep: state.currentStep,
    completedSteps: state.completedSteps,
    vehicles: state.vehicles,
    fleets: state.fleets,
    selectedVehicleIds: state.selectedVehicleIds,
    vehicleSearch: state.vehicleSearch,
    fleetFilter: state.fleetFilter,
    vehiclesLoading: state.vehiclesLoading,
    orders: state.orders,
    selectedOrderIds: state.selectedOrderIds,
    orderSearch: state.orderSearch,
    orderTab: state.orderTab,
    ordersLoading: state.ordersLoading,
    deletingOrderId: state.deletingOrderId,
    planName: state.planName,
    planDate: state.planDate,
    planTime: state.planTime,
    objective: state.objective,
    serviceTime: state.serviceTime,
    capacityEnabled: state.capacityEnabled,
    optimizerType: state.optimizerType,
    optimizers: state.optimizers,
    optimizersLoading: state.optimizersLoading,
    zones: state.zones,
    showZones: state.showZones,
    companyProfile: state.companyProfile,
    isSubmitting: state.isSubmitting,
    error: state.error,
    showCsvUpload: state.showCsvUpload,
    csvFile: state.csvFile,
    csvUploading: state.csvUploading,
    csvError: state.csvError,
    csvPreview: state.csvPreview,
    csvHeaders: state.csvHeaders,
    editingOrder: state.editingOrder,
    editOrderData: state.editOrderData,
    isUpdatingOrder: state.isUpdatingOrder,
    updateOrderError: state.updateOrderError,
    fieldDefinitions: state.fieldDefinitions,
    csvCustomFieldMappings: state.csvCustomFieldMappings,
  };

  const actionsValue: PlanificacionActions = actions;

  const meta: PlanificacionMeta = {
    companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  };

  const derivedValue: PlanificacionDerived = derived;

  return (
    <PlanificacionContext value={{ state: stateValue, actions: actionsValue, meta, derived: derivedValue }}>
      {children}
    </PlanificacionContext>
  );
}
