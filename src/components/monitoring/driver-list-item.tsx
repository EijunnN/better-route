"use client";

import {
  AlertTriangle,
  Battery,
  CheckCircle2,
  ChevronRight,
  Clock,
  MessageSquare,
  User,
} from "lucide-react";
import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface DriverProgress {
  completedStops: number;
  totalStops: number;
  percentage: number;
}

interface DriverListItemProps {
  id: string;
  name: string;
  status: string;
  fleetName: string;
  fleetNames?: string[];
  hasRoute: boolean;
  vehiclePlate: string | null;
  progress: DriverProgress;
  alerts: string[];
  onClick: () => void;
  onChat?: () => void;
  isSelected?: boolean;
  compact?: boolean;
  currentLocation?: {
    batteryLevel: number | null;
    isMoving: boolean | null;
    speed: number | null;
    isRecent: boolean;
  } | null;
}

type LedStatus = "live" | "warn" | "danger" | "idle";

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    color: string;
    led: LedStatus;
    icon: typeof CheckCircle2;
  }
> = {
  AVAILABLE: {
    label: "Disponible",
    color: "bg-emerald-500",
    led: "live",
    icon: CheckCircle2,
  },
  ASSIGNED: {
    label: "Asignado",
    color: "bg-blue-500",
    led: "live",
    icon: User,
  },
  IN_ROUTE: {
    label: "En ruta",
    color: "bg-green-500",
    led: "live",
    icon: CheckCircle2,
  },
  ON_PAUSE: {
    label: "En pausa",
    color: "bg-amber-500",
    led: "warn",
    icon: Clock,
  },
  COMPLETED: {
    label: "Completado",
    color: "bg-emerald-500",
    led: "live",
    icon: CheckCircle2,
  },
  UNAVAILABLE: {
    label: "No disponible",
    color: "bg-gray-500",
    led: "idle",
    icon: User,
  },
  ABSENT: {
    label: "Ausente",
    color: "bg-red-500",
    led: "danger",
    icon: AlertTriangle,
  },
};

// Memoized to prevent re-renders when parent state changes
export const DriverListItem = memo(function DriverListItem({
  id: _id,
  name,
  status,
  fleetName,
  fleetNames,
  hasRoute,
  vehiclePlate,
  progress,
  alerts,
  onClick,
  onChat,
  isSelected = false,
  compact = false,
  currentLocation,
}: DriverListItemProps) {
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.UNAVAILABLE;
  const StatusIcon = statusConfig.icon;
  const ledStatus = alerts.length > 0 ? "danger" : statusConfig.led;
  const battery = currentLocation?.batteryLevel ?? null;
  const isRecent = currentLocation?.isRecent ?? false;

  if (compact) {
    return (
      // Row stays a div so the inner chat button isn't a button-in-button
      // (invalid HTML). role=button + tabIndex + onKeyDown bring back the
      // keyboard semantics that <button> would have given us for free.
      // biome-ignore lint/a11y/useSemanticElements: a real <button> would nest the chat button — invalid HTML
      <div
        role="button"
        tabIndex={0}
        aria-label={name}
        className={cn(
          "group relative px-2.5 py-2 cursor-pointer transition-colors border-l-2 focus:outline-none focus-visible:bg-[oklch(0.22_0_0)]",
          isSelected
            ? "bg-[oklch(0.22_0_0)] border-l-[var(--cockpit-live)]"
            : "border-l-transparent hover:bg-[oklch(0.2_0_0)]",
        )}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            role="img"
            aria-label={statusConfig.label}
            className="cockpit-led shrink-0"
            data-status={ledStatus === "live" ? undefined : ledStatus}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm truncate">{name}</span>
              {vehiclePlate && (
                <span className="cockpit-mono text-[10px] text-muted-foreground px-1.5 py-0.5 border border-border/60 rounded-sm shrink-0">
                  {vehiclePlate}
                </span>
              )}
            </div>

            {hasRoute && progress.totalStops > 0 ? (
              <div className="flex items-center gap-2 mt-1.5">
                <Progress
                  value={progress.percentage}
                  className="h-[3px] flex-1"
                />
                <span className="cockpit-mono text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {progress.completedStops}/{progress.totalStops}
                </span>
              </div>
            ) : (
              <div className="cockpit-label mt-0.5">{statusConfig.label}</div>
            )}

            {(battery !== null || alerts.length > 0) && (
              <div className="flex items-center gap-2 mt-1.5">
                {battery !== null && isRecent && (
                  <span
                    className={cn(
                      "cockpit-mono inline-flex items-center gap-0.5 text-[10px]",
                      battery > 50
                        ? "text-[var(--cockpit-live)]"
                        : battery > 20
                          ? "text-amber-400"
                          : "text-red-400",
                    )}
                  >
                    <Battery className="size-2.5" />
                    {battery}%
                  </span>
                )}
                {alerts.length > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-red-400">
                    <AlertTriangle className="size-2.5" />
                    {alerts.length}
                  </span>
                )}
              </div>
            )}
          </div>

          {onChat && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onChat();
              }}
              aria-label="Chatear"
            >
              <MessageSquare className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Full version
  return (
    <Card
      className={cn(
        "transition-all cursor-pointer",
        isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-accent/50",
      )}
      onClick={onClick}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Driver Info */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Status Indicator */}
            <div
              className={cn(
                "mt-1 size-2 rounded-full flex-shrink-0",
                statusConfig.color,
              )}
            />

            {/* Driver Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium truncate">{name}</h3>
                {(fleetNames && fleetNames.length > 0
                  ? fleetNames
                  : [fleetName]
                ).map((fn) => (
                  <Badge key={fn} variant="outline" className="text-xs">
                    {fn}
                  </Badge>
                ))}
              </div>

              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <StatusIcon className="size-3" />
                  <span>{statusConfig.label}</span>
                </div>
                {hasRoute && vehiclePlate && <span>• {vehiclePlate}</span>}
                {currentLocation?.batteryLevel != null &&
                  currentLocation.isRecent && (
                    <span
                      className={cn(
                        "text-xs",
                        currentLocation.batteryLevel > 50
                          ? "text-green-500"
                          : currentLocation.batteryLevel > 20
                            ? "text-amber-500"
                            : "text-red-500",
                      )}
                    >
                      {currentLocation.batteryLevel}%
                    </span>
                  )}
              </div>

              {/* Progress for drivers with routes */}
              {hasRoute && progress.totalStops > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progreso</span>
                    <span>
                      {progress.completedStops} / {progress.totalStops}
                    </span>
                  </div>
                  <Progress value={progress.percentage} className="h-1.5" />
                </div>
              )}

              {/* Alerts */}
              {alerts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {alerts.map((alert) => (
                    <Badge
                      key={alert}
                      variant="destructive"
                      className="text-xs"
                    >
                      <AlertTriangle className="size-3 mr-1" />
                      {alert}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Chevron */}
          <ChevronRight className="size-5 text-muted-foreground flex-shrink-0" />
        </div>
      </div>
    </Card>
  );
});
