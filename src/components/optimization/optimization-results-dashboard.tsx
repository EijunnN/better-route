"use client";

import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  History,
  MapPin,
  Package,
  RefreshCw,
  Ruler,
  Scale,
  TrendingUp,
  Truck,
  User,
} from "lucide-react";
import Link from "next/link";
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
import { cn } from "@/lib/utils";
import { DriverAssignmentDisplay } from "./driver-assignment-quality";
import { PlanConfirmationDialog } from "./plan-confirmation-dialog";
import { RouteMap } from "./route-map";

interface RouteData {
  routeId: string;
  vehicleId: string;
  vehiclePlate: string;
  driverId?: string;
  driverName?: string;
  driverOrigin?: {
    latitude: string;
    longitude: string;
    address?: string;
  };
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
  geometry?: string;
  assignmentQuality?: {
    score: number;
    warnings: string[];
    errors: string[];
  };
}

interface OptimizationResultsDashboardProps {
  jobId?: string;
  result: {
    routes: RouteData[];
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
      balanceScore?: number;
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
  isPartial?: boolean;
  jobStatus?: string;
  onReoptimize?: () => void;
  onConfirm?: () => void;
  onBack?: () => void;
}

// Format helpers
function formatDistance(meters: number) {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// KPI Badge Component
function KpiBadge({
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
function CompactRouteCard({
  route,
  routeNumber,
  isSelected,
  isExpanded,
  onSelect,
  onToggle,
}: {
  route: RouteData;
  routeNumber: number;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const hasViolations = route.timeWindowViolations > 0;
  const utilizationColor =
    route.utilizationPercentage >= 80
      ? "text-green-600"
      : route.utilizationPercentage >= 50
        ? "text-yellow-600"
        : "text-red-600";

  return (
    <div
      className={cn(
        "border rounded-lg transition-all",
        isSelected && "ring-2 ring-primary",
        hasViolations && "border-orange-300",
      )}
    >
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/50"
        onClick={onSelect}
      >
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          {/* <span className="text-primary-foreground font-bold text-sm">{routeNumber}</span> */}
          <span className="text-primary-foreground  font-bold text-sm">
            <Truck className="h-4 w-4" />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{route.vehiclePlate}</span>
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
              onToggle();
            }}
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
              <span className="font-medium">{formatDistance(route.totalDistance)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">{formatDuration(route.totalDuration)}</span>
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
          {route.assignmentQuality && (route.assignmentQuality.warnings.length > 0 || route.assignmentQuality.errors.length > 0) && (
            <DriverAssignmentDisplay route={route} />
          )}

          {/* Compact Stops List */}
          <div className="border rounded max-h-32 overflow-y-auto">
            <div className="divide-y divide-border/50">
              {route.stops.map((stop) => (
                <div
                  key={stop.orderId}
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent/50 text-xs"
                >
                  <span className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0">
                    R{routeNumber}-{stop.sequence}
                  </span>
                  <span className="font-medium shrink-0">{stop.trackingId}</span>
                  <span className="text-muted-foreground mx-1">•</span>
                  <span className="text-muted-foreground truncate flex-1">{stop.address}</span>
                  {stop.timeWindow && (
                    <span className="text-muted-foreground text-[10px] shrink-0">
                      {new Date(stop.timeWindow.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Unassigned Orders Panel
function UnassignedOrdersPanel({
  orders,
}: {
  orders: Array<{
    orderId: string;
    trackingId: string;
    reason: string;
  }>;
}) {
  if (orders.length === 0) return null;

  return (
    <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/20">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2 text-orange-800 dark:text-orange-300">
          <AlertTriangle className="h-4 w-4" />
          {orders.length} pedido{orders.length > 1 ? "s" : ""} sin asignar
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2 px-4 max-h-32 overflow-y-auto">
        <div className="space-y-1">
          {orders.map((order) => (
            <div
              key={order.orderId}
              className="flex items-center justify-between text-xs"
            >
              <span className="font-medium">{order.trackingId}</span>
              <span className="text-muted-foreground truncate ml-2">
                {order.reason}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function OptimizationResultsDashboard({
  jobId,
  result,
  isPartial,
  jobStatus,
  onReoptimize,
  onConfirm,
  onBack,
}: OptimizationResultsDashboardProps) {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Header Bar */}
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
        </div>

        {/* KPI Strip */}
        <div className="hidden md:flex items-center gap-2">
          <KpiBadge
            icon={Truck}
            label="rutas"
            value={result.metrics.totalRoutes}
          />
          <KpiBadge
            icon={MapPin}
            label="paradas"
            value={result.metrics.totalStops}
          />
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
          <Link href="/optimization/history">
            <Button variant="ghost" size="sm">
              <History className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Historial</span>
            </Button>
          </Link>
          {onReoptimize && (
            <Button variant="outline" size="sm" onClick={onReoptimize}>
              <RefreshCw className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Reoptimizar</span>
            </Button>
          )}
          {onConfirm && jobId && (
            <Button
              size="sm"
              onClick={() => setConfirmDialogOpen(true)}
              disabled={result.unassignedOrders.length > 0}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirmar
            </Button>
          )}
        </div>
      </div>

      {/* Mobile KPI Strip */}
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

      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Routes Panel */}
        <div className="w-96 lg:w-[450px] xl:w-[500px] border-r flex flex-col shrink-0">
          <div className="px-4 py-2 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {result.routes.length} Rutas
              </span>
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
                isSelected={selectedRouteId === route.routeId}
                isExpanded={expandedRouteId === route.routeId}
                onSelect={() => setSelectedRouteId(route.routeId)}
                onToggle={() =>
                  setExpandedRouteId(
                    expandedRouteId === route.routeId ? null : route.routeId,
                  )
                }
              />
            ))}
          </div>

          {/* Unassigned Orders */}
          {result.unassignedOrders.length > 0 && (
            <div className="p-3 border-t">
              <UnassignedOrdersPanel orders={result.unassignedOrders} />
            </div>
          )}
        </div>

        {/* Map Panel */}
        <div className="flex-1 relative">
          <RouteMap
            routes={result.routes}
            depot={result.depot}
            selectedRouteId={selectedRouteId}
            onRouteSelect={(routeId) => setSelectedRouteId(routeId)}
            variant="fullscreen"
          />

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
      </div>

      {/* Confirmation Dialog */}
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
