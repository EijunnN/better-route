"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Package,
  Ruler,
  Scale,
  TrendingUp,
  Truck,
  User,
} from "lucide-react";
import { useState } from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AssignmentMetricsCard,
  DriverAssignmentDisplay,
} from "./driver-assignment-quality";
import { KpiCard, KpiGrid } from "./kpi-card";
import { ManualDriverAssignmentDialog } from "./manual-driver-assignment-dialog";
import { PlanConfirmationDialog } from "./plan-confirmation-dialog";
import { RouteMap } from "./route-map";

/** Format a time window value that may be HH:mm, HH:mm:ss, or an ISO date string */
function formatTimeWindow(value: string): string {
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) return value.slice(0, 5);
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

import type { VerifiedPlan } from "@/lib/optimization/solved-plan";

// Re-export the canonical shape so callers that imported the legacy
// OptimizationResult/Route/Stop names from this module still resolve.
export type {
  AssignedSolvedRoute,
  SolvedStop,
  VerifiedPlan,
} from "@/lib/optimization/solved-plan";

interface OptimizationResultsProps {
  jobId?: string;
  result: VerifiedPlan;
  onReoptimize?: () => void;
  onConfirm?: () => void;
  onReassignDriver?: (routeId: string, vehicleId: string) => void;
  isPlanConfirmed?: boolean;
}

// Scroll area component
const ScrollArea = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => (
  <div className={className} style={{ overflowY: "auto", maxHeight: "400px" }}>
    {children}
  </div>
);

