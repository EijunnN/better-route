"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Battery,
  CheckCircle2,
  Clock,
  Edit3,
  Loader2,
  MessageSquare,
  RefreshCw,
  Signal,
  Truck,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Can } from "@/components/auth/can";
import type { FieldDefinition } from "@/components/custom-fields/custom-fields-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AttemptBadge,
  ProgramarProximaEntregaDialog,
  type ReschedulePayload,
  type ReschedulePrefill,
} from "@/components/visits";
import { DELIVERY_FAILURE_LABELS } from "@/db/schema";
import { useCompanyContext } from "@/hooks/use-company-context";
import { cn } from "@/lib/utils";
import type { SystemState } from "@/lib/workflow/states";
import { type DeliveryPolicy, policyForState } from "./monitoring-context";
import {
  type StopInfo,
  StopStatusUpdateDialog,
} from "./stop-status-update-dialog";

interface Stop {
  id?: string;
  orderId: string;
  trackingId: string;
  sequence: number;
  attemptNumber?: number;
  address: string;
  latitude: string;
  longitude: string;
  status: string;
  estimatedArrival?: string;
  /** ETA recalculado desde la posición actual del driver (o null). */
  liveEtaAt?: string | null;
  completedAt?: string | null;
  startedAt?: string | null;
  notes?: string | null;
  failureReason?: string | null;
  timeWindowStart?: string | null;
  timeWindowEnd?: string | null;
  workflowState?: {
    label: string;
    color: string;
    code: string;
    systemState: string;
  } | null;
  zone?: {
    id: string;
    name: string;
    color: string | null;
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
    errors: Array<{ code: string; message: string }>;
  };
}

interface LocationData {
  batteryLevel: number | null;
  isRecent: boolean;
  isMoving: boolean | null;
  speed: number | null;
}

interface FieldDefinitionMap {
  [code: string]: string; // code → label
}

interface DriverRouteDetailProps {
  driver: DriverInfo;
  route: RouteData | null;
  onClose: () => void;
  onRefresh?: () => void;
  onChat?: () => void;
  locationData?: LocationData | null;
  deliveryPolicy?: DeliveryPolicy;
  fieldDefinitionLabels?: FieldDefinitionMap;
  customFieldDefinitions?: FieldDefinition[];
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
};

