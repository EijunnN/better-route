"use client";

import { Loader2 } from "lucide-react";
import { ProtectedPage } from "@/components/auth/protected-page";
import {
  PlanificacionProvider,
  usePlanificacion,
  PlanificacionHeader,
  VehicleStep,
  OrderStep,
  ConfigStep,
  CsvUploadDialog,
  EditOrderDialog,
  PlanificacionMapPanel,
} from "@/components/planificacion";

function PlanificacionContent() {
  const { state, meta } = usePlanificacion();

  if (!meta.isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <PlanificacionHeader />

      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Controls */}
        <div className="w-[450px] border-r bg-background overflow-y-auto">
          {state.error && (
            <div className="m-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              {state.error}
            </div>
          )}

          {state.currentStep === "vehiculos" && <VehicleStep />}
          {state.currentStep === "visitas" && <OrderStep />}
          {state.currentStep === "configuracion" && <ConfigStep />}
        </div>

        {/* Right panel - Map */}
        <PlanificacionMapPanel />
      </div>

      {/* Dialogs */}
      <CsvUploadDialog />
      <EditOrderDialog />
    </div>
  );
}

/**
 * Planificacion Page - Compound Component Pattern
 *
 * Uses composition to separate:
 * - State management (PlanificacionProvider)
 * - UI components (PlanificacionHeader, VehicleStep, OrderStep, ConfigStep)
 * - Dialogs (CsvUploadDialog, EditOrderDialog)
 * - Map (PlanificacionMapPanel)
 *
 * For custom layouts:
 * ```tsx
 * <PlanificacionProvider>
 *   <PlanificacionHeader />
 *   <VehicleStep />
 *   <OrderStep />
 *   <ConfigStep />
 *   <PlanificacionMapPanel />
 * </PlanificacionProvider>
 * ```
 */
export default function PlanificacionPage() {
  return (
    <ProtectedPage requiredPermission="plan:read">
      <PlanificacionProvider>
        <PlanificacionContent />
      </PlanificacionProvider>
    </ProtectedPage>
  );
}
