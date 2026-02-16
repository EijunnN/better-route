"use client";

import { memo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  isSelected?: boolean;
  compact?: boolean;
  currentLocation?: {
    batteryLevel: number | null;
    isMoving: boolean | null;
    speed: number | null;
    isRecent: boolean;
  } | null;
}

const STATUS_CONFIG = {
  AVAILABLE: {
    label: "Disponible",
    color: "bg-emerald-500",
    icon: CheckCircle2,
  },
  ASSIGNED: { label: "Asignado", color: "bg-blue-500", icon: User },
  IN_ROUTE: { label: "En Ruta", color: "bg-green-500", icon: CheckCircle2 },
  ON_PAUSE: { label: "En Pausa", color: "bg-amber-500", icon: Clock },
  COMPLETED: {
    label: "Completado",
    color: "bg-emerald-500",
    icon: CheckCircle2,
  },
  UNAVAILABLE: { label: "No Disponible", color: "bg-gray-500", icon: User },
  ABSENT: { label: "Ausente", color: "bg-red-500", icon: AlertTriangle },
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
  isSelected = false,
  compact = false,
  currentLocation,
}: DriverListItemProps) {
  const statusConfig =
    STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ||
    STATUS_CONFIG.UNAVAILABLE;
  const StatusIcon = statusConfig.icon;

  if (compact) {
    return (
      <div
        className={cn(
          "p-2.5 rounded-lg cursor-pointer transition-all",
          isSelected
            ? "bg-primary/10 ring-1 ring-primary"
            : "hover:bg-accent/50"
        )}
        onClick={onClick}
      >
        <div className="flex items-center gap-2">
          {/* Status dot */}
          <div className={cn("w-2 h-2 rounded-full shrink-0", statusConfig.color)} />

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm truncate">{name}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {currentLocation?.batteryLevel != null && currentLocation.isRecent && (
                  <span className={cn(
                    "text-xs shrink-0",
                    currentLocation.batteryLevel > 50 ? "text-green-500" :
                    currentLocation.batteryLevel > 20 ? "text-amber-500" : "text-red-500"
                  )}>
                    {currentLocation.batteryLevel}%
                  </span>
                )}
                {vehiclePlate && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {vehiclePlate}
                  </span>
                )}
              </div>
            </div>

            {/* Progress bar for drivers with routes */}
            {hasRoute && progress.totalStops > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <Progress value={progress.percentage} className="h-1 flex-1" />
                <span className="text-xs text-muted-foreground shrink-0">
                  {progress.completedStops}/{progress.totalStops}
                </span>
              </div>
            )}

            {/* Show status if no route */}
            {!hasRoute && (
              <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                <StatusIcon className="w-3 h-3" />
                <span>{statusConfig.label}</span>
              </div>
            )}
          </div>

          {/* Alert indicator */}
          {alerts.length > 0 && (
            <div className="shrink-0">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
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
        isSelected
          ? "ring-2 ring-primary bg-primary/5"
          : "hover:bg-accent/50"
      )}
      onClick={onClick}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Driver Info */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Status Indicator */}
            <div
              className={cn("mt-1 w-2 h-2 rounded-full flex-shrink-0", statusConfig.color)}
            />

            {/* Driver Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium truncate">{name}</h3>
                {(fleetNames && fleetNames.length > 0 ? fleetNames : [fleetName]).map((fn) => (
                  <Badge key={fn} variant="outline" className="text-xs">
                    {fn}
                  </Badge>
                ))}
              </div>

              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <StatusIcon className="w-3 h-3" />
                  <span>{statusConfig.label}</span>
                </div>
                {hasRoute && vehiclePlate && <span>• {vehiclePlate}</span>}
                {currentLocation?.batteryLevel != null && currentLocation.isRecent && (
                  <span className={cn(
                    "text-xs",
                    currentLocation.batteryLevel > 50 ? "text-green-500" :
                    currentLocation.batteryLevel > 20 ? "text-amber-500" : "text-red-500"
                  )}>
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
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {alert}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Chevron */}
          <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        </div>
      </div>
    </Card>
  );
});
