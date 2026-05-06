"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  Package,
  Truck,
  User,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineEvent {
  status: string;
  timestamp: string | null;
  label: string;
}

interface TrackingTimelineProps {
  timeline: TimelineEvent[];
  currentStatus: string;
  driverName?: string | null;
  brandColor?: string | null;
  collapsible?: boolean;
}

const STATUS_ICON: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  PENDING: Package,
  ASSIGNED: User,
  IN_PROGRESS: Truck,
  COMPLETED: Check,
  FAILED: XCircle,
};

const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "CANCELLED"];
const STATUS_ORDER = ["PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED"];

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("es-PE", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function descriptionFor(status: string, driverName?: string | null): string {
  const driver = driverName?.trim() || "El conductor";
  switch (status) {
    case "PENDING":
      return "Hemos recibido tu pedido.";
    case "ASSIGNED":
      return driverName
        ? `${driver} aceptó y asignó tu pedido.`
        : "Tu pedido fue asignado a un conductor.";
    case "IN_PROGRESS":
      return driverName
        ? `${driver} está en camino a tu ubicación.`
        : "Tu pedido está en camino a tu ubicación.";
    case "COMPLETED":
      return "Tu pedido ha sido entregado.";
    case "FAILED":
      return "No pudimos completar la entrega.";
    case "CANCELLED":
      return "El pedido fue cancelado.";
    default:
      return "";
  }
}

function getStepState(
  stepStatus: string,
  currentStatus: string,
): "completed" | "current" | "upcoming" {
  if (TERMINAL_STATUSES.includes(currentStatus)) {
    if (stepStatus === currentStatus) return "current";
    const currentIdx = STATUS_ORDER.indexOf(currentStatus);
    const stepIdx = STATUS_ORDER.indexOf(stepStatus);
    if (currentIdx === -1 || stepIdx === -1) return "upcoming";
    return stepIdx < currentIdx ? "completed" : "upcoming";
  }
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);
  const stepIdx = STATUS_ORDER.indexOf(stepStatus);
  if (currentIdx === -1 || stepIdx === -1) return "upcoming";
  if (stepIdx < currentIdx) return "completed";
  if (stepIdx === currentIdx) return "current";
  return "upcoming";
}

export function TrackingTimeline({
  timeline,
  currentStatus,
  driverName,
  brandColor,
  collapsible = true,
}: TrackingTimelineProps) {
  const [open, setOpen] = useState(true);
  const accent = brandColor ?? "#4AB855";

  return (
    <section className="rounded-2xl border border-border/60 bg-card/80">
      <div className="flex items-center justify-between gap-2 p-5">
        <h3 className="font-semibold">Estado del envío</h3>
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        )}
      </div>

      {open && (
        <ol className="relative space-y-0 px-5 pb-5">
          {timeline.map((event, index) => {
            const state = getStepState(event.status, currentStatus);
            const Icon = STATUS_ICON[event.status] ?? Package;
            const isLast = index === timeline.length - 1;
            const isFailed = event.status === "FAILED";
            const isTerminalCurrent =
              state === "current" &&
              TERMINAL_STATUSES.includes(event.status) &&
              !isFailed;

            const bubbleColor = isFailed
              ? "var(--destructive)"
              : state === "completed" || state === "current"
                ? isTerminalCurrent
                  ? "#3B82F6"
                  : accent
                : undefined;

            return (
              <li key={event.status} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      state === "upcoming"
                        ? "border border-border bg-background text-muted-foreground"
                        : "text-white",
                    )}
                    style={
                      bubbleColor
                        ? { backgroundColor: bubbleColor }
                        : undefined
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  {!isLast && (
                    <div
                      className="w-0.5 grow"
                      style={{
                        backgroundColor:
                          state === "completed" ? accent : "var(--border)",
                        minHeight: "1.75rem",
                      }}
                    />
                  )}
                </div>

                <div className={cn("min-w-0 pb-6", isLast && "pb-0")}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        state === "upcoming" && "text-muted-foreground",
                      )}
                    >
                      {event.label}
                    </p>
                    {event.timestamp && (
                      <p className="text-xs text-muted-foreground">
                        {formatRelative(event.timestamp)}
                      </p>
                    )}
                  </div>
                  <p
                    className={cn(
                      "mt-1 text-xs leading-relaxed",
                      state === "upcoming"
                        ? "text-muted-foreground/60"
                        : "text-muted-foreground",
                    )}
                  >
                    {descriptionFor(event.status, driverName)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
