"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Battery,
  CheckCircle2,
  Clock,
  Edit3,
  Loader2,
  MapPin,
  RefreshCw,
  Signal,
  Truck,
  User,
  XCircle,
} from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  type StopInfo,
  StopStatusUpdateDialog,
} from "./stop-status-update-dialog";
import type { WorkflowState } from "./monitoring-context";

interface Stop {
  id?: string;
  orderId: string;
  trackingId: string;
  sequence: number;
  address: string;
  latitude: string;
  longitude: string;
  status: string;
  estimatedArrival?: string;
  completedAt?: string | null;
  startedAt?: string | null;
  notes?: string | null;
  timeWindowStart?: string | null;
  timeWindowEnd?: string | null;
  workflowState?: {
    id: string;
    label: string;
    color: string;
    code: string;
    systemState: string;
  } | null;
  customFields?: Record<string, unknown> | null;
}

interface RouteMetrics {
  totalDistance: number;
  totalDuration: number;
  totalWeight: number;
  totalVolume: number;
  utilizationPercentage: number;
  timeWindowViolations: number;
}

interface VehicleInfo {
  id: string;
  plate: string;
  brand: string;
  model: string;
}

interface DriverInfo {
  id: string;
  name: string;
  status: string;
  identification: string;
  email: string;
  phone?: string;
  fleet: {
    id: string;
    name: string;
    type: string;
  };
  fleets?: Array<{
    id: string;
    name: string;
    type: string;
    isPrimary: boolean;
  }>;
}

interface RouteData {
  routeId: string;
  jobId?: string;
  vehicle: VehicleInfo;
  metrics: RouteMetrics;
  stops: Stop[];
  assignmentQuality?: {
    score: number;
    warnings: string[];
    errors: string[];
  };
}

interface LocationData {
  batteryLevel: number | null;
  isRecent: boolean;
  isMoving: boolean | null;
  speed: number | null;
}

interface DriverRouteDetailProps {
  driver: DriverInfo;
  route: RouteData | null;
  onClose: () => void;
  onRefresh?: () => void;
  locationData?: LocationData | null;
  workflowStates?: WorkflowState[];
}

const STOP_STATUS_CONFIG = {
  PENDING: {
    label: "Pendiente",
    icon: Clock,
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/30",
  },
  IN_PROGRESS: {
    label: "En progreso",
    icon: Loader2,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
  },
  COMPLETED: {
    label: "Completada",
    icon: CheckCircle2,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
  },
  FAILED: {
    label: "Fallida",
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
  },
  SKIPPED: {
    label: "Omitida",
    icon: XCircle,
    color: "text-gray-400",
    bgColor: "bg-gray-400/10",
    borderColor: "border-gray-400/30",
  },
};

