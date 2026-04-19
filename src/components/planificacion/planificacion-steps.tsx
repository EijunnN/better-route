"use client";

import { useMemo, useState as useLocalState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Route,
  Search,
  Settings2,
  Trash2,
  Truck,
  Upload,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/auth/can";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlanificacion } from "./planificacion-context";
import { OBJECTIVES, type StepId } from "./planificacion-types";

const STEPS: Array<{ id: StepId; label: string; icon: React.ElementType }> = [
  { id: "vehiculos", label: "Vehículos", icon: Truck },
  { id: "visitas", label: "Visitas", icon: Package },
  { id: "configuracion", label: "Configuración", icon: Settings2 },
];

export function PlanificacionHeader() {
  const { state, actions } = usePlanificacion();

  return (
    <div className="border-b bg-background px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planificación de Rutas</h1>
          <p className="text-sm text-muted-foreground">
            Optimiza las rutas de entrega para tu flota
          </p>
        </div>

        <div className="flex items-center gap-2">
          {STEPS.map((step, index) => {
            const isActive = step.id === state.currentStep;
            const isCompleted = state.completedSteps.has(step.id);
            const StepIcon = step.icon;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => actions.goToStep(step.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md"
                    : isCompleted
                      ? "bg-primary/10 text-primary hover:bg-primary/20"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <div className="flex items-center gap-2">
                  {isCompleted && !isActive ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <StepIcon className="w-4 h-4" />
                  )}
                  <span className="font-medium">{step.label}</span>
                </div>
                {index < STEPS.length - 1 && (
                  <ChevronRight className="w-4 h-4 ml-2 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function VehicleStep() {
  const { state, actions, derived } = usePlanificacion();

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Date/Time selector */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="plan-date" className="text-xs text-muted-foreground">
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
            <Label htmlFor="plan-time" className="text-xs text-muted-foreground">
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
          <Select value={state.fleetFilter} onValueChange={actions.setFleetFilter}>
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
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
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
                  derived.selectedVehicleIdsSet.has(v.id)
                )}
                onCheckedChange={actions.selectAllVehicles}
              />
              <Label htmlFor="select-all-vehicles" className="text-sm cursor-pointer">
                Seleccionar todos
              </Label>
            </div>
            <Badge variant="secondary" className="text-xs">
              {state.selectedVehicleIds.length}/{derived.filteredVehicles.length}
            </Badge>
          </div>
        )}

        {/* Vehicle list */}
        <div className="space-y-1.5">
          {state.vehiclesLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : derived.filteredVehicles.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Truck className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay vehículos disponibles</p>
            </div>
          ) : (
            derived.filteredVehicles.map((vehicle) => {
              const hasActivePlan = (vehicle.activeStopsCount ?? 0) > 0;
              return (
              <label
                key={vehicle.id}
                htmlFor={`vehicle-${vehicle.id}`}
                className={`block p-2 rounded-md border transition-colors ${
                  hasActivePlan
                    ? "border-orange-300 bg-orange-50/50 dark:bg-orange-950/10 cursor-not-allowed opacity-70"
                    : derived.selectedVehicleIdsSet.has(vehicle.id)
                      ? "border-primary bg-primary/5 cursor-pointer"
                      : "border-border hover:border-primary/50 hover:bg-muted/50 cursor-pointer"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`vehicle-${vehicle.id}`}
                    checked={derived.selectedVehicleIdsSet.has(vehicle.id)}
                    onCheckedChange={() => !hasActivePlan && actions.toggleVehicle(vehicle.id)}
                    disabled={hasActivePlan}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {vehicle.plate || vehicle.name}
                      </span>
                      {hasActivePlan && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20">
                          En ruta ({vehicle.activeStopsCount} paradas)
                        </Badge>
                      )}
                      {vehicle.type && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {vehicle.type}
                        </Badge>
                      )}
                      {vehicle.assignedDriver && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {vehicle.assignedDriver.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                      {state.companyProfile?.enableWeight && vehicle.weightCapacity && <span>{vehicle.weightCapacity}kg</span>}
                      {state.companyProfile?.enableVolume && vehicle.volumeCapacity && <span>{vehicle.volumeCapacity}L</span>}
                      {state.companyProfile?.enableUnits && vehicle.maxUnitsCapacity && <span>{vehicle.maxUnitsCapacity} uds</span>}
                      {state.companyProfile?.enableOrderValue && vehicle.maxValueCapacity && <span>S/{vehicle.maxValueCapacity}</span>}
                      {vehicle.maxOrders && <span>Max {vehicle.maxOrders} ped.</span>}
                      {vehicle.originAddress && (
                        <span className="truncate flex items-center gap-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {vehicle.originAddress}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </label>
              );
            })
          )}
        </div>
      </div>

      {/* Next button */}
      <div className="p-4 border-t bg-background">
        <Button
          className="w-full"
          onClick={actions.nextStep}
          disabled={!derived.canProceedFromVehiculos}
        >
          Continuar a Visitas
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

export function OrderStep() {
  const { state, actions, derived } = usePlanificacion();

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* Header with upload button */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">Pedidos pendientes</h3>
          <Can perm="order:import">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => actions.setShowCsvUpload(true)}
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              CSV
            </Button>
          </Can>
        </div>

        {/* Tabs */}
        <Tabs value={state.orderTab} onValueChange={actions.setOrderTab}>
          <TabsList className="w-full h-8">
            <TabsTrigger value="todas" className="flex-1 text-xs h-7">
              Todas ({state.orders.length})
            </TabsTrigger>
            <TabsTrigger value="alertas" className="flex-1 text-xs h-7">
              <AlertTriangle className="w-3 h-3 mr-1" />({derived.ordersWithIssues.length})
            </TabsTrigger>
            <TabsTrigger value="conHorario" className="flex-1 text-xs h-7">
              <Clock className="w-3 h-3 mr-1" />
              Horario
            </TabsTrigger>
          </TabsList>
          <TabsContent value="todas" className="mt-0" />
          <TabsContent value="alertas" className="mt-0" />
          <TabsContent value="conHorario" className="mt-0" />
        </Tabs>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
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
                  derived.selectedOrderIdsSet.has(o.id)
                )}
                onCheckedChange={actions.selectAllOrders}
              />
              <Label htmlFor="select-all-orders" className="text-sm cursor-pointer">
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
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : derived.filteredOrders.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay pedidos pendientes</p>
            </div>
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
                        <span className="font-medium text-sm truncate">{order.trackingId}</span>
                        {hasIssue && (
                          <AlertTriangle className="w-3 h-3 text-orange-500 shrink-0" />
                        )}
                        {order.priority === "HIGH" && (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                            !
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
                    <div className="flex items-center gap-1 shrink-0">
                      <Can perm="order:update">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            actions.openEditOrder(order);
                          }}
                          title="Editar coordenadas"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      </Can>
                      <Can perm="order:delete">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-500 hover:bg-destructive hover:text-destructive-foreground"
                          disabled={state.deletingOrderId === order.id}
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            await actions.deleteOrder(order.id);
                          }}
                          title="Eliminar pedido"
                        >
                          {state.deletingOrderId === order.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
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
      <div className="p-4 border-t bg-background flex gap-2">
        <Button variant="outline" onClick={actions.prevStep} className="flex-1">
          Volver
        </Button>
        <Button
          className="flex-1"
          onClick={actions.nextStep}
          disabled={!derived.canProceedFromVisitas}
        >
          Continuar
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// Ray-casting point-in-polygon check
function pointInPolygon(lng: number, lat: number, polygon: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function isOrderInAnyZone(
  order: { latitude: string | null; longitude: string | null },
  zones: Array<{ geometry: { coordinates: number[][][] } }>,
): boolean {
  if (!order.latitude || !order.longitude) return false;
  const lng = parseFloat(order.longitude);
  const lat = parseFloat(order.latitude);
  if (isNaN(lng) || isNaN(lat)) return false;
  return zones.some((zone) => pointInPolygon(lng, lat, zone.geometry.coordinates[0]));
}

export function ConfigStep() {
  const { state, actions } = usePlanificacion();
  const [showOutsideDetails, setShowOutsideDetails] = useLocalState(false);

  // Calculate orders outside zones (only when zones exist)
  const ordersOutsideZones = useMemo(() => {
    const activeZones = state.zones.filter((z) => z.active);
    if (activeZones.length === 0) return [];

    const selectedOrders = state.orders.filter((o) => state.selectedOrderIds.includes(o.id));
    return selectedOrders.filter((order) => !isOrderInAnyZone(order, activeZones));
  }, [state.zones, state.orders, state.selectedOrderIds]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Plan Name */}
        <div className="space-y-1.5">
          <Label htmlFor="plan-name" className="text-sm font-medium">Nombre del plan</Label>
          <Input
            id="plan-name"
            placeholder={`Plan ${state.planDate} ${state.planTime}`}
            value={state.planName}
            onChange={(e) => actions.setPlanName(e.target.value)}
          />
        </div>

        {/* Summary */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Vehículos</p>
                <p className="font-semibold text-lg">{state.selectedVehicleIds.length}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Visitas</p>
                <p className="font-semibold text-lg">{state.selectedOrderIds.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Objective */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Objetivo de optimización</CardTitle>
            <CardDescription className="text-xs">
              Define qué debe priorizar el algoritmo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {OBJECTIVES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => actions.setObjective(opt.value)}
                className={`w-full p-3 rounded-lg border text-left transition-colors ${
                  state.objective === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <p className="font-medium text-sm">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Service time */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tiempo de servicio</CardTitle>
            <CardDescription className="text-xs">Tiempo promedio por entrega</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* Capacity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Restricciones de capacidad</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Checkbox
                id="capacity-enabled"
                checked={state.capacityEnabled}
                onCheckedChange={(checked) => actions.setCapacityEnabled(!!checked)}
              />
              <Label htmlFor="capacity-enabled" className="cursor-pointer">
                <span className="text-sm">Respetar capacidad de vehículos</span>
                <p className="text-xs text-muted-foreground">
                  Considera{" "}
                  {[
                    state.companyProfile?.enableWeight && "peso",
                    state.companyProfile?.enableVolume && "volumen",
                    state.companyProfile?.enableUnits && "unidades",
                    state.companyProfile?.enableOrderValue && "valorizado",
                  ]
                    .filter(Boolean)
                    .join(", ") || "capacidad máxima"}
                  {" "}de los vehículos
                </p>
              </Label>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Zone Warning */}
      {ordersOutsideZones.length > 0 && (
        <div className="px-4">
          <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600 flex-shrink-0" />
              <p className="text-sm text-orange-800 dark:text-orange-400 flex-1">
                <span className="font-medium">{ordersOutsideZones.length}</span> pedido{ordersOutsideZones.length > 1 ? "s" : ""} fuera de las zonas configuradas.
                No ser{ordersOutsideZones.length > 1 ? "án" : "á"} incluido{ordersOutsideZones.length > 1 ? "s" : ""} en la optimización.
              </p>
              <button
                type="button"
                onClick={() => setShowOutsideDetails(!showOutsideDetails)}
                className="text-orange-600 hover:text-orange-800 dark:text-orange-400"
              >
                {showOutsideDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
            {showOutsideDetails && (
              <ul className="mt-2 space-y-1 text-xs text-orange-700 dark:text-orange-500 pl-6 max-h-32 overflow-y-auto">
                {ordersOutsideZones.map((order) => (
                  <li key={order.id} className="list-disc">
                    {order.trackingId} — {order.address}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="p-4 border-t bg-background space-y-2">
        <Can perm="plan:create">
          <Button
            className="w-full"
            size="lg"
            onClick={actions.handleSubmit}
            disabled={state.isSubmitting}
          >
            {state.isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Optimizando...
              </>
            ) : (
              <>
                <Route className="w-4 h-4 mr-2" />
                Optimizar rutas
              </>
            )}
          </Button>
        </Can>
        <Button variant="outline" onClick={actions.prevStep} className="w-full">
          Volver
        </Button>
      </div>
    </div>
  );
}
