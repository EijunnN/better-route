"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, Clock } from "lucide-react";

interface TrackingOrderInfoProps {
  trackingId: string;
  status: string;
  address: string;
  customerName: string;
  promisedDate?: string | null;
  timeWindowStart?: string | null;
  timeWindowEnd?: string | null;
  estimatedArrival?: string | null;
  showEta: boolean;
  brandColor?: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "warning" | "outline" }> = {
  PENDING: { label: "Pendiente", variant: "secondary" },
  ASSIGNED: { label: "Asignado", variant: "outline" },
  IN_PROGRESS: { label: "En camino", variant: "default" },
  COMPLETED: { label: "Entregado", variant: "default" },
  FAILED: { label: "Fallido", variant: "destructive" },
  CANCELLED: { label: "Cancelado", variant: "destructive" },
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

export function TrackingOrderInfo({
  trackingId,
  status,
  address,
  customerName,
  promisedDate,
  timeWindowStart,
  timeWindowEnd,
  estimatedArrival,
  showEta,
  brandColor,
}: TrackingOrderInfoProps) {
  const statusConfig = STATUS_CONFIG[status] || { label: status, variant: "outline" as const };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Detalles del pedido</CardTitle>
          <Badge
            variant={statusConfig.variant}
            style={
              status === "IN_PROGRESS" && brandColor
                ? { backgroundColor: brandColor, color: "#fff", borderColor: brandColor }
                : undefined
            }
          >
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground">
          Pedido: {trackingId}
        </div>

        <div className="text-sm font-medium">{customerName}</div>

        <div className="flex items-start gap-2 text-sm">
          <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <span>{address}</span>
        </div>

        {promisedDate && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{formatDate(promisedDate)}</span>
          </div>
        )}

        {(timeWindowStart || timeWindowEnd) && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              {timeWindowStart && timeWindowEnd
                ? `${formatTime(timeWindowStart)} - ${formatTime(timeWindowEnd)}`
                : timeWindowStart
                  ? `Desde ${formatTime(timeWindowStart)}`
                  : `Hasta ${formatTime(timeWindowEnd!)}`}
            </span>
          </div>
        )}

        {showEta && estimatedArrival && status !== "COMPLETED" && status !== "FAILED" && status !== "CANCELLED" && (
          <div
            className="rounded-md px-3 py-2 text-sm font-medium"
            style={
              brandColor
                ? { backgroundColor: brandColor + "1a", color: brandColor }
                : undefined
            }
          >
            Llegada estimada: {formatTime(estimatedArrival)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
