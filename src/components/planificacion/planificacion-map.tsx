"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { Eye, EyeOff, MapPin, Move, Package, Truck } from "lucide-react";
import { usePlanificacion } from "./planificacion-context";

const PlanningMap = dynamic(
  () => import("@/components/planificacion/planning-map").then((mod) => mod.PlanningMap),
  {
    ssr: false,
    loading: () => <div className="h-full bg-muted animate-pulse rounded-lg" />,
  }
);

export function PlanificacionMapPanel() {
  const { state, actions, derived } = usePlanificacion();
  const [editMode, setEditMode] = useState(false);

  const displayVehicles =
    state.currentStep === "vehiculos" ? derived.filteredVehicles : derived.selectedVehicles;

  const showOrders = state.currentStep === "visitas" || state.currentStep === "configuracion";

  const handleOrderDragEnd = useCallback(
    async (orderId: string, latitude: number, longitude: number) => {
      try {
        await actions.updateOrderLocation(
          orderId,
          latitude.toFixed(6),
          longitude.toFixed(6),
        );
      } catch (err) {
        console.error("Failed to update order location:", err);
      }
    },
    [actions],
  );

  return (
    <div className="flex-1 relative">
      <PlanningMap
        vehicles={displayVehicles}
        orders={derived.selectedOrders}
        zones={state.showZones ? state.zones : []}
        showVehicleOrigins={state.currentStep === "vehiculos"}
        showOrders={showOrders}
        selectedVehicleIds={
          state.currentStep === "vehiculos" ? state.selectedVehicleIds : undefined
        }
        onOrderDragEnd={showOrders && editMode ? handleOrderDragEnd : undefined}
      />

      {/* Map controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        {showOrders && (
          <button
            type="button"
            onClick={() => setEditMode(!editMode)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-sm font-medium transition-colors ${
              editMode
                ? "bg-amber-500 text-white"
                : "bg-background/95 backdrop-blur text-muted-foreground hover:text-foreground"
            }`}
          >
            <Move className="w-4 h-4" />
            Mover puntos
          </button>
        )}
        {state.zones.length > 0 && (
          <button
            type="button"
            onClick={() => actions.setShowZones(!state.showZones)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-sm font-medium transition-colors ${
              state.showZones
                ? "bg-primary text-primary-foreground"
                : "bg-background/95 backdrop-blur text-muted-foreground hover:text-foreground"
            }`}
          >
            {state.showZones ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            Zonas ({state.zones.length})
          </button>
        )}
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div className="absolute top-4 left-4 right-20 md:right-auto md:left-4 bg-amber-500/90 backdrop-blur text-white text-xs font-medium px-3 py-2 rounded-lg shadow-lg">
          Arrastra los puntos para mover pedidos
        </div>
      )}

      {/* Map overlay stats */}
      <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur rounded-lg shadow-lg p-3 text-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" />
            <span className="font-medium">{state.selectedVehicleIds.length}</span>
            <span className="text-muted-foreground">vehículos</span>
          </div>
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-green-600" />
            <span className="font-medium">{state.selectedOrderIds.length}</span>
            <span className="text-muted-foreground">visitas</span>
          </div>
          {state.zones.length > 0 && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span className="font-medium">{state.zones.length}</span>
              <span className="text-muted-foreground">zonas</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