export function DriverRouteDetail({
  driver,
  route,
  onClose,
  onRefresh,
  locationData,
  workflowStates = [],
}: DriverRouteDetailProps) {
  const [selectedStop, setSelectedStop] = useState<StopInfo | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      // Small delay so the user sees the spinner
      setTimeout(() => setIsRefreshing(false), 600);
    }
  }, [onRefresh]);

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

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return "--:--";
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleStatusUpdate = useCallback(
    async (stopId: string, status: string, notes?: string, workflowStateId?: string) => {
      setUpdatingStatus(true);
      try {
        const body: Record<string, string | undefined> = { status, notes };
        if (workflowStateId) body.workflowStateId = workflowStateId;

        const response = await fetch(`/api/route-stops/${stopId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            // In a real app, these would come from auth context
            "x-company-id": localStorage.getItem("companyId") || "",
            "x-user-id": localStorage.getItem("userId") || "",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to update stop status");
        }

        // Refresh the data to show updated status
        if (onRefresh) {
          onRefresh();
        }
      } catch (error) {
        console.error("Failed to update stop status:", error);
        throw error;
      } finally {
        setUpdatingStatus(false);
      }
    },
    [onRefresh],
  );

  const openStatusDialog = (stop: Stop) => {
    if (!stop.id) {
      console.warn("Cannot update stop status: stop has no ID");
      return;
    }
    setSelectedStop({
      id: stop.id,
      orderId: stop.orderId,
      trackingId: stop.trackingId,
      sequence: stop.sequence,
      address: stop.address,
      status: stop.status as
        | "PENDING"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "FAILED"
        | "SKIPPED",
      estimatedArrival: stop.estimatedArrival,
      timeWindowStart: stop.timeWindowStart,
      timeWindowEnd: stop.timeWindowEnd,
    });
    setStatusDialogOpen(true);
  };

  const getStopStatusDisplay = (stop: Stop) => {
    // 1. If the stop has an embedded workflowState from the API, use it
    if (stop.workflowState) {
      return { label: stop.workflowState.label, color: stop.workflowState.color };
    }
    // 2. Try to find a matching workflow state from context
    if (workflowStates.length > 0) {
      const wf = workflowStates.find(s => s.systemState === stop.status);
      if (wf) return { label: wf.label, color: wf.color };
    }
    // 3. Fallback to hardcoded config
    const cfg = STOP_STATUS_CONFIG[stop.status as keyof typeof STOP_STATUS_CONFIG];
    return cfg ? { label: cfg.label, color: undefined } : { label: stop.status, color: undefined };
  };

  const completedStops =
    route?.stops.filter((s) => s.status === "COMPLETED").length || 0;
  const totalStops = route?.stops.length || 0;
  const progressPercentage =
    totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;

  return (
    <>
      <div className="space-y-3">
        {/* Compact header: back + name + status + refresh */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold truncate">{driver.name}</span>
              <Badge variant="secondary" className="text-[10px] shrink-0">{driver.status}</Badge>
            </div>
          </div>
          {onRefresh && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
            </Button>
          )}
        </div>

        {/* Driver info: fleet + contact */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {driver.fleets && driver.fleets.length > 0 ? (
            driver.fleets.map((f) => (
              <Badge key={f.id} variant={f.isPrimary ? "default" : "outline"} className="text-[10px]">{f.name}</Badge>
            ))
          ) : (
            <Badge variant="outline" className="text-[10px]">{driver.fleet.name}</Badge>
          )}
          <span className="mx-0.5">·</span>
          <span>{driver.identification}</span>
          {driver.phone && <><span className="mx-0.5">·</span><span>{driver.phone}</span></>}
        </div>

        {/* Device status row */}
        {locationData && (
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <Signal className="w-3 h-3 text-muted-foreground" />
              <div className={cn("w-1.5 h-1.5 rounded-full", locationData.isRecent ? "bg-green-500" : "bg-amber-500")} />
              <span className={locationData.isRecent ? "text-green-600" : "text-amber-600"}>
                {locationData.isRecent ? "GPS activo" : "Sin señal"}
              </span>
            </div>
            {locationData.batteryLevel != null && locationData.isRecent && (
              <div className="flex items-center gap-1.5">
                <Battery className={cn("w-3 h-3",
                  locationData.batteryLevel > 50 ? "text-green-500" :
                  locationData.batteryLevel > 20 ? "text-amber-500" : "text-red-500"
                )} />
                <span className={cn(
                  locationData.batteryLevel > 50 ? "text-green-600" :
                  locationData.batteryLevel > 20 ? "text-amber-600" : "text-red-600"
                )}>
                  {locationData.batteryLevel}%
                </span>
              </div>
            )}
          </div>
        )}

        {/* Route info compact */}
        {route ? (
          <>
            {/* Vehicle + progress row */}
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
              <Truck className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-medium">{route.vehicle.plate}</span>
              <span className="text-xs text-muted-foreground">{route.vehicle.brand} {route.vehicle.model}</span>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-xs font-medium">{completedStops}/{totalStops}</span>
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPercentage}%` }} />
                </div>
                <span className="text-xs text-muted-foreground">{progressPercentage}%</span>
              </div>
            </div>

            {/* Metrics row - compact */}
            <div className="grid grid-cols-4 gap-1 text-center">
              <div className="p-1.5 rounded-md bg-muted/30">
                <div className="text-sm font-semibold">{formatDistance(route.metrics.totalDistance)}</div>
                <div className="text-[10px] text-muted-foreground">Dist.</div>
              </div>
              <div className="p-1.5 rounded-md bg-muted/30">
                <div className="text-sm font-semibold">{formatDuration(route.metrics.totalDuration)}</div>
                <div className="text-[10px] text-muted-foreground">Duración</div>
              </div>
              <div className="p-1.5 rounded-md bg-muted/30">
                <div className="text-sm font-semibold">{route.metrics.utilizationPercentage}%</div>
                <div className="text-[10px] text-muted-foreground">Capacidad</div>
              </div>
              <div className="p-1.5 rounded-md bg-muted/30">
                <div className="text-sm font-semibold">{route.metrics.timeWindowViolations}</div>
                <div className="text-[10px] text-muted-foreground">Violaciones</div>
              </div>
            </div>

            {/* Assignment quality badges */}
            {route.assignmentQuality && (route.assignmentQuality.errors.length > 0 || route.assignmentQuality.warnings.length > 0) && (
              <div className="flex flex-wrap gap-1">
                {route.assignmentQuality.errors.map((error) => (
                  <Badge key={error} variant="destructive" className="text-[10px]">
                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />{error}
                  </Badge>
                ))}
                {route.assignmentQuality.warnings.map((warning) => (
                  <Badge key={warning} variant="secondary" className="text-[10px]">{warning}</Badge>
                ))}
              </div>
            )}

            {/* Stops list - compact */}
            <div className="pt-1 border-t">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">Paradas</span>
              </div>
              <div className="space-y-1">
                {route.stops.map((stop) => {
                  const statusConfig =
                    STOP_STATUS_CONFIG[stop.status as keyof typeof STOP_STATUS_CONFIG] || STOP_STATUS_CONFIG.PENDING;
                  const StatusIcon = statusConfig.icon;
                  const wfDisplay = getStopStatusDisplay(stop);
                  const hasCustomColor = !!wfDisplay.color;

                  return (
                    <div
                      key={stop.orderId}
                      className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 group cursor-default"
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                          !hasCustomColor && statusConfig.bgColor,
                          !hasCustomColor && statusConfig.color,
                        )}
                        style={hasCustomColor ? { backgroundColor: `${wfDisplay.color}1A`, color: wfDisplay.color } : undefined}
                      >
                        {stop.sequence}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium">{stop.trackingId}</span>
                          <StatusIcon
                            className={cn("w-3 h-3 shrink-0", !hasCustomColor && statusConfig.color)}
                            style={hasCustomColor ? { color: wfDisplay.color } : undefined}
                          />
                          {hasCustomColor && (
                            <span className="text-[10px]" style={{ color: wfDisplay.color }}>{wfDisplay.label}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">{stop.address}</div>
                        {stop.customFields && Object.keys(stop.customFields).length > 0 && (
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                            {Object.entries(stop.customFields).map(([key, val]) => (
                              val != null && val !== "" && (
                                <span key={key} className="text-[10px] text-muted-foreground">
                                  <span className="font-medium">{key}:</span> {String(val)}
                                </span>
                              )
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground">{formatTime(stop.estimatedArrival)}</span>
                        {stop.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => openStatusDialog(stop)}
                          >
                            <Edit3 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Sin ruta asignada activa.
          </div>
        )}
      </div>

      {/* Status Update Dialog */}
      <StopStatusUpdateDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        stop={selectedStop}
        onUpdate={handleStatusUpdate}
        workflowStates={workflowStates}
      />
    </>
  );
}
