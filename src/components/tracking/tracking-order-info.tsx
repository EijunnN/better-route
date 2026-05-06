"use client";

import { useState } from "react";
import { Calendar, Clock, Copy, Check, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

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

const STATUS_PILLS: Record<
  string,
  { label: string; tone: "live" | "info" | "danger" | "muted" }
> = {
  PENDING: { label: "Pendiente", tone: "muted" },
  ASSIGNED: { label: "Asignado", tone: "info" },
  IN_PROGRESS: { label: "En camino", tone: "live" },
  COMPLETED: { label: "Entregado", tone: "live" },
  FAILED: { label: "Fallido", tone: "danger" },
  CANCELLED: { label: "Cancelado", tone: "muted" },
};

function formatTime(value: string): string {
  const timeOnly = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (timeOnly) {
    const [, hh, mm] = timeOnly;
    return `${hh}:${mm}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("es-PE", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function TrackingOrderInfo({
  trackingId,
  status,
  address,
  customerName,
  promisedDate,
  timeWindowStart,
  timeWindowEnd,
  brandColor,
}: TrackingOrderInfoProps) {
  const [copied, setCopied] = useState(false);
  const pill = STATUS_PILLS[status] ?? { label: status, tone: "muted" as const };
  const accent = brandColor ?? "#4AB855";
  const isLive = pill.tone === "live";

  const copyTracking = async () => {
    try {
      await navigator.clipboard.writeText(trackingId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard may be denied
    }
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card/80 p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Detalles del pedido</h3>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
            pill.tone === "danger" && "bg-destructive/15 text-destructive",
            pill.tone === "muted" && "bg-muted text-muted-foreground",
            pill.tone === "info" && "bg-blue-500/15 text-blue-400",
          )}
          style={
            isLive ? { backgroundColor: `${accent}26`, color: accent } : undefined
          }
        >
          {pill.label}
        </span>
      </div>

      <div className="mt-4 space-y-4 text-sm">
        <Field label="Pedido">
          <div className="flex items-center gap-2">
            <span className="font-medium">{trackingId}</span>
            <button
              type="button"
              onClick={copyTracking}
              aria-label="Copiar ID"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </Field>

        <Field label="Cliente">
          <span className="font-medium">{customerName}</span>
        </Field>

        <Field label="Dirección de entrega" icon={<MapPin className="h-3.5 w-3.5" />}>
          <span className="leading-snug">{address}</span>
        </Field>

        {promisedDate && (
          <Field
            label="Fecha"
            icon={<Calendar className="h-3.5 w-3.5" />}
          >
            <span className="capitalize">{formatDate(promisedDate)}</span>
          </Field>
        )}

        {(timeWindowStart || timeWindowEnd) && (
          <Field label="Hora" icon={<Clock className="h-3.5 w-3.5" />}>
            <span>
              {timeWindowStart && timeWindowEnd
                ? `${formatTime(timeWindowStart)} – ${formatTime(timeWindowEnd)}`
                : timeWindowStart
                  ? `Desde ${formatTime(timeWindowStart)}`
                  : `Hasta ${formatTime(timeWindowEnd!)}`}
            </span>
          </Field>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-start gap-2 text-sm text-foreground">
        {icon ? (
          <span className="mt-0.5 text-muted-foreground">{icon}</span>
        ) : null}
        {children}
      </div>
    </div>
  );
}
