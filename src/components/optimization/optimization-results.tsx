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

// Re-export types from optimization-runner
export type {
  OptimizationResult,
  OptimizationRoute,
  OptimizationStop,
} from "@/lib/optimization-runner";

interface OptimizationResultsProps {
  jobId?: string;
  result: {
    routes: Array<{
      routeId: string;
      vehicleId: string;
      vehiclePlate: string;
      driverId?: string;
      driverName?: string;
      stops: Array<{
        orderId: string;
        trackingId: string;
        sequence: number;
        address: string;
        latitude: string;
        longitude: string;
        estimatedArrival?: string;
        timeWindow?: {
          start: string;
          end: string;
        };
      }>;
      totalDistance: number;
      totalDuration: number;
      totalWeight: number;
      totalVolume: number;
      utilizationPercentage: number;
      timeWindowViolations: number;
      geometry?: string; // Encoded polyline from VROOM/OSRM
      assignmentQuality?: {
        score: number;
        warnings: string[];
        errors: string[];
      };
    }>;
    unassignedOrders: Array<{
      orderId: string;
      trackingId: string;
      reason: string;
    }>;
    metrics: {
      totalDistance: number;
      totalDuration: number;
      totalRoutes: number;
      totalStops: number;
      utilizationRate: number;
      timeWindowComplianceRate: number;
      balanceScore?: number; // 0-100, distribution balance
    };
    assignmentMetrics?: {
      totalAssignments: number;
      assignmentsWithWarnings: number;
      assignmentsWithErrors: number;
      averageScore: number;
      skillCoverage: number;
      licenseCompliance: number;
      fleetAlignment: number;
      workloadBalance: number;
    };
    summary: {
      optimizedAt: string;
      objective: string;
      processingTimeMs: number;
    };
    depot?: {
      latitude: number;
      longitude: number;
    };
  };
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
      <Icon className={`h-5 w-5 ${colorClasses[color]}`} />
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
              <Truck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{route.vehiclePlate}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                {route.driverName && (
                  <>
                    <User className="h-3 w-3" />
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
                <AlertTriangle className="h-3 w-3 mr-1" />
                {route.timeWindowViolations} violation
                {route.timeWindowViolations > 1 ? "s" : ""}
              </Badge>
            )}
            {isSelected ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {isSelected && (
        <CardContent className="border-t">
          {/* Route Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{route.stops.length}</span>
              <span className="text-muted-foreground">stops</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Ruler className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {formatDistance(route.totalDistance)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {formatDuration(route.totalDuration)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className={`h-4 w-4 ${utilizationColor}`} />
              <span className={`font-medium ${utilizationColor}`}>
                {route.utilizationPercentage}%
              </span>
              <span className="text-muted-foreground">utilization</span>
            </div>
          </div>

          {/* Capacity Info */}
          {(route.totalWeight > 0 || route.totalVolume > 0) && (
            <div className="flex gap-4 mb-4 text-xs text-muted-foreground">
              {route.totalWeight > 0 && (
                <div className="flex items-center gap-1">
                  <Scale className="h-3 w-3" />
                  {route.totalWeight}kg
                </div>
              )}
              {route.totalVolume > 0 && (
                <div className="flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  {route.totalVolume}L
                </div>
              )}
            </div>
          )}

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
                >
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
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
                          <Clock className="h-2 w-2 mr-1" />
                          {new Date(stop.timeWindow.start).toLocaleTimeString(
                            [],
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                          {" - "}
                          {new Date(stop.timeWindow.end).toLocaleTimeString(
                            [],
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {stop.address}
                    </p>
                    {stop.estimatedArrival && (
                      <p className="text-xs text-muted-foreground">
                        ETA:{" "}
                        {new Date(stop.estimatedArrival).toLocaleTimeString()}
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
        <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
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
          >
            <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0" />
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
    <div className="w-full h-full min-h-[400px] rounded-lg border-2 border-dashed flex items-center justify-center bg-muted/20">
      <div className="text-center">
        <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
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
        vehiclePlate: route.vehiclePlate,
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
            <h2 className="text-xl font-semibold">Resumen de Optimizaci&oacute;n</h2>
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

        {/* Balance Score if available */}
        {result.metrics.balanceScore !== undefined && (
          <KpiGrid columns={4}>
            <KpiCard
              title="Balance de Rutas"
              value={`${result.metrics.balanceScore}%`}
              subtitle="Distribuci\u00f3n equitativa de paradas"
              icon={BarChart3}
              status={
                result.metrics.balanceScore >= 80
                  ? "success"
                  : result.metrics.balanceScore >= 60
                    ? "warning"
                    : "error"
              }
            />
          </KpiGrid>
        )}

        {result.unassignedOrders.length > 0 && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg dark:bg-orange-950 dark:border-orange-800">
            <div className="flex items-center gap-2 text-orange-800 dark:text-orange-300">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium text-sm">
                {result.unassignedOrders.length} pedido
                {result.unassignedOrders.length > 1 ? "s" : ""} no pudo ser
                asignado
              </span>
            </div>
            <p className="text-xs text-orange-700 dark:text-orange-400 mt-1">
              Revise la pesta&ntilde;a de Pedidos No Asignados para m&aacute;s detalles.
            </p>
          </div>
        )}
      </div>

      {/* Assignment Quality Metrics */}
      {result.assignmentMetrics && (
        <AssignmentMetricsCard metrics={result.assignmentMetrics} />
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
                <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                  No routes generated
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {result.routes.map((route) => (
                <RouteCard
                  key={route.routeId}
                  route={route}
                  isSelected={selectedRouteId === route.routeId}
                  onToggle={() =>
                    setSelectedRouteId(
                      selectedRouteId === route.routeId ? null : route.routeId,
                    )
                  }
                  onReassignDriver={
                    onReassignDriver ? handleReassignDriver : undefined
                  }
                />
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
              disabled={result.unassignedOrders.length > 0}
            >
              Confirm Plan
            </Button>
          )}
          {isPlanConfirmed && (
            <Badge variant="default" className="bg-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" />
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
            // Call the API to assign driver
            const response = await fetch("/api/driver-assignment/manual", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-company-id": localStorage.getItem("companyId") || "",
                "x-user-id": localStorage.getItem("userId") || "",
              },
              body: JSON.stringify({
                companyId: localStorage.getItem("companyId"),
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
            // Call the API to remove assignment
            const response = await fetch(
              `/api/driver-assignment/remove/${selectedRouteForAssignment.routeId}/${selectedRouteForAssignment.vehicleId}`,
              {
                method: "DELETE",
                headers: {
                  "Content-Type": "application/json",
                  "x-company-id": localStorage.getItem("companyId") || "",
                  "x-user-id": localStorage.getItem("userId") || "",
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
      {jobId && (
        <PlanConfirmationDialog
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
          jobId={jobId}
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
