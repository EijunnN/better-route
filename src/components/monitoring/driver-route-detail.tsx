"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Edit3,
  Loader2,
  MapPin,
  Truck,
  User,
  XCircle,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  type StopInfo,
  StopStatusUpdateDialog,
} from "./stop-status-update-dialog";

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

interface DriverRouteDetailProps {
  driver: DriverInfo;
  route: RouteData | null;
  onClose: () => void;
  onRefresh?: () => void;
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
}: DriverRouteDetailProps) {
  const [selectedStop, setSelectedStop] = useState<StopInfo | null>(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

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
    async (stopId: string, status: string, notes?: string) => {
      setUpdatingStatus(true);
      try {
        const response = await fetch(`/api/route-stops/${stopId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            // In a real app, these would come from auth context
            "x-company-id": localStorage.getItem("companyId") || "",
            "x-user-id": localStorage.getItem("userId") || "",
          },
          body: JSON.stringify({ status, notes }),
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

  const completedStops =
    route?.stops.filter((s) => s.status === "COMPLETED").length || 0;
  const totalStops = route?.stops.length || 0;
  const progressPercentage =
    totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;

  return (
    <>
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al resumen
          </Button>
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={updatingStatus}
            >
              {updatingStatus ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Actualizar
            </Button>
          )}
        </div>

        {/* Driver Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Información del conductor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Nombre:</span>
                  <span className="font-medium">{driver.name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Identificación:</span>
                  <span className="font-medium">{driver.identification}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Correo:</span>
                  <span className="font-medium">{driver.email}</span>
                </div>
                {driver.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Teléfono:</span>
                    <span className="font-medium">{driver.phone}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Flota:</span>
                  <Badge variant="outline">{driver.fleet.name}</Badge>
                  <Badge variant="secondary">{driver.fleet.type}</Badge>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Estado:</span>
                  <Badge>{driver.status}</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Route Info Card */}
        {route ? (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Información de la ruta</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-sm">
                      {completedStops} / {totalStops} paradas
                    </Badge>
                    <Badge className="text-sm">
                      {progressPercentage}% completado
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Vehicle Info */}
                <div className="flex items-center gap-3 mb-4 pb-4 border-b">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Truck className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">{route.vehicle.plate}</div>
                    <div className="text-sm text-muted-foreground">
                      {route.vehicle.brand} {route.vehicle.model}
                    </div>
                  </div>
                </div>

                {/* Route Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Distancia total
                    </div>
                    <div className="text-lg font-semibold">
                      {formatDistance(route.metrics.totalDistance)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Duración
                    </div>
                    <div className="text-lg font-semibold">
                      {formatDuration(route.metrics.totalDuration)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Capacidad usada
                    </div>
                    <div className="text-lg font-semibold">
                      {route.metrics.utilizationPercentage}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Violaciones de horario
                    </div>
                    <div className="text-lg font-semibold">
                      {route.metrics.timeWindowViolations}
                    </div>
                  </div>
                </div>

                {/* Assignment Quality Warnings/Errors */}
                {route.assignmentQuality && (
                  <div className="mt-4 pt-4 border-t space-y-2">
                    {route.assignmentQuality.errors.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {route.assignmentQuality.errors.map((error) => (
                          <Badge
                            key={error}
                            variant="destructive"
                            className="text-xs"
                          >
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {error}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {route.assignmentQuality.warnings.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {route.assignmentQuality.warnings.map((warning) => (
                          <Badge
                            key={warning}
                            variant="secondary"
                            className="text-xs"
                          >
                            {warning}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stops List */}
            <Card>
              <CardHeader>
                <CardTitle>Paradas de la ruta</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {route.stops.map((stop) => {
                      const statusConfig =
                        STOP_STATUS_CONFIG[
                          stop.status as keyof typeof STOP_STATUS_CONFIG
                        ] || STOP_STATUS_CONFIG.PENDING;
                      const StatusIcon = statusConfig.icon;

                      return (
                        <div
                          key={stop.orderId}
                          className={`p-3 rounded-lg border ${statusConfig.borderColor} ${statusConfig.bgColor} group`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 ${statusConfig.color}`}>
                              <StatusIcon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-xs">
                                  #{stop.sequence}
                                </Badge>
                                <span className="font-medium text-sm">
                                  {stop.trackingId}
                                </span>
                                <Badge className="text-xs">
                                  {statusConfig.label}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{stop.address}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>
                                    Llegada est.:{" "}
                                    {formatTime(stop.estimatedArrival)}
                                  </span>
                                </div>
                                {stop.completedAt && (
                                  <div className="flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>
                                      Completada: {formatTime(stop.completedAt)}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {stop.notes && (
                                <div className="mt-1 text-xs text-muted-foreground italic">
                                  Nota: {stop.notes}
                                </div>
                              )}
                            </div>
                            {stop.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => openStatusDialog(stop)}
                              >
                                <Edit3 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Este conductor no tiene una ruta asignada activa.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Status Update Dialog */}
      <StopStatusUpdateDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        stop={selectedStop}
        onUpdate={handleStatusUpdate}
      />
    </>
  );
}
