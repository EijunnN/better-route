"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Eye,
  EyeOff,
  History,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Ruler,
  Scale,
  TrendingUp,
  Truck,
  User,
  X,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { exportPlanToExcel } from "@/lib/export/export-plan-excel";
import { DriverAssignmentDisplay } from "./driver-assignment-quality";
import { PencilSelectOverlay } from "./pencil-select-overlay";
import { PlanConfirmationDialog } from "./plan-confirmation-dialog";
import { RouteMap, ROUTE_COLORS } from "./route-map";
import {
  useOptimizationDashboard,
  formatDistance,
  formatDuration,
  type RouteData,
} from "./optimization-dashboard-context";

// KPI Badge Component
export function KpiBadge({
  icon: Icon,
  label,
  value,
  status = "neutral",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  status?: "success" | "warning" | "error" | "neutral";
}) {
  const statusColors = {
    success: "bg-green-500/10 text-green-700 border-green-500/20",
    warning: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
    error: "bg-red-500/10 text-red-700 border-red-500/20",
    neutral: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm",
        statusColors[status],
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="font-medium">{value}</span>
      <span className="text-xs opacity-70 hidden sm:inline">{label}</span>
    </div>
  );
}

// Compact Route Card
export function CompactRouteCard({
  route,
  routeNumber,
  routeColor,
}: {
  route: RouteData;
  routeNumber: number;
  routeColor: string;
}) {
  const { state, actions } = useOptimizationDashboard();
  const { selectedRouteId, expandedRouteId } = state;
  const {
    setSelectedRouteId,
    setExpandedRouteId,
    toggleOrderSelection,
    isOrderSelected,
  } = actions;

  const isSelected = selectedRouteId === route.routeId;
  const isExpanded = expandedRouteId === route.routeId;
  const hasViolations = route.timeWindowViolations > 0;
  const utilizationColor =
    route.utilizationPercentage >= 80
      ? "text-green-600"
      : route.utilizationPercentage >= 50
        ? "text-yellow-600"
        : "text-red-600";

  const handleSelect = () => setSelectedRouteId(route.routeId);
  const handleToggle = () =>
    setExpandedRouteId(isExpanded ? null : route.routeId);

  return (
    <div
      className={cn(
        "border rounded-lg transition-shadow overflow-hidden",
        isSelected && "ring-2",
        hasViolations && "border-orange-300",
      )}
      style={{
        borderLeftWidth: "4px",
        borderLeftColor: routeColor,
        ...(isSelected
          ? ({ "--tw-ring-color": routeColor } as React.CSSProperties)
          : {}),
      }}
    >
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/50"
        onClick={handleSelect}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: routeColor }}
        >
          <Truck className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm" style={{ color: routeColor }}>
              {route.vehiclePlate}
            </span>
            {route.driverName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />
                {route.driverName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span>{route.stops.length} paradas</span>
            <span>{formatDistance(route.totalDistance)}</span>
            <span className={utilizationColor}>
              {route.utilizationPercentage}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasViolations && (
            <Badge
              variant="outline"
              className="border-orange-300 text-orange-700 text-xs"
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              {route.timeWindowViolations}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
            aria-label={isExpanded ? "Colapsar ruta" : "Expandir ruta"}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t p-2 space-y-2">
          {/* Compact Route Metrics */}
          <div className="flex items-center gap-3 text-xs px-1">
            <div className="flex items-center gap-1">
              <Ruler className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">
                {formatDistance(route.totalDistance)}
              </span>
            </div>
            <div
              className="flex items-center gap-1"
              title="Tiempo total (viaje + servicio)"
            >
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">
                {formatDuration(route.totalDuration)}
              </span>
              {route.totalTravelTime !== undefined &&
                route.totalServiceTime !== undefined && (
                  <span className="text-muted-foreground">
                    ({formatDuration(route.totalTravelTime)} viaje +{" "}
                    {formatDuration(route.totalServiceTime)} servicio)
                  </span>
                )}
            </div>
            {route.totalWeight > 0 && (
              <div className="flex items-center gap-1">
                <Scale className="h-3 w-3 text-muted-foreground" />
                <span>{route.totalWeight}kg</span>
              </div>
            )}
            {route.totalVolume > 0 && (
              <div className="flex items-center gap-1">
                <Package className="h-3 w-3 text-muted-foreground" />
                <span>{route.totalVolume}L</span>
              </div>
            )}
          </div>

          {/* Driver Assignment - only show if has warnings/errors */}
          {route.assignmentQuality &&
            (route.assignmentQuality.warnings.length > 0 ||
              route.assignmentQuality.errors.length > 0) && (
              <DriverAssignmentDisplay route={route} />
            )}

          {/* Compact Stops List */}
          <div className="border rounded max-h-32 overflow-y-auto">
            <div className="divide-y divide-border/50">
              {route.stops.map((stop) => {
                const isGrouped =
                  stop.groupedTrackingIds && stop.groupedTrackingIds.length > 1;

                if (isGrouped) {
                  return stop.groupedTrackingIds!.map((trackingId, subIndex) => {
                    const orderId =
                      stop.groupedOrderIds?.[subIndex] || stop.orderId;
                    const selected = isOrderSelected(orderId);
                    return (
                      <div
                        key={`${stop.orderId}-${subIndex}`}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 text-xs group cursor-pointer transition-colors",
                          selected ? "bg-primary/10" : "hover:bg-accent/50",
                        )}
                        onClick={() =>
                          toggleOrderSelection(
                            orderId,
                            trackingId,
                            stop.address,
                            route.vehicleId,
                            route.vehiclePlate,
                            route.routeId,
                          )
                        }
                      >
                        <div
                          className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                            selected
                              ? "bg-primary border-primary"
                              : "border-muted-foreground/30",
                          )}
                        >
                          {selected && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <span className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0">
                          R{routeNumber}-{stop.sequence}.{subIndex + 1}
                        </span>
                        <span className="font-medium shrink-0">
                          {trackingId}
                        </span>
                        <span className="text-muted-foreground truncate flex-1">
                          {stop.address}
                        </span>
                        {stop.timeWindow && subIndex === 0 && (
                          <span className="text-muted-foreground text-[10px] shrink-0">
                            {new Date(stop.timeWindow.start).toLocaleTimeString(
                              [],
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                        )}
                      </div>
                    );
                  });
                }

                const selected = isOrderSelected(stop.orderId);
                return (
                  <div
                    key={stop.orderId}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 text-xs group cursor-pointer transition-colors",
                      selected ? "bg-primary/10" : "hover:bg-accent/50",
                    )}
                    onClick={() =>
                      toggleOrderSelection(
                        stop.orderId,
                        stop.trackingId,
                        stop.address,
                        route.vehicleId,
                        route.vehiclePlate,
                        route.routeId,
                      )
                    }
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                        selected
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {selected && (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      )}
                    </div>
                    <span className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0">
                      R{routeNumber}-{stop.sequence}
                    </span>
                    <span className="font-medium shrink-0">
                      {stop.trackingId}
                    </span>
                    <span className="text-muted-foreground truncate flex-1">
                      {stop.address}
                    </span>
                    {stop.timeWindow && (
                      <span className="text-muted-foreground text-[10px] shrink-0">
                        {new Date(stop.timeWindow.start).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Unassigned Orders Panel
export function UnassignedOrdersPanel() {
  const { state, actions, meta } = useOptimizationDashboard();
  const { unassignedExpanded } = state;
  const { setUnassignedExpanded, toggleOrderSelection, isOrderSelected } =
    actions;
  const { result } = meta;

  const orders = result.unassignedOrders;
  if (orders.length === 0) return null;

  return (
    <div className="border border-orange-200 dark:border-orange-800/50 rounded-lg bg-orange-50/50 dark:bg-orange-950/20 overflow-hidden">
      <button
        onClick={() => setUnassignedExpanded(!unassignedExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-orange-100/50 dark:hover:bg-orange-900/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <span className="text-sm font-medium text-orange-800 dark:text-orange-300">
            {orders.length} sin asignar
          </span>
        </div>
        {unassignedExpanded ? (
          <ChevronUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        )}
      </button>

      {unassignedExpanded && (
        <div className="px-3 pb-2 max-h-40 overflow-y-auto border-t border-orange-200/50 dark:border-orange-800/30">
          <div className="space-y-1 pt-2">
            {orders.map((order) => {
              const selected = isOrderSelected(order.orderId);
              return (
                <div
                  key={order.orderId}
                  className={cn(
                    "flex items-center gap-2 text-xs py-1.5 px-2 -mx-2 rounded cursor-pointer transition-colors",
                    selected
                      ? "bg-primary/10"
                      : "hover:bg-orange-100/50 dark:hover:bg-orange-900/30",
                  )}
                  onClick={() =>
                    toggleOrderSelection(
                      order.orderId,
                      order.trackingId,
                      order.address || "Sin direccion",
                      null,
                      null,
                      null,
                    )
                  }
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                      selected
                        ? "bg-primary border-primary"
                        : "border-orange-400/50",
                    )}
                  >
                    {selected && (
                      <Check className="h-3 w-3 text-primary-foreground" />
                    )}
                  </div>
                  <span className="font-medium text-orange-900 dark:text-orange-200">
                    {order.trackingId}
                  </span>
                  <span className="text-orange-700/70 dark:text-orange-400/70 truncate flex-1">
                    {order.reason}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Dashboard Header
export function DashboardHeader() {
  const { state, actions, meta, derived } = useOptimizationDashboard();
  const { setConfirmDialogOpen } = actions;
  const { result, isPartial, onReoptimize, onConfirm, onBack, jobId } = meta;
  const { companyId } = derived;

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <div className="h-6 w-px bg-border" />
        <h1 className="text-lg font-semibold">Resultados</h1>
        {isPartial && (
          <Badge variant="outline" className="text-orange-600 border-orange-600">
            Parcial
          </Badge>
        )}
        {result.summary?.engineUsed && (
          <Badge variant="secondary" className={result.summary.engineUsed === "PYVRP" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"}>
            {result.summary.engineUsed === "PYVRP" ? "Avanzada (PyVRP)" : "Rápida (VROOM)"}
          </Badge>
        )}
      </div>

      {/* KPI Strip (Desktop) */}
      <div className="hidden md:flex items-center gap-2">
        <KpiBadge icon={Truck} label="rutas" value={result.metrics.totalRoutes} />
        <KpiBadge icon={MapPin} label="paradas" value={result.metrics.totalStops} />
        <KpiBadge
          icon={Ruler}
          label=""
          value={`${(result.metrics.totalDistance / 1000).toFixed(0)}km`}
        />
        <KpiBadge
          icon={TrendingUp}
          label="utiliz."
          value={`${result.metrics.utilizationRate}%`}
          status={
            result.metrics.utilizationRate >= 80
              ? "success"
              : result.metrics.utilizationRate >= 50
                ? "warning"
                : "error"
          }
        />
        <KpiBadge
          icon={CheckCircle2}
          label="cumpl."
          value={`${result.metrics.timeWindowComplianceRate}%`}
          status={
            result.metrics.timeWindowComplianceRate >= 95
              ? "success"
              : result.metrics.timeWindowComplianceRate >= 80
                ? "warning"
                : "error"
          }
        />
        {result.metrics.balanceScore !== undefined && (
          <KpiBadge
            icon={BarChart3}
            label="balance"
            value={`${result.metrics.balanceScore}%`}
            status={
              result.metrics.balanceScore >= 80
                ? "success"
                : result.metrics.balanceScore >= 60
                  ? "warning"
                  : "error"
            }
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Link href="/planificacion/historial">
          <Button variant="ghost" size="sm">
            <History className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Historial</span>
          </Button>
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportPlanToExcel({
              routes: result.routes,
              metrics: result.metrics,
              summary: result.summary,
            })
          }
        >
          <Download className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Exportar</span>
        </Button>
        {onReoptimize && (
          <Button variant="outline" size="sm" onClick={onReoptimize}>
            <RefreshCw className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Reoptimizar</span>
          </Button>
        )}
        {onConfirm && jobId && (
          <Button size="sm" onClick={() => setConfirmDialogOpen(true)}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Confirmar
          </Button>
        )}
      </div>
    </div>
  );
}

// Mobile KPI Strip
export function DashboardMobileKpiStrip() {
  const { meta } = useOptimizationDashboard();
  const { result } = meta;

  return (
    <div className="flex md:hidden items-center gap-2 px-4 py-2 border-b bg-muted/30 overflow-x-auto">
      <KpiBadge icon={Truck} label="" value={result.metrics.totalRoutes} />
      <KpiBadge icon={MapPin} label="" value={result.metrics.totalStops} />
      <KpiBadge
        icon={Ruler}
        label=""
        value={`${(result.metrics.totalDistance / 1000).toFixed(0)}km`}
      />
      <KpiBadge
        icon={TrendingUp}
        label=""
        value={`${result.metrics.utilizationRate}%`}
        status={
          result.metrics.utilizationRate >= 80
            ? "success"
            : result.metrics.utilizationRate >= 50
              ? "warning"
              : "error"
        }
      />
    </div>
  );
}

// Routes Panel
export function DashboardRoutesPanel() {
  const { state, actions, meta } = useOptimizationDashboard();
  const { selectedOrdersForReassign } = state;
  const { clearSelection, openReassignModal } = actions;
  const { result } = meta;

  return (
    <div className="w-96 lg:w-[450px] xl:w-[500px] border-r flex flex-col shrink-0">
      <div className="px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{result.routes.length} Rutas</span>
          <span className="text-xs text-muted-foreground">
            {formatDuration(result.metrics.totalDuration)} total
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {result.routes.map((route, index) => (
          <CompactRouteCard
            key={route.routeId}
            route={route}
            routeNumber={index + 1}
            routeColor={ROUTE_COLORS[index % ROUTE_COLORS.length]}
          />
        ))}
      </div>

      {/* Unassigned Orders */}
      {result.unassignedOrders.length > 0 && (
        <div className="p-3 border-t shrink-0">
          <UnassignedOrdersPanel />
        </div>
      )}

      {/* Selection Action Bar */}
      {selectedOrdersForReassign.length > 0 && (
        <div className="p-3 border-t bg-primary/5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {selectedOrdersForReassign.length} seleccionados
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="h-7 px-2"
              >
                <X className="h-3 w-3 mr-1" />
                Limpiar
              </Button>
            </div>
            <Button size="sm" onClick={openReassignModal}>
              <ArrowRight className="h-4 w-4 mr-2" />
              Reasignar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Map Panel
export function DashboardMapPanel() {
  const { state, actions, meta, derived } = useOptimizationDashboard();
  const {
    selectedRouteId,
    showZones,
    zones,
    pencilMode,
    mapInstance,
    selectedOrdersForReassign,
  } = state;
  const {
    setSelectedRouteId,
    setShowZones,
    setPencilMode,
    setMapInstance,
    handlePencilSelectionComplete,
  } = actions;
  const { result } = meta;
  const { allSelectableOrders } = derived;

  return (
    <div className="flex-1 relative">
      <RouteMap
        routes={result.routes}
        depot={result.depot}
        unassignedOrders={result.unassignedOrders}
        vehiclesWithoutRoutes={result.vehiclesWithoutRoutes}
        zones={showZones ? zones : []}
        selectedRouteId={selectedRouteId}
        onRouteSelect={(routeId) => setSelectedRouteId(routeId)}
        variant="fullscreen"
        onMapReady={setMapInstance}
        highlightedOrderIds={selectedOrdersForReassign.map((o) => o.orderId)}
      />

      {/* Pencil Select Overlay */}
      <PencilSelectOverlay
        map={mapInstance}
        isActive={pencilMode}
        onToggle={() => setPencilMode(!pencilMode)}
        onSelectionComplete={handlePencilSelectionComplete}
        allOrders={allSelectableOrders}
      />

      {/* Zone Toggle Button */}
      {zones.length > 0 && (
        <div className="absolute top-4 right-14 z-10">
          <button
            type="button"
            onClick={() => setShowZones(!showZones)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-sm font-medium transition-colors ${
              showZones
                ? "bg-primary text-primary-foreground"
                : "bg-background/95 backdrop-blur text-muted-foreground hover:text-foreground"
            }`}
          >
            {showZones ? (
              <Eye className="w-4 h-4" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
            Zonas ({zones.length})
          </button>
        </div>
      )}

      {/* Optimization Summary Overlay */}
      <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-72">
        <Card className="bg-background/95 backdrop-blur shadow-lg">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>Optimizado: {result.summary.objective}</span>
              <span>{(result.summary.processingTimeMs / 1000).toFixed(1)}s</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(result.summary.optimizedAt).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Reassignment Dialog
export function ReassignmentDialog() {
  const { state, actions, derived } = useOptimizationDashboard();
  const {
    showReassignModal,
    selectedOrdersForReassign,
    selectedVehicleForReassign,
    isReassigning,
    reassignmentError,
  } = state;
  const { setSelectedVehicleForReassign, handleReassignment } = actions;
  const { availableVehicles } = derived;

  const closeModal = () => {
    // This is handled by the parent via onOpenChange
  };

  return (
    <Dialog
      open={showReassignModal}
      onOpenChange={(open) => {
        if (!open) {
          // Clear selection when closing
        }
      }}
    >
      <DialogContent className="max-w-[500px] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            Reasignar{" "}
            {selectedOrdersForReassign.length === 1
              ? "Pedido"
              : `${selectedOrdersForReassign.length} Pedidos`}
          </DialogTitle>
          <DialogDescription>
            Selecciona el vehiculo destino para{" "}
            {selectedOrdersForReassign.length === 1
              ? "este pedido"
              : "estos pedidos"}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-hidden">
          {/* Selected orders list */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">
              Pedidos seleccionados:
            </label>
            <div className="max-h-24 overflow-y-auto border rounded-lg p-2 space-y-1">
              {selectedOrdersForReassign.map((order) => (
                <div key={order.orderId} className="flex items-center gap-2 text-xs">
                  <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-medium">{order.trackingId}</span>
                  {order.vehiclePlate && (
                    <span className="text-muted-foreground">
                      (desde {order.vehiclePlate})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Vehicle selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Reasignar a:</label>
            <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2">
              {availableVehicles.map((vehicle) => (
                <button
                  key={vehicle.id}
                  type="button"
                  onClick={() => setSelectedVehicleForReassign(vehicle.id)}
                  className={cn(
                    "w-full flex items-center justify-between p-2 rounded text-left text-sm transition-colors",
                    selectedVehicleForReassign === vehicle.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Truck className="h-4 w-4 shrink-0" />
                    <span className="font-medium truncate">{vehicle.plate}</span>
                    {vehicle.driverName && (
                      <span className="text-xs opacity-70 truncate">
                        ({vehicle.driverName})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0 ml-2">
                    {vehicle.hasRoute ? (
                      <span className="opacity-70">{vehicle.stopCount} paradas</span>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Sin ruta
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Error message */}
          {reassignmentError && (
            <div className="p-2 bg-destructive/10 border border-destructive/30 rounded text-sm text-destructive">
              {reassignmentError}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={isReassigning}>
            Cancelar
          </Button>
          <Button
            onClick={handleReassignment}
            disabled={!selectedVehicleForReassign || isReassigning}
          >
            {isReassigning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Reasignando...
              </>
            ) : (
              <>
                <ArrowRight className="h-4 w-4 mr-2" />
                Reasignar{" "}
                {selectedOrdersForReassign.length > 1
                  ? `(${selectedOrdersForReassign.length})`
                  : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Confirmation Dialog
export function ConfirmationDialog() {
  const { state, actions, meta, derived } = useOptimizationDashboard();
  const { confirmDialogOpen } = state;
  const { setConfirmDialogOpen } = actions;
  const { jobId, onConfirm } = meta;
  const { companyId } = derived;

  if (!jobId || !companyId) return null;

  return (
    <PlanConfirmationDialog
      open={confirmDialogOpen}
      onOpenChange={setConfirmDialogOpen}
      jobId={jobId}
      companyId={companyId}
      onConfirmed={() => {
        setConfirmDialogOpen(false);
        if (onConfirm) {
          onConfirm();
        }
      }}
    />
  );
}
