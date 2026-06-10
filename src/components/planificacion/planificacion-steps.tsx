"use client";

import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Route,
  Search,
  Trash2,
  Truck,
  Upload,
  User,
} from "lucide-react";
import { useState as useLocalState, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlanificacion } from "./planificacion-context";
import { OBJECTIVES, type StepId } from "./planificacion-types";
import { pointInPolygon } from "./point-in-polygon";

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "vehiculos", label: "Vehículos" },
  { id: "visitas", label: "Visitas" },
  { id: "configuracion", label: "Configuración" },
];

function formatShortDate(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return d && m ? `${d}/${m}` : isoDate;
}

function formatFullDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return d && m && y ? `${d}/${m}/${y}` : isoDate;
}

export function PlanificacionHeader() {
  const { state, actions, derived } = usePlanificacion();

  const vehicleCount = state.selectedVehicleIds.length;
  const orderCount = state.selectedOrderIds.length;

  const subtitles: Record<StepId, string> = {
    vehiculos:
      vehicleCount > 0
        ? `${vehicleCount} seleccionado${vehicleCount === 1 ? "" : "s"}`
        : "Elige tu flota",
    visitas:
      orderCount > 0
        ? `${orderCount} visita${orderCount === 1 ? "" : "s"}`
        : "Elige las entregas",
    configuracion: `${formatShortDate(state.planDate)} · ${state.planTime}`,
  };

  const validity: Record<StepId, boolean> = {
    vehiculos: derived.canProceedFromVehiculos,
    visitas: derived.canProceedFromVisitas,
    configuracion: false,
  };

  const reachable: Record<StepId, boolean> = {
    vehiculos: true,
    visitas: derived.canProceedFromVehiculos,
    configuracion:
      derived.canProceedFromVehiculos && derived.canProceedFromVisitas,
  };

  return (
    <div className="border-b px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Planificación de Rutas</h1>
          <p className="text-sm text-muted-foreground">
            Optimiza las rutas de entrega para tu flota
          </p>
        </div>

        <ol className="flex items-center" aria-label="Pasos de planificación">
          {STEPS.map((step, index) => {
            const isActive = step.id === state.currentStep;
            const isCompleted =
              state.completedSteps.has(step.id) && validity[step.id];
            const isReachable = reachable[step.id];

            return (
              <li key={step.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => actions.goToStep(step.id)}
                  disabled={!isReachable}
                  aria-current={isActive ? "step" : undefined}
                  className={`flex items-center gap-2.5 pl-2.5 pr-4 py-1.5 rounded-lg transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : isCompleted
                        ? "bg-primary/10 text-primary hover:bg-primary/20"
                        : isReachable
                          ? "bg-muted text-muted-foreground hover:bg-muted/80"
                          : "bg-muted/40 text-muted-foreground/50 cursor-not-allowed"
                  }`}
                >
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      isActive
                        ? "bg-primary-foreground/25 text-primary-foreground"
                        : isCompleted
                          ? "bg-primary text-primary-foreground"
                          : "bg-foreground/10"
                    }`}
                  >
                    {isCompleted && !isActive ? (
                      <Check className="size-3.5" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="text-left leading-tight">
                    <span className="block text-sm font-medium">
                      {step.label}
                    </span>
                    <span
                      className={`block text-[11px] ${
                        isActive
                          ? "text-primary-foreground/75"
                          : isReachable
                            ? "text-muted-foreground"
                            : "text-muted-foreground/50"
                      }`}
                    >
                      {subtitles[step.id]}
                    </span>
                  </span>
                </button>
                {index < STEPS.length - 1 && (
                  <ChevronRight
                    className="size-4 mx-1 text-muted-foreground/50"
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export function VehicleStep() {
  const { state, actions, derived } = usePlanificacion();

  const selectedCount = state.selectedVehicleIds.length;
  const hasFilters = state.vehicleSearch !== "" || state.fleetFilter !== "ALL";

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Date/Time selector */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label
              htmlFor="plan-date"
              className="text-xs text-muted-foreground"
            >
              Fecha
            </Label>
            <Input
              id="plan-date"
              type="date"
              value={state.planDate}
              onChange={(e) => actions.setPlanDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <Label
              htmlFor="plan-time"
              className="text-xs text-muted-foreground"
            >
              Hora inicio
            </Label>
            <Input
              id="plan-time"
              type="time"
              value={state.planTime}
              onChange={(e) => actions.setPlanTime(e.target.value)}
              className="h-9"
            />
          </div>
        </div>

        {/* Fleet filter and Search */}
        <div className="flex gap-2">
          <Select
            value={state.fleetFilter}
            onValueChange={actions.setFleetFilter}
          >
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Todas las flotas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las flotas</SelectItem>
              {state.fleets.map((fleet) => (
                <SelectItem key={fleet.id} value={fleet.id}>
                  {fleet.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar placa, conductor..."
              value={state.vehicleSearch}
              onChange={(e) => actions.setVehicleSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        {/* Select all */}
        {derived.filteredVehicles.length > 0 && (
          <div className="flex items-center justify-between py-1.5 px-2 bg-muted/50 rounded-md">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all-vehicles"
                checked={derived.filteredVehicles.every((v) =>
                  derived.selectedVehicleIdsSet.has(v.id),
                )}
                onCheckedChange={actions.selectAllVehicles}
              />
              <Label
                htmlFor="select-all-vehicles"
                className="text-sm cursor-pointer"
              >
                Seleccionar todos
              </Label>
            </div>
            <Badge variant="secondary" className="text-xs">
              {state.selectedVehicleIds.length}/
              {derived.filteredVehicles.length}
            </Badge>
          </div>
        )}

        {/* Vehicle list */}
        <div className="space-y-1.5">
          {state.vehiclesLoading ? (
            [0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-md border border-border/60 bg-muted/40 animate-pulse"
              />
            ))
          ) : derived.filteredVehicles.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Truck className="size-10 mx-auto mb-3 opacity-40" />
              {hasFilters ? (
                <>
                  <p className="text-sm font-medium">Sin resultados</p>
                  <p className="text-xs mt-1">
                    Ningún vehículo coincide con los filtros
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      actions.setVehicleSearch("");
                      actions.setFleetFilter("ALL");
                    }}
                  >
                    Limpiar filtros
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    No hay vehículos disponibles
                  </p>
                  <p className="text-xs mt-1">
                    Registra vehículos en Recursos para poder planificar
                  </p>
                </>
              )}
            </div>
          ) : (
            derived.filteredVehicles.map((vehicle) => {
              const hasActivePlan = (vehicle.activeStopsCount ?? 0) > 0;
              const isSelected = derived.selectedVehicleIdsSet.has(vehicle.id);
              const capacities: string[] = [];
              if (
                state.companyProfile?.enableUnits &&
                vehicle.maxUnitsCapacity
              ) {
                capacities.push(`${vehicle.maxUnitsCapacity} uds`);
              }
              if (state.companyProfile?.enableWeight && vehicle.weightCapacity)
                capacities.push(`${vehicle.weightCapacity} kg`);
              if (state.companyProfile?.enableVolume && vehicle.volumeCapacity)
                capacities.push(`${vehicle.volumeCapacity} L`);
              if (
                state.companyProfile?.enableOrderValue &&
                vehicle.maxValueCapacity
              ) {
                capacities.push(`S/ ${vehicle.maxValueCapacity}`);
              }
              if (vehicle.maxOrders)
                capacities.push(`máx ${vehicle.maxOrders} ped.`);

              return (
                <label
                  key={vehicle.id}
                  htmlFor={`vehicle-${vehicle.id}`}
                  className={`block p-2.5 rounded-md border transition-colors ${
                    hasActivePlan
                      ? "border-orange-300 bg-orange-50/50 dark:bg-orange-950/10 cursor-not-allowed opacity-70"
                      : isSelected
                        ? "border-primary bg-primary/5 cursor-pointer"
                        : "border-border hover:border-primary/50 hover:bg-muted/50 cursor-pointer"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id={`vehicle-${vehicle.id}`}
                      className="mt-0.5"
                      checked={isSelected}
                      onCheckedChange={() =>
                        !hasActivePlan && actions.toggleVehicle(vehicle.id)
                      }
                      disabled={hasActivePlan}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm">
                          {vehicle.plate || vehicle.name}
                        </span>
                        {(vehicle.brand || vehicle.model) && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 font-normal"
                          >
                            {[vehicle.brand, vehicle.model]
                              .filter(Boolean)
                              .join(" ")}
                          </Badge>
                        )}
                        {hasActivePlan && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20">
                            En ruta · {vehicle.activeStopsCount} paradas
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-1 text-[11px] text-muted-foreground">
                        {vehicle.assignedDriver ? (
                          <span className="flex items-center gap-1">
                            <User className="size-3" />
                            {vehicle.assignedDriver.name}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                            <User className="size-3" />
                            Sin conductor
                          </span>
                        )}
                        {capacities.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Package className="size-3" />
                            {capacities.join(" · ")}
                          </span>
                        )}
                      </div>
                      {vehicle.originAddress && (
                        <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
                          <MapPin className="size-3 shrink-0" />
                          <span className="truncate">
                            {vehicle.originAddress}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </div>

      {/* Next button */}
      <div className="p-4 border-t space-y-2">
        <Button
          className="w-full"
          onClick={actions.nextStep}
          disabled={!derived.canProceedFromVehiculos}
        >
          {selectedCount > 0
            ? `Continuar con ${selectedCount} vehículo${selectedCount === 1 ? "" : "s"}`
            : "Continuar a Visitas"}
          <ChevronRight className="size-4 ml-2" />
        </Button>
        {!derived.canProceedFromVehiculos && !state.vehiclesLoading && (
          <p className="text-xs text-muted-foreground text-center">
            Selecciona al menos un vehículo para continuar
          </p>
        )}
      </div>
    </div>
  );
}

export function OrderStep() {
  const { state, actions, derived } = usePlanificacion();
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useLocalState(false);

  const selectedCount = state.selectedOrderIds.length;
  const scheduledCount = state.orders.filter(
    (o) => o.timeWindowPresetId,
  ).length;
  const selectedWithoutCoords = derived.selectedOrders.filter(
    (o) => !o.latitude || !o.longitude,
  ).length;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* Header with upload + discard buttons */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Pedidos pendientes
          </h3>
          <div className="flex items-center gap-1.5">
            {state.orders.length > 0 && (
              <Can perm="order:bulk_delete">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-red-500 hover:bg-destructive hover:text-destructive-foreground"
                  disabled={state.isDiscardingPending}
                  onClick={() => setConfirmDiscardOpen(true)}
                  title="Descartar todos los pedidos pendientes"
                >
                  {state.isDiscardingPending ? (
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5 mr-1.5" />
                  )}
                  Descartar
                </Button>
              </Can>
            )}
            <Can perm="order:import">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => actions.setShowCsvUpload(true)}
              >
                <Upload className="size-3.5 mr-1.5" />
                CSV
              </Button>
            </Can>
          </div>
        </div>

        <AlertDialog
          open={confirmDiscardOpen}
          onOpenChange={setConfirmDiscardOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                ¿Descartar {state.orders.length} pedido
                {state.orders.length === 1 ? "" : "s"} pendiente
                {state.orders.length === 1 ? "" : "s"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminarán del borrador todos los pedidos que aún no están en
                un plan confirmado. Los pedidos ya asignados a una ruta no se
                tocan. Podrás volver a importar esos códigos cuando quieras.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => actions.discardPendingOrders()}
              >
                Descartar pendientes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Tabs */}
        <Tabs value={state.orderTab} onValueChange={actions.setOrderTab}>
          <TabsList className="w-full h-8">
            <TabsTrigger value="todas" className="flex-1 text-xs h-7">
              Todas ({state.orders.length})
            </TabsTrigger>
            <TabsTrigger
              value="alertas"
              className={`flex-1 text-xs h-7 ${
                derived.ordersWithIssues.length > 0
                  ? "text-orange-600 dark:text-orange-400"
                  : ""
              }`}
            >
              <AlertTriangle className="size-3 mr-1" />
              Alertas ({derived.ordersWithIssues.length})
            </TabsTrigger>
            <TabsTrigger value="conHorario" className="flex-1 text-xs h-7">
              <Clock className="size-3 mr-1" />
              Horario ({scheduledCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar código, cliente, dirección..."
            value={state.orderSearch}
            onChange={(e) => actions.setOrderSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        {/* Select all */}
        {derived.filteredOrders.length > 0 && (
          <div className="flex items-center justify-between py-1.5 px-2 bg-muted/50 rounded-md">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all-orders"
                checked={derived.filteredOrders.every((o) =>
                  derived.selectedOrderIdsSet.has(o.id),
                )}
                onCheckedChange={actions.selectAllOrders}
              />
              <Label
                htmlFor="select-all-orders"
                className="text-sm cursor-pointer"
              >
                Seleccionar todos
              </Label>
            </div>
            <Badge variant="secondary" className="text-xs">
              {state.selectedOrderIds.length}/{derived.filteredOrders.length}
            </Badge>
          </div>
        )}

        {/* Order list */}
        <div className="space-y-1">
          {state.ordersLoading ? (
            [0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-12 rounded-md border border-border/60 bg-muted/40 animate-pulse"
              />
            ))
          ) : derived.filteredOrders.length === 0 ? (
            state.orders.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Package className="size-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">No hay pedidos pendientes</p>
                <p className="text-xs mt-1 mb-3">
                  Importa tus pedidos desde un archivo CSV o Excel
                </p>
                <Can perm="order:import">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => actions.setShowCsvUpload(true)}
                  >
                    <Upload className="size-3.5 mr-1.5" />
                    Importar CSV
                  </Button>
                </Can>
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <Search className="size-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">Sin resultados</p>
                <p className="text-xs mt-1">
                  Ningún pedido coincide con el filtro actual
                </p>
                {state.orderSearch && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => actions.setOrderSearch("")}
                  >
                    Limpiar búsqueda
                  </Button>
                )}
              </div>
            )
          ) : (
            derived.filteredOrders.map((order) => {
              const hasIssue = !order.latitude || !order.longitude;
              return (
                <label
                  key={order.id}
                  htmlFor={`order-${order.id}`}
                  className={`block p-2 rounded-md border cursor-pointer transition-colors ${
                    derived.selectedOrderIdsSet.has(order.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  } ${hasIssue ? "border-orange-300 bg-orange-50/50 dark:bg-orange-950/20" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`order-${order.id}`}
                      checked={derived.selectedOrderIdsSet.has(order.id)}
                      onCheckedChange={() => actions.toggleOrder(order.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm truncate">
                          {order.trackingId}
                        </span>
                        {hasIssue && (
                          <Badge className="text-[10px] px-1.5 py-0 h-4 shrink-0 bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20">
                            <AlertTriangle className="size-2.5 mr-0.5" />
                            Sin coords
                          </Badge>
                        )}
                        {order.priority === "HIGH" && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                          >
                            Alta
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        {order.customerName && (
                          <span className="truncate">{order.customerName}</span>
                        )}
                        {order.customerName && order.address && <span>·</span>}
                        <span className="truncate">{order.address}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Can perm="order:update">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-7 p-0"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            actions.openEditOrder(order);
                          }}
                          title="Editar coordenadas"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </Can>
                      <Can perm="order:delete">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-7 p-0 text-red-500 hover:bg-destructive hover:text-destructive-foreground"
                          disabled={state.deletingOrderId === order.id}
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            await actions.deleteOrder(order.id);
                          }}
                          title="Eliminar pedido"
                        >
                          {state.deletingOrderId === order.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </Button>
                      </Can>
                    </div>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="border-t">
        {selectedWithoutCoords > 0 && (
          <div className="mx-4 mt-3 p-2.5 rounded-md border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/20 flex items-center gap-2">
            <AlertTriangle className="size-4 text-orange-600 shrink-0" />
            <p className="text-xs text-orange-800 dark:text-orange-400 flex-1">
              {selectedWithoutCoords} visita
              {selectedWithoutCoords === 1 ? "" : "s"} seleccionada
              {selectedWithoutCoords === 1 ? "" : "s"} sin coordenadas
            </p>
            <button
              type="button"
              className="text-xs font-medium text-orange-700 dark:text-orange-400 hover:underline"
              onClick={() => actions.setOrderTab("alertas")}
            >
              Revisar
            </button>
          </div>
        )}
        <div className="p-4 space-y-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={actions.prevStep}
              className="flex-1"
            >
              <ChevronLeft className="size-4 mr-2" />
              Volver
            </Button>
            <Button
              className="flex-1"
              onClick={actions.nextStep}
              disabled={!derived.canProceedFromVisitas}
            >
              {selectedCount > 0 ? `Continuar (${selectedCount})` : "Continuar"}
              <ChevronRight className="size-4 ml-2" />
            </Button>
          </div>
          {!derived.canProceedFromVisitas && !state.ordersLoading && (
            <p className="text-xs text-muted-foreground text-center">
              Selecciona al menos una visita para continuar
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function isOrderInAnyZone(
  order: { latitude: string | null; longitude: string | null },
  zones: Array<{ geometry: { coordinates: number[][][] } }>,
): boolean {
  if (!order.latitude || !order.longitude) return false;
  const lng = parseFloat(order.longitude);
  const lat = parseFloat(order.latitude);
  if (Number.isNaN(lng) || Number.isNaN(lat)) return false;
  return zones.some((zone) =>
    pointInPolygon(lng, lat, zone.geometry.coordinates[0]),
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  onClick,
  title,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="text-left p-2 rounded-md hover:bg-primary/10 transition-colors"
    >
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="font-semibold text-base leading-tight mt-0.5">{value}</p>
    </button>
  );
}

export function ConfigStep() {
  const { state, actions } = usePlanificacion();
  const [showOutsideDetails, setShowOutsideDetails] = useLocalState(false);

  // Calculate orders outside zones (only when zones exist)
  const ordersOutsideZones = useMemo(() => {
    const activeZones = state.zones.filter((z) => z.active);
    if (activeZones.length === 0) return [];

    const selectedOrders = state.orders.filter((o) =>
      state.selectedOrderIds.includes(o.id),
    );
    return selectedOrders.filter(
      (order) => !isOrderInAnyZone(order, activeZones),
    );
  }, [state.zones, state.orders, state.selectedOrderIds]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Plan Name */}
        <div className="space-y-1.5">
          <Label htmlFor="plan-name" className="text-sm font-medium">
            Nombre del plan
          </Label>
          <Input
            id="plan-name"
            placeholder={`Plan ${state.planDate} ${state.planTime}`}
            value={state.planName}
            onChange={(e) => actions.setPlanName(e.target.value)}
          />
        </div>

        {/* Summary */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-3">
            <div className="grid grid-cols-2 gap-1">
              <SummaryTile
                icon={CalendarDays}
                label="Fecha"
                value={formatFullDate(state.planDate)}
                onClick={() => actions.goToStep("vehiculos")}
                title="Cambiar fecha"
              />
              <SummaryTile
                icon={Clock}
                label="Hora inicio"
                value={state.planTime}
                onClick={() => actions.goToStep("vehiculos")}
                title="Cambiar hora de inicio"
              />
              <SummaryTile
                icon={Truck}
                label="Vehículos"
                value={String(state.selectedVehicleIds.length)}
                onClick={() => actions.goToStep("vehiculos")}
                title="Cambiar vehículos"
              />
              <SummaryTile
                icon={Package}
                label="Visitas"
                value={String(state.selectedOrderIds.length)}
                onClick={() => actions.goToStep("visitas")}
                title="Cambiar visitas"
              />
            </div>
          </CardContent>
        </Card>

        {/* Objective */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Objetivo de optimización
            </CardTitle>
            <CardDescription className="text-xs">
              Define qué debe priorizar el algoritmo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {OBJECTIVES.map((opt) => {
              const isSelected = state.objective === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => actions.setObjective(opt.value)}
                  className={`w-full p-3 rounded-lg border text-left transition-colors flex items-center justify-between gap-3 ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/30"
                  }`}
                >
                  <div>
                    <p className="font-medium text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {opt.description}
                    </p>
                  </div>
                  <span
                    className={`size-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      isSelected
                        ? "border-primary"
                        : "border-muted-foreground/40"
                    }`}
                  >
                    {isSelected && (
                      <span className="size-2 rounded-full bg-primary" />
                    )}
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Optimization preset selection */}
        {state.availablePresets.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Preset de optimización
              </CardTitle>
              <CardDescription className="text-xs">
                Aplica una configuración guardada del solver (flags, ventanas
                flexibles, modo fin de ruta…). Gestionalas en{" "}
                <a
                  href="/optimization-presets"
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  /optimization-presets
                </a>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {state.availablePresets.map((preset) => {
                const isSelected = state.optimizationPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => actions.setOptimizationPresetId(preset.id)}
                    className={`w-full p-3 rounded-lg border text-left transition-colors flex items-center justify-between gap-3 ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {preset.name}
                      </p>
                      {preset.isDefault && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                          por defecto
                        </span>
                      )}
                    </div>
                    <span
                      className={`size-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                        isSelected
                          ? "border-primary"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {isSelected && (
                        <span className="size-2 rounded-full bg-primary" />
                      )}
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Service time */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tiempo de servicio</CardTitle>
            <CardDescription className="text-xs">
              Tiempo promedio por entrega
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={60}
                value={state.serviceTime}
                onChange={(e) => actions.setServiceTime(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">minutos</span>
            </div>
            <div className="flex gap-1.5">
              {[5, 10, 15, 20].map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => actions.setServiceTime(minutes)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    state.serviceTime === minutes
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {minutes} min
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Zone Warning */}
      {ordersOutsideZones.length > 0 && (
        <div className="px-4 pb-1">
          <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-orange-600 flex-shrink-0" />
              <p className="text-sm text-orange-800 dark:text-orange-400 flex-1">
                <span className="font-medium">{ordersOutsideZones.length}</span>{" "}
                pedido{ordersOutsideZones.length > 1 ? "s" : ""} fuera de las
                zonas configuradas. No ser
                {ordersOutsideZones.length > 1 ? "án" : "á"} incluido
                {ordersOutsideZones.length > 1 ? "s" : ""} en la optimización.
              </p>
              <button
                type="button"
                onClick={() => setShowOutsideDetails(!showOutsideDetails)}
                className="text-orange-600 hover:text-orange-800 dark:text-orange-400"
              >
                {showOutsideDetails ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </button>
            </div>
            {showOutsideDetails && (
              <ul className="mt-2 space-y-1 text-xs text-orange-700 dark:text-orange-500 pl-6 max-h-32 overflow-y-auto">
                {ordersOutsideZones.map((order) => (
                  <li key={order.id} className="list-disc">
                    {order.trackingId} {"—"} {order.address}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="p-4 border-t space-y-2">
        <Can allOf={["optimization_config:create", "optimization_job:create"]}>
          <Button
            className="w-full"
            size="lg"
            onClick={actions.handleSubmit}
            disabled={state.isSubmitting}
          >
            {state.isSubmitting ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Optimizando...
              </>
            ) : (
              <>
                <Route className="size-4 mr-2" />
                Optimizar rutas
              </>
            )}
          </Button>
        </Can>
        <Button variant="outline" onClick={actions.prevStep} className="w-full">
          <ChevronLeft className="size-4 mr-2" />
          Volver
        </Button>
      </div>
    </div>
  );
}