// Metric card component
function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  color = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  unit?: string;
  color?: "default" | "success" | "warning" | "danger";
}) {
  const colorClasses = {
    default: "text-muted-foreground",
    success: "text-green-600",
    warning: "text-yellow-600",
    danger: "text-red-600",
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
      <Icon className={`size-5 ${colorClasses[color]}`} />
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">
          {value}
          {unit && (
            <span className="text-sm font-normal text-muted-foreground ml-1">
              {unit}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// Route card component
function RouteCard({
  route,
  isSelected,
  onToggle,
  onReassignDriver,
}: {
  route: OptimizationResultsProps["result"]["routes"][number];
  isSelected: boolean;
  onToggle: () => void;
  onReassignDriver?: (routeId: string, vehicleId: string) => void;
}) {
  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const hasViolations = route.timeWindowViolations > 0;
  const utilizationColor =
    route.utilizationPercentage >= 80
      ? "text-green-600"
      : route.utilizationPercentage >= 50
        ? "text-yellow-600"
        : "text-red-600";

  return (
    <Card
      className={`overflow-hidden ${hasViolations ? "border-orange-300" : ""}`}
    >
      <CardHeader
        className="cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Truck className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{route.vehicleIdentifier}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                {route.driverName && (
                  <>
                    <User className="size-3" />
                    {route.driverName}
                  </>
                )}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasViolations && (
              <Badge
                variant="outline"
                className="border-orange-300 text-orange-700"
              >
                <AlertTriangle className="size-3 mr-1" />
                {route.timeWindowViolations} violation
                {route.timeWindowViolations > 1 ? "s" : ""}
              </Badge>
            )}
            {isSelected ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {isSelected && (
        <CardContent className="border-t">
          {/* Route Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="size-4 text-muted-foreground" />
              <span className="font-medium">{route.stops.length}</span>
              <span className="text-muted-foreground">stops</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Ruler className="size-4 text-muted-foreground" />
              <span className="font-medium">
                {formatDistance(route.totalDistance)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="size-4 text-muted-foreground" />
              <span className="font-medium">
                {formatDuration(route.totalDuration)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className={`size-4 ${utilizationColor}`} />
              <span className={`font-medium ${utilizationColor}`}>
                {route.utilizationPercentage}%
              </span>
              <span className="text-muted-foreground">utilization</span>
            </div>
          </div>

          {/* Capacity Info */}
          {(() => {
            const w = route.capacityUsed?.WEIGHT ?? 0;
            const v = route.capacityUsed?.VOLUME ?? 0;
            if (w === 0 && v === 0) return null;
            return (
              <div className="flex gap-4 mb-4 text-xs text-muted-foreground">
                {w > 0 && (
                  <div className="flex items-center gap-1">
                    <Scale className="size-3" />
                    {w}kg
                  </div>
                )}
                {v > 0 && (
                  <div className="flex items-center gap-1">
                    <Package className="size-3" />
                    {v}L
                  </div>
                )}
              </div>
            );
          })()}

          {/* Driver Assignment Quality */}
          <div className="mb-4">
            <DriverAssignmentDisplay
              route={route}
              onReassignDriver={onReassignDriver}
            />
          </div>

          {/* Stops List */}
          <ScrollArea className="border rounded-lg">
            <div className="p-2 space-y-2">
              {route.stops.map((stop, index) => (
                <div
                  key={stop.orderId}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
                  style={{
                    contentVisibility: "auto",
                    containIntrinsicSize: "0 60px",
                  }}
                >
                  <div className="flex flex-col items-center">
                    <div className="size-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                      {stop.sequence}
                    </div>
                    {index < route.stops.length - 1 && (
                      <div className="w-0.5 flex-1 bg-border my-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">
                        {stop.trackingId}
                      </span>
                      {stop.timeWindow && (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="size-2 mr-1" />
                          {formatTimeWindow(stop.timeWindow.start)}
                          {" - "}
                          {formatTimeWindow(stop.timeWindow.end)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {stop.address}
                    </p>
                    {stop.estimatedArrival && (
                      <p className="text-xs text-muted-foreground">
                        ETA: {stop.estimatedArrival}
                        {stop.waitingTimeSeconds ? (
                          <span className="text-orange-500 ml-1">
                            (espera {Math.round(stop.waitingTimeSeconds / 60)} min)
                          </span>
                        ) : null}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}

// Unassigned orders component
function UnassignedOrdersList({
  orders,
}: {
  orders: OptimizationResultsProps["result"]["unassignedOrders"];
}) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CheckCircle2 className="size-12 text-green-500 mb-4" />
        <p className="text-lg font-medium">All orders assigned!</p>
        <p className="text-sm text-muted-foreground">
          Every pending order has been successfully included in a route.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="border rounded-lg">
      <div className="p-2 space-y-2">
        {orders.map((order) => (
          <div
            key={order.orderId}
            className="flex items-center gap-3 p-3 rounded-lg border border-orange-200 bg-orange-50/50"
            style={{
              contentVisibility: "auto",
              containIntrinsicSize: "0 50px",
            }}
          >
            <AlertTriangle className="size-5 text-orange-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{order.trackingId}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {order.reason}
              </p>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// Map placeholder component
function _RouteMapPlaceholder() {
  return (
    <div className="size-full min-h-[400px] rounded-lg border-2 border-dashed flex items-center justify-center bg-muted/20">
      <div className="text-center">
        <MapPin className="size-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium text-muted-foreground">Route Map</p>
        <p className="text-sm text-muted-foreground mt-2">
          Map visualization will be displayed here.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Integrate with your preferred mapping service.
        </p>
      </div>
    </div>
  );
}

export function OptimizationResults({
  result,
  onReoptimize,
  onConfirm,
  onReassignDriver,
  isPlanConfirmed,
  jobId,
}: OptimizationResultsProps) {
  const { effectiveCompanyId: companyId } = useCompanyContext();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"routes" | "unassigned" | "map">(
    "routes",
  );
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedRouteForAssignment, setSelectedRouteForAssignment] = useState<{
    routeId: string;
    vehicleId: string;
    vehiclePlate: string;
    driverId?: string;
    driverName?: string;
  } | null>(null);

  const _selectedRoute = result.routes.find(
    (r) => r.routeId === selectedRouteId,
  );

  const handleReassignDriver = (routeId: string, vehicleId: string) => {
    const route = result.routes.find(
      (r) => r.routeId === routeId && r.vehicleId === vehicleId,
    );
    if (route) {
      setSelectedRouteForAssignment({
        routeId: route.routeId,
        vehicleId: route.vehicleId,
        vehiclePlate: route.vehicleIdentifier,
        driverId: route.driverId,
        driverName: route.driverName,
      });
      setAssignmentDialogOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary KPI Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              Resumen de Optimizaci&oacute;n
            </h2>
            <p className="text-sm text-muted-foreground">
              Objetivo: {result.summary.objective} &bull; Procesado en{" "}
              {(result.summary.processingTimeMs / 1000).toFixed(2)}s
            </p>
          </div>
        </div>

        <KpiGrid columns={4}>
          <KpiCard
            title="Rutas"
            value={result.metrics.totalRoutes}
            subtitle={`${result.metrics.totalStops} paradas totales`}
            icon={Truck}
            status="neutral"
          />
          <KpiCard
            title="Distancia Total"
            value={`${(result.metrics.totalDistance / 1000).toFixed(1)} km`}
            subtitle={`${Math.floor(result.metrics.totalDuration / 3600)}h ${Math.floor((result.metrics.totalDuration % 3600) / 60)}m duraci\u00f3n`}
            icon={Ruler}
            status="neutral"
          />
          <KpiCard
            title="Utilizaci\u00f3n"
            value={`${result.metrics.utilizationRate}%`}
            subtitle="Capacidad de veh\u00edculos"
            icon={TrendingUp}
            status={
              result.metrics.utilizationRate >= 80
                ? "success"
                : result.metrics.utilizationRate >= 50
                  ? "warning"
                  : "error"
            }
          />
          <KpiCard
            title="Cumplimiento"
            value={`${result.metrics.timeWindowComplianceRate}%`}
            subtitle="Ventanas de tiempo"
            icon={CheckCircle2}
            status={
              result.metrics.timeWindowComplianceRate >= 95
                ? "success"
                : result.metrics.timeWindowComplianceRate >= 80
                  ? "warning"
                  : "error"
            }
          />
        </KpiGrid>

        {/* balanceScore was removed from PlanLevelMetrics \u2014 the canonical
            shape no longer surfaces it; the value is part of solver-internal
            metrics that the verifier doesn't need to track. */}

        {result.unassignedOrders.length > 0 && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg dark:bg-orange-950 dark:border-orange-800">
            <div className="flex items-center gap-2 text-orange-800 dark:text-orange-300">
              <AlertTriangle className="size-4" />
              <span className="font-medium text-sm">
                {result.unassignedOrders.length} pedido
                {result.unassignedOrders.length > 1 ? "s" : ""} no pudo ser
                asignado
              </span>
            </div>
            <p className="text-xs text-orange-700 dark:text-orange-400 mt-1">
              Revise la pesta&ntilde;a de Pedidos No Asignados para m&aacute;s
              detalles.
            </p>
          </div>
        )}
      </div>

      {/* Assignment Quality Metrics */}
      {result.assignmentMetrics && (
        <AssignmentMetricsCard metrics={result.assignmentMetrics} />
      )}

      {/* Verification panel — only render when the verifier produced output */}
      {result.verification && (
        (result.verification.summary.hard > 0 ||
          result.verification.summary.soft > 0) && (
          <Card
            className={
              result.verification.summary.hard > 0
                ? "border-red-300 bg-red-50/60 dark:bg-red-950/20"
                : "border-orange-300 bg-orange-50/60 dark:bg-orange-950/20"
            }
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle
                  className={
                    result.verification.summary.hard > 0
                      ? "size-4 text-red-600"
                      : "size-4 text-orange-600"
                  }
                />
                Verificación de restricciones
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {result.verification.summary.hard} críticas ·{" "}
                  {result.verification.summary.soft} soft
                </span>
              </CardTitle>
              <CardDescription>
                {result.verification.summary.hard > 0
                  ? "El plan viola restricciones definidas en el input. Revisar antes de confirmar."
                  : "El plan respeta todas las restricciones duras pero tiene observaciones menores."}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-1.5">
              {result.verification.violations
                .filter((v) => v.severity !== "INFO")
                .slice(0, 8)
                .map((v, i) => (
                  <div
                    key={`${v.code}-${v.orderId ?? v.vehicleId ?? i}`}
                    className="text-xs flex items-start gap-2"
                  >
                    <span
                      className={
                        v.severity === "HARD"
                          ? "inline-block px-1.5 py-0.5 rounded bg-red-200 text-red-900 text-[10px] font-medium"
                          : "inline-block px-1.5 py-0.5 rounded bg-orange-200 text-orange-900 text-[10px] font-medium"
                      }
                    >
                      {v.severity}
                    </span>
                    <span className="flex-1">
                      <span className="font-mono text-[10px] text-muted-foreground mr-1">
                        {v.code}
                      </span>
                      {v.message}
                      {v.trackingId && (
                        <span className="text-muted-foreground">
                          {" "}· pedido {v.trackingId}
                        </span>
                      )}
                      {v.vehicleIdentifier && !v.trackingId && (
                        <span className="text-muted-foreground">
                          {" "}· vehículo {v.vehicleIdentifier}
                        </span>
                      )}
                      {v.expected !== undefined && (
                        <span className="text-muted-foreground">
                          {" "}(esperado {String(v.expected)}, real{" "}
                          {String(v.actual)})
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              {result.verification.violations.filter((v) => v.severity !== "INFO")
                .length > 8 && (
                <p className="text-xs text-muted-foreground pt-1">
                  +{" "}
                  {result.verification.violations.filter(
                    (v) => v.severity !== "INFO",
                  ).length - 8}{" "}
                  violaciones adicionales
                </p>
              )}
            </CardContent>
          </Card>
        )
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) =>
          setActiveTab(v as "routes" | "unassigned" | "map")
        }
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="routes">
            Routes ({result.routes.length})
          </TabsTrigger>
          <TabsTrigger value="unassigned">
            Unassigned ({result.unassignedOrders.length})
          </TabsTrigger>
          <TabsTrigger value="map">Map View</TabsTrigger>
        </TabsList>

        <TabsContent value="routes" className="space-y-4">
          {result.routes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Truck className="size-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                  No routes generated
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {result.routes.map((route) => (
                <div
                  key={route.routeId}
                  style={{
                    contentVisibility: "auto",
                    containIntrinsicSize: "0 80px",
                  }}
                >
                  <RouteCard
                    route={route}
                    isSelected={selectedRouteId === route.routeId}
                    onToggle={() =>
                      setSelectedRouteId(
                        selectedRouteId === route.routeId
                          ? null
                          : route.routeId,
                      )
                    }
                    onReassignDriver={
                      onReassignDriver ? handleReassignDriver : undefined
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="unassigned">
          <Card>
            <CardHeader>
              <CardTitle>Unassigned Orders</CardTitle>
              <CardDescription>
                Orders that could not be included in any route due to
                constraints
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UnassignedOrdersList orders={result.unassignedOrders} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="map">
          <RouteMap
            routes={result.routes}
            depot={result.depot}
            selectedRouteId={selectedRouteId}
            onRouteSelect={(routeId) => setSelectedRouteId(routeId)}
          />
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          Optimized at {new Date(result.summary.optimizedAt).toLocaleString()}
        </div>
        <div className="flex gap-3">
          {onReoptimize && (
            <Button variant="outline" onClick={onReoptimize}>
              Reoptimize
            </Button>
          )}
          {onConfirm && jobId && !isPlanConfirmed && (
            <Button
              onClick={() => setConfirmDialogOpen(true)}
              disabled={false}
            >
              Confirm Plan
            </Button>
          )}
          {isPlanConfirmed && (
            <Badge variant="default" className="bg-green-600">
              <CheckCircle2 className="size-3 mr-1" />
              Plan Confirmed
            </Badge>
          )}
        </div>
      </div>

      {/* Manual Assignment Dialog */}
      {selectedRouteForAssignment && (
        <ManualDriverAssignmentDialog
          open={assignmentDialogOpen}
          onOpenChange={setAssignmentDialogOpen}
          routeId={selectedRouteForAssignment.routeId}
          vehicleId={selectedRouteForAssignment.vehicleId}
          vehiclePlate={selectedRouteForAssignment.vehiclePlate}
          currentDriverId={selectedRouteForAssignment.driverId}
          currentDriverName={selectedRouteForAssignment.driverName}
          onAssign={async (driverId, overrideWarnings, reason) => {
            if (!companyId) throw new Error("Company context unavailable");
            const response = await fetch("/api/driver-assignment/manual", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-company-id": companyId,
              },
              body: JSON.stringify({
                companyId,
                vehicleId: selectedRouteForAssignment.vehicleId,
                driverId,
                routeId: selectedRouteForAssignment.routeId,
                overrideWarnings,
                reason,
              }),
            });

            if (!response.ok) {
              throw new Error("Failed to assign driver");
            }

            // Trigger callback to refresh the results
            if (onReassignDriver) {
              onReassignDriver(
                selectedRouteForAssignment.routeId,
                selectedRouteForAssignment.vehicleId,
              );
            }
          }}
          onRemove={async () => {
            if (!companyId) throw new Error("Company context unavailable");
            const response = await fetch(
              `/api/driver-assignment/remove/${selectedRouteForAssignment.routeId}/${selectedRouteForAssignment.vehicleId}`,
              {
                method: "DELETE",
                headers: {
                  "Content-Type": "application/json",
                  "x-company-id": companyId,
                },
              },
            );

            if (!response.ok) {
              throw new Error("Failed to remove assignment");
            }

            // Trigger callback to refresh the results
            if (onReassignDriver) {
              onReassignDriver(
                selectedRouteForAssignment.routeId,
                selectedRouteForAssignment.vehicleId,
              );
            }
          }}
        />
      )}

      {/* Plan Confirmation Dialog */}
      {jobId && companyId && (
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
      )}
    </div>
  );
}

export type { OptimizationResultsProps };