export function DriverRouteDetail({
  driver,
  route,
  onClose,
  onRefresh,
  onChat,
  locationData,
  deliveryPolicy,
  fieldDefinitionLabels = {},
  customFieldDefinitions = [],
}: DriverRouteDetailProps) {
  const { effectiveCompanyId: companyId } = useCompanyContext();
  const [selectedStop, setSelectedStop] = useState<StopInfo | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reopenStop, setReopenStop] = useState<{
    id: string;
    prefill: ReschedulePrefill;
  } | null>(null);

  const formatHHmm = (iso?: string | null) =>
    iso ? new Date(iso).toISOString().slice(11, 16) : null;

  const openReopenDialog = (stop: Stop) => {
    if (!stop.id) return;
    setReopenStop({
      id: stop.id,
      prefill: {
        address: stop.address,
        latitude: stop.latitude,
        longitude: stop.longitude,
        timeWindowStart: formatHHmm(stop.timeWindowStart),
        timeWindowEnd: formatHHmm(stop.timeWindowEnd),
        promisedDate: null,
        notes: stop.notes ?? null,
      },
    });
  };

  const handleReopenSubmit = async (payload: ReschedulePayload) => {
    if (!reopenStop || !companyId) return;
    const res = await fetch(`/api/route-stops/${reopenStop.id}/reopen`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": companyId,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || "No se pudo reabrir la parada");
    }
    if (onRefresh) await onRefresh();
  };

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      // Small delay so the user sees the spinner
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

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

  const handleStatusUpdate = async (
    stopId: string,
    status: string,
    notes?: string,
    customFields?: Record<string, unknown>,
    failureReason?: string,
  ) => {
    try {
      const body: Record<string, unknown> = { status, notes };
      if (customFields) body.customFields = customFields;
      if (failureReason) body.failureReason = failureReason;

      const response = await fetch(`/api/route-stops/${stopId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(companyId ? { "x-company-id": companyId } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        const details = Array.isArray(error.details)
          ? `: ${error.details.map((d: { code: string; message: string }) => `${d.code} — ${d.message}`).join("; ")}`
          : "";
        throw new Error(
          (error.error || "Failed to update stop status") + details,
        );
      }

      // Refresh the data to show updated status
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error("Failed to update stop status:", error);
      throw error;
    }
  };

  const openStatusDialog = (stop: Stop) => {
    if (!stop.id) {
      return;
    }
    setSelectedStop({
      id: stop.id,
      orderId: stop.orderId,
      trackingId: stop.trackingId,
      sequence: stop.sequence,
      address: stop.address,
      status: stop.status as "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED",
      estimatedArrival: stop.estimatedArrival,
      timeWindowStart: stop.timeWindowStart,
      timeWindowEnd: stop.timeWindowEnd,
      customFields:
        (stop.customFields as Record<string, unknown> | null) ?? null,
    });
    setStatusDialogOpen(true);
  };

  const getStopStatusDisplay = (stop: Stop) => {
    // 1. If the stop has an embedded workflowState from the API, use it
    if (stop.workflowState) {
      return {
        label: stop.workflowState.label,
        color: stop.workflowState.color,
      };
    }
    // 2. Project the system status through the company's delivery
    //    policy (canonical post-crystallization source).
    const projected = policyForState(
      stop.status as SystemState,
      deliveryPolicy,
    );
    return { label: projected.label, color: projected.color };
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
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={onClose}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold truncate">{driver.name}</span>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {driver.status}
              </Badge>
            </div>
          </div>
          {onChat && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={onChat}
              aria-label="Chatear con el conductor"
            >
              <MessageSquare className="size-3.5 text-[var(--cockpit-live)]" />
              Chatear
            </Button>
          )}
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={cn("size-3.5", isRefreshing && "animate-spin")}
              />
            </Button>
          )}
        </div>

        {/* Driver info: fleet + contact */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {driver.fleets && driver.fleets.length > 0 ? (
            driver.fleets.map((f) => (
              <Badge
                key={f.id}
                variant={f.isPrimary ? "default" : "outline"}
                className="text-[10px]"
              >
                {f.name}
              </Badge>
            ))
          ) : (
            <Badge variant="outline" className="text-[10px]">
              {driver.fleet.name}
            </Badge>
          )}
          <span className="mx-0.5">·</span>
          <span>{driver.identification}</span>
          {driver.phone && (
            <>
              <span className="mx-0.5">·</span>
              <span>{driver.phone}</span>
            </>
          )}
        </div>

        {/* Device status row */}
        {locationData && (
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <Signal className="size-3 text-muted-foreground" />
              <div
                className={cn(
                  "size-1.5 rounded-full",
                  locationData.isRecent ? "bg-green-500" : "bg-amber-500",
                )}
              />
              <span
                className={
                  locationData.isRecent ? "text-green-600" : "text-amber-600"
                }
              >
                {locationData.isRecent ? "GPS activo" : "Sin señal"}
              </span>
            </div>
            {locationData.batteryLevel != null && locationData.isRecent && (
              <div className="flex items-center gap-1.5">
                <Battery
                  className={cn(
                    "size-3",
                    locationData.batteryLevel > 50
                      ? "text-green-500"
                      : locationData.batteryLevel > 20
                        ? "text-amber-500"
                        : "text-red-500",
                  )}
                />
                <span
                  className={cn(
                    locationData.batteryLevel > 50
                      ? "text-green-600"
                      : locationData.batteryLevel > 20
                        ? "text-amber-600"
                        : "text-red-600",
                  )}
                >
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
              <Truck className="size-4 text-primary shrink-0" />
              <span className="text-sm font-medium">{route.vehicle.plate}</span>
              <span className="text-xs text-muted-foreground">
                {route.vehicle.brand} {route.vehicle.model}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-xs font-medium">
                  {completedStops}/{totalStops}
                </span>
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {progressPercentage}%
                </span>
              </div>
            </div>

            {/* Metrics row - compact */}
            <div className="grid grid-cols-4 gap-1 text-center">
              <div className="p-1.5 rounded-md bg-muted/30">
                <div className="text-sm font-semibold">
                  {formatDistance(route.metrics.totalDistance)}
                </div>
                <div className="text-[10px] text-muted-foreground">Dist.</div>
              </div>
              <div className="p-1.5 rounded-md bg-muted/30">
                <div className="text-sm font-semibold">
                  {formatDuration(route.metrics.totalDuration)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Duración
                </div>
              </div>
              <div className="p-1.5 rounded-md bg-muted/30">
                <div className="text-sm font-semibold">
                  {route.metrics.utilizationPercentage}%
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Capacidad
                </div>
              </div>
              <div className="p-1.5 rounded-md bg-muted/30">
                <div className="text-sm font-semibold">
                  {route.metrics.timeWindowViolations}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Violaciones
                </div>
              </div>
            </div>

            {/* Assignment quality badges */}
            {route.assignmentQuality &&
              (route.assignmentQuality.errors.length > 0 ||
                route.assignmentQuality.warnings.length > 0) && (
                <div className="flex flex-wrap gap-1">
                  {route.assignmentQuality.errors.map((error) => (
                    <Badge
                      key={`${error.code}-${error.message}`}
                      variant="destructive"
                      className="text-[10px]"
                    >
                      <AlertTriangle className="size-2.5 mr-0.5" />
                      {error.message}
                    </Badge>
                  ))}
                  {route.assignmentQuality.warnings.map((warning) => (
                    <Badge
                      key={warning}
                      variant="secondary"
                      className="text-[10px]"
                    >
                      {warning}
                    </Badge>
                  ))}
                </div>
              )}

            {/* Stops list - compact */}
            <div className="pt-1 border-t">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Paradas
                </span>
              </div>
              <div className="space-y-1">
                {route.stops.map((stop) => {
                  const statusConfig =
                    STOP_STATUS_CONFIG[
                      stop.status as keyof typeof STOP_STATUS_CONFIG
                    ] || STOP_STATUS_CONFIG.PENDING;
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
                          "size-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                          !hasCustomColor && statusConfig.bgColor,
                          !hasCustomColor && statusConfig.color,
                        )}
                        style={
                          hasCustomColor
                            ? {
                                backgroundColor: `${wfDisplay.color}1A`,
                                color: wfDisplay.color,
                              }
                            : undefined
                        }
                      >
                        {stop.sequence}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium">
                            {stop.trackingId}
                          </span>
                          {stop.attemptNumber && stop.attemptNumber > 1 && (
                            <AttemptBadge attemptNumber={stop.attemptNumber} />
                          )}
                          <StatusIcon
                            className={cn(
                              "size-3 shrink-0",
                              !hasCustomColor && statusConfig.color,
                            )}
                            style={
                              hasCustomColor
                                ? { color: wfDisplay.color }
                                : undefined
                            }
                          />
                          {hasCustomColor && (
                            <span
                              className="text-[10px]"
                              style={{ color: wfDisplay.color }}
                            >
                              {wfDisplay.label}
                            </span>
                          )}
                          {stop.zone && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full border shrink-0"
                              style={{
                                borderColor: stop.zone.color ?? undefined,
                                color: stop.zone.color ?? undefined,
                                backgroundColor: stop.zone.color
                                  ? `${stop.zone.color}15`
                                  : undefined,
                              }}
                              title={`Zona: ${stop.zone.name}`}
                            >
                              {stop.zone.name}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {stop.address}
                        </div>
                        {stop.status === "FAILED" && stop.failureReason && (
                          <div className="text-[10px] text-destructive mt-0.5">
                            Motivo:{" "}
                            {DELIVERY_FAILURE_LABELS[
                              stop.failureReason as keyof typeof DELIVERY_FAILURE_LABELS
                            ] ?? stop.failureReason}
                          </div>
                        )}
                        {stop.customFields &&
                          Object.keys(stop.customFields).length > 0 && (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                              {Object.entries(stop.customFields).map(
                                ([key, val]) =>
                                  val != null &&
                                  val !== "" && (
                                    <span
                                      key={key}
                                      className="text-[10px] text-muted-foreground"
                                    >
                                      <span className="font-medium">
                                        {fieldDefinitionLabels[key] || key}:
                                      </span>{" "}
                                      {String(val)}
                                    </span>
                                  ),
                              )}
                            </div>
                          )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={cn(
                            "text-[10px]",
                            stop.liveEtaAt &&
                              (stop.status === "PENDING" ||
                                stop.status === "IN_PROGRESS")
                              ? "text-[var(--cockpit-live)] font-medium"
                              : "text-muted-foreground",
                          )}
                          title={
                            stop.liveEtaAt
                              ? "ETA en vivo (desde la posición actual del conductor)"
                              : "Horario planificado"
                          }
                        >
                          {formatTime(
                            stop.status === "PENDING" ||
                              stop.status === "IN_PROGRESS"
                              ? (stop.liveEtaAt ?? stop.estimatedArrival)
                              : stop.estimatedArrival,
                          )}
                        </span>
                        {stop.id && stop.status === "FAILED" && (
                          <Can perm="route_stop:update">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => openReopenDialog(stop)}
                            >
                              Reabrir
                            </Button>
                          </Can>
                        )}
                        {stop.id && (
                          <Can perm="route_stop:update">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => openStatusDialog(stop)}
                            >
                              <Edit3 className="size-3" />
                            </Button>
                          </Can>
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
        deliveryPolicy={deliveryPolicy}
        customFieldDefinitions={customFieldDefinitions}
      />

      {reopenStop && (
        <ProgramarProximaEntregaDialog
          open={!!reopenStop}
          onOpenChange={(open) => !open && setReopenStop(null)}
          mode="same-day"
          prefill={reopenStop.prefill}
          onSubmit={handleReopenSubmit}
        />
      )}
    </>
  );
}
