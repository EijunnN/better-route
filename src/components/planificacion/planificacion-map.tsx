"use client";

import {
  Eye,
  EyeOff,
  MapPin,
  Move,
  Package,
  Pencil,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { Can } from "@/components/auth/can";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFreehandDraw } from "@/hooks/use-freehand-draw";
import { usePlanificacion } from "./planificacion-context";
import { pointInPolygon } from "./point-in-polygon";

const PlanningMap = dynamic(
  () =>
    import("@/components/planificacion/planning-map").then(
      (mod) => mod.PlanningMap,
    ),
  {
    ssr: false,
    loading: () => <div className="h-full bg-muted animate-pulse rounded-lg" />,
  },
);

export function PlanificacionMapPanel() {
  const { state, actions, derived } = usePlanificacion();
  const [editMode, setEditMode] = useState(false);
  const [pencilMode, setPencilMode] = useState(false);
  const [lassoIds, setLassoIds] = useState<string[]>([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);

  const displayVehicles =
    state.currentStep === "vehiculos"
      ? derived.filteredVehicles
      : derived.selectedVehicles;

  const showOrders =
    state.currentStep === "visitas" || state.currentStep === "configuracion";

  // Ref para que el callback del lasso sea estable y no re-registre los
  // listeners del mapa en cada render (p. ej. durante el propio trazo).
  const selectedOrdersRef = useRef(derived.selectedOrders);
  selectedOrdersRef.current = derived.selectedOrders;

  const handleMapReady = useCallback((map: maplibregl.Map | null) => {
    setMapInstance(map);
  }, []);

  const handlePolygonComplete = useCallback((polygon: [number, number][]) => {
    const captured = selectedOrdersRef.current
      .filter((order) => {
        if (!order.latitude || !order.longitude) return false;
        const lng = Number.parseFloat(order.longitude);
        const lat = Number.parseFloat(order.latitude);
        if (Number.isNaN(lng) || Number.isNaN(lat)) return false;
        return pointInPolygon(lng, lat, polygon);
      })
      .map((order) => order.id);
    if (captured.length === 0) return;
    // Lassos sucesivos acumulan: marcar varios bolsones antes de actuar.
    setLassoIds((prev) => [...new Set([...prev, ...captured])]);
  }, []);

  useFreehandDraw({
    map: mapInstance,
    enabled: pencilMode && showOrders,
    onPolygonComplete: handlePolygonComplete,
  });

  const clearLasso = useCallback(() => {
    setLassoIds([]);
  }, []);

  const togglePencil = () => {
    setPencilMode((prev) => {
      const next = !prev;
      if (next) setEditMode(false);
      else setLassoIds([]);
      return next;
    });
  };

  const toggleEdit = () => {
    setEditMode((prev) => {
      const next = !prev;
      if (next) {
        setPencilMode(false);
        setLassoIds([]);
      }
      return next;
    });
  };

  const handleRemoveFromPlan = () => {
    actions.deselectOrders(lassoIds);
    setLassoIds([]);
  };

  const handleDeleteCaptured = async () => {
    await actions.deleteOrdersBulk(lassoIds);
    setLassoIds([]);
  };

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
          state.currentStep === "vehiculos"
            ? state.selectedVehicleIds
            : undefined
        }
        highlightedOrderIds={lassoIds}
        onOrderDragEnd={showOrders && editMode ? handleOrderDragEnd : undefined}
        onMapReady={handleMapReady}
      />

      {/* Map controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        {showOrders && (
          <button
            type="button"
            onClick={togglePencil}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-sm font-medium transition-colors ${
              pencilMode
                ? "bg-amber-500 text-white"
                : "bg-background/95 backdrop-blur text-muted-foreground hover:text-foreground"
            }`}
          >
            <Pencil className="size-4" />
            Lápiz
          </button>
        )}
        {showOrders && (
          <button
            type="button"
            onClick={toggleEdit}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-sm font-medium transition-colors ${
              editMode
                ? "bg-amber-500 text-white"
                : "bg-background/95 backdrop-blur text-muted-foreground hover:text-foreground"
            }`}
          >
            <Move className="size-4" />
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
            {state.showZones ? (
              <Eye className="size-4" />
            ) : (
              <EyeOff className="size-4" />
            )}
            Zonas ({state.zones.length})
          </button>
        )}
      </div>

      {/* Mode banners */}
      {editMode && (
        <div className="absolute top-4 left-4 right-20 md:right-auto md:left-4 bg-amber-500/90 backdrop-blur text-white text-xs font-medium px-3 py-2 rounded-lg shadow-lg">
          Arrastra los puntos para mover pedidos
        </div>
      )}
      {pencilMode && showOrders && (
        <div className="absolute top-4 left-4 right-20 md:right-auto md:left-4 bg-amber-500/90 backdrop-blur text-white text-xs font-medium px-3 py-2 rounded-lg shadow-lg">
          Encierra las visitas con un trazo para marcarlas
        </div>
      )}

      {/* Lasso action bar */}
      {showOrders && lassoIds.length > 0 && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/95 backdrop-blur px-3 py-2 shadow-xl">
          <span className="text-sm font-medium pr-1.5">
            {lassoIds.length} visita{lassoIds.length === 1 ? "" : "s"} marcada
            {lassoIds.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={handleRemoveFromPlan}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-muted hover:bg-muted/70 transition-colors"
            title="Desmarcarlas de esta planificación (no se rutean, siguen pendientes)"
          >
            Quitar del plan
          </button>
          <Can perm="order:bulk_delete">
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
              title="Eliminar los pedidos (no volverán a aparecer)"
            >
              <Trash2 className="size-3.5" />
              Eliminar
            </button>
          </Can>
          <button
            type="button"
            onClick={clearLasso}
            aria-label="Descartar selección"
            className="ml-0.5 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar {lassoIds.length} pedido
              {lassoIds.length === 1 ? "" : "s"} capturado
              {lassoIds.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se marcan como inactivos: salen de esta planificación y no
              volverán a aparecer como pendientes. Si solo quieres que no se
              ruteen hoy, usa "Quitar del plan".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => handleDeleteCaptured()}
            >
              Eliminar pedidos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Map overlay stats */}
      <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur rounded-lg shadow-lg p-3 text-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Truck className="size-4 text-primary" />
            <span className="font-medium">
              {state.currentStep === "vehiculos"
                ? `${state.selectedVehicleIds.length}/${derived.filteredVehicles.length}`
                : state.selectedVehicleIds.length}
            </span>
            <span className="text-muted-foreground">vehículos</span>
          </div>
          <div className="flex items-center gap-2">
            <Package className="size-4 text-green-600" />
            <span className="font-medium">{state.selectedOrderIds.length}</span>
            <span className="text-muted-foreground">visitas</span>
          </div>
          {state.zones.length > 0 && (
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-blue-600" />
              <span className="font-medium">{state.zones.length}</span>
              <span className="text-muted-foreground">zonas</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
