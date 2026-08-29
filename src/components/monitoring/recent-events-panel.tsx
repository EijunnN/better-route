"use client";

import { CheckCircle, Clock, MapPin, Package, XCircle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useApiData } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import { MONITORING_EVENTS_URL } from "./monitoring-context";

interface StopEvent {
  id: string;
  type: "COMPLETED" | "FAILED" | "STARTED";
  stopId: string;
  trackingId: string;
  address: string;
  driverName: string;
  vehiclePlate: string;
  routeId: string;
  sequence: number;
  timestamp: string;
  failureReason?: string;
  notes?: string;
  latitude: string;
  longitude: string;
}

interface RecentEventsPanelProps {
  companyId: string;
  onEventClick?: (event: StopEvent) => void;
  onLocateOnMap?: (lat: number, lng: number) => void;
  getWorkflowLabel?: (systemState: string) => string;
}

const EVENT_CONFIG = {
  COMPLETED: {
    icon: CheckCircle,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    label: "Completada",
  },
  FAILED: {
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    label: "Fallida",
  },
  STARTED: {
    icon: Clock,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    label: "Iniciada",
  },
};

export function RecentEventsPanel({
  companyId,
  onEventClick,
  onLocateOnMap,
  getWorkflowLabel,
}: RecentEventsPanelProps) {
  const [filter, setFilter] = useState<"all" | "FAILED" | "COMPLETED">("all");

  // El panel muestra transiciones de parada, que es justo lo que Centrifugo
  // publica: el contexto revalida esta clave con cada evento que llega por el
  // socket, así que la lista sale antes que con el poll de 10s que había acá
  // — y sin pagar 360 invocaciones por hora de pestaña abierta. El intervalo
  // queda sólo como red de seguridad para un WebSocket caído.
  const { data, isLoading } = useApiData<StopEvent[]>(
    MONITORING_EVENTS_URL,
    companyId,
    { refreshInterval: 300000 },
  );
  const events = data ?? [];

  const filteredEvents =
    filter === "all" ? events : events.filter((e) => e.type === filter);

  const failedCount = events.filter((e) => e.type === "FAILED").length;

  const getTimeSince = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "ahora";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `hace ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours}h`;
    return `hace ${Math.floor(hours / 24)}d`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Package className="size-4 text-muted-foreground" />
            <span className="font-medium text-sm">Eventos Recientes</span>
          </div>
          {failedCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {failedCount} fallida{failedCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Filter buttons */}
        <div className="flex gap-1">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={() => setFilter("all")}
          >
            Todos
          </Button>
          <Button
            variant={filter === "FAILED" ? "destructive" : "outline"}
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={() => setFilter("FAILED")}
          >
            Fallidas
          </Button>
          <Button
            variant={filter === "COMPLETED" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={() => setFilter("COMPLETED")}
          >
            Completadas
          </Button>
        </div>
      </div>

      {/* Events List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Sin eventos recientes
            </div>
          ) : (
            filteredEvents.map((event) => {
              const config = EVENT_CONFIG[event.type];
              const Icon = config.icon;

              const eventLabel = getWorkflowLabel
                ? getWorkflowLabel(event.type)
                : config.label;

              return (
                <div
                  key={event.id}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "p-2.5 rounded-lg border cursor-pointer transition-[box-shadow] hover:shadow-sm",
                    event.type === "FAILED" &&
                      "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20",
                  )}
                  onClick={() => onEventClick?.(event)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onEventClick?.(event);
                    }
                  }}
                >
                  <div className="flex items-start gap-2">
                    {/* Icon */}
                    <div
                      className={cn(
                        "p-1.5 rounded-full shrink-0",
                        config.bgColor,
                      )}
                    >
                      <Icon className={cn("size-3.5", config.color)} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium text-sm truncate">
                            #{event.trackingId}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] shrink-0"
                          >
                            {eventLabel}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {getTimeSince(event.timestamp)}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {event.address}
                      </p>

                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-muted-foreground">
                          {event.driverName}
                        </span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          {event.vehiclePlate}
                        </span>
                      </div>

                      {/* Failure reason */}
                      {event.type === "FAILED" && event.failureReason && (
                        <div className="mt-2 p-2 bg-red-100/50 dark:bg-red-900/20 rounded text-xs">
                          <span className="font-medium text-red-700 dark:text-red-400">
                            Motivo:
                          </span>{" "}
                          <span className="text-red-600 dark:text-red-300">
                            {event.failureReason}
                          </span>
                        </div>
                      )}

                      {/* Notes */}
                      {event.notes && (
                        <p className="text-xs text-muted-foreground mt-1 italic">
                          "{event.notes}"
                        </p>
                      )}

                      {/* Locate button */}
                      {onLocateOnMap && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs mt-2 -ml-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            onLocateOnMap(
                              parseFloat(event.latitude),
                              parseFloat(event.longitude),
                            );
                          }}
                        >
                          <MapPin className="size-3 mr-1" />
                          Ver en mapa
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
