"use client";

import { Check, Circle, Truck, Package, XCircle } from "lucide-react";

interface TimelineEvent {
  status: string;
  timestamp: string | null;
  label: string;
}

interface TrackingTimelineProps {
  timeline: TimelineEvent[];
  currentStatus: string;
  brandColor?: string | null;
}

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  PENDING: Package,
  ASSIGNED: Circle,
  IN_PROGRESS: Truck,
  COMPLETED: Check,
  FAILED: XCircle,
};

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    const day = date.toLocaleDateString("es-PE", {
      day: "numeric",
      month: "short",
    });
    const time = date.toLocaleTimeString("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${day}, ${time}`;
  } catch {
    return iso;
  }
}

const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "CANCELLED"];
const STATUS_ORDER = ["PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED"];

function getStepState(
  stepStatus: string,
  currentStatus: string,
): "completed" | "current" | "upcoming" {
  if (TERMINAL_STATUSES.includes(currentStatus)) {
    // All steps up to terminal are complete; the terminal step itself is "current"
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
  brandColor,
}: TrackingTimelineProps) {
  return (
    <div className="space-y-0">
      {timeline.map((event, index) => {
        const state = getStepState(event.status, currentStatus);
        const Icon = STATUS_ICONS[event.status] || Circle;
        const isLast = index === timeline.length - 1;
        const isFailed = event.status === "FAILED";

        return (
          <div key={event.status} className="flex gap-3">
            {/* Vertical line + icon */}
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                  state === "completed"
                    ? "border-transparent bg-green-500 text-white"
                    : state === "current" && isFailed
                      ? "border-transparent bg-destructive text-destructive-foreground"
                      : state === "current"
                        ? "border-transparent text-white"
                        : "border-muted bg-background text-muted-foreground"
                }`}
                style={
                  state === "current" && !isFailed && brandColor
                    ? { backgroundColor: brandColor }
                    : state === "current" && !isFailed
                      ? { backgroundColor: "var(--color-primary)" }
                      : undefined
                }
              >
                <Icon className="h-4 w-4" />
              </div>
              {!isLast && (
                <div
                  className={`w-0.5 grow min-h-6 ${
                    state === "completed" ? "bg-green-500" : "bg-muted"
                  }`}
                />
              )}
            </div>

            {/* Content */}
            <div className={`pb-6 ${isLast ? "pb-0" : ""}`}>
              <p
                className={`text-sm font-medium ${
                  state === "upcoming" ? "text-muted-foreground" : ""
                }`}
              >
                {event.label}
              </p>
              {event.timestamp && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatTimestamp(event.timestamp)}
                </p>
              )}
              {state === "current" && !isFailed && !TERMINAL_STATUSES.includes(currentStatus) && (
                <div className="flex items-center gap-1.5 mt-1">
                  <div
                    className="h-1.5 w-1.5 rounded-full animate-pulse"
                    style={
                      brandColor
                        ? { backgroundColor: brandColor }
                        : { backgroundColor: "var(--color-primary)" }
                    }
                  />
                  <span className="text-xs text-muted-foreground">En curso</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
