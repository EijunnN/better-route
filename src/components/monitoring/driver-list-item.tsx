"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

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
  hasRoute: boolean;
  vehiclePlate: string | null;
  progress: DriverProgress;
  alerts: string[];
  onClick: () => void;
}

const STATUS_CONFIG = {
  AVAILABLE: {
    label: "Available",
    color: "bg-emerald-500",
    icon: CheckCircle2,
  },
  ASSIGNED: { label: "Assigned", color: "bg-blue-500", icon: User },
  IN_ROUTE: { label: "In Route", color: "bg-green-500", icon: CheckCircle2 },
  ON_PAUSE: { label: "On Pause", color: "bg-amber-500", icon: Clock },
  COMPLETED: {
    label: "Completed",
    color: "bg-emerald-500",
    icon: CheckCircle2,
  },
  UNAVAILABLE: { label: "Unavailable", color: "bg-gray-500", icon: User },
  ABSENT: { label: "Absent", color: "bg-red-500", icon: AlertTriangle },
};

export function DriverListItem({
  id,
  name,
  status,
  fleetName,
  hasRoute,
  vehiclePlate,
  progress,
  alerts,
  onClick,
}: DriverListItemProps) {
  const statusConfig =
    STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ||
    STATUS_CONFIG.UNAVAILABLE;
  const StatusIcon = statusConfig.icon;

  return (
    <Card
      className="hover:bg-accent/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Driver Info */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Status Indicator */}
            <div
              className={`mt-1 w-2 h-2 rounded-full ${statusConfig.color} flex-shrink-0`}
            />

            {/* Driver Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium truncate">{name}</h3>
                <Badge variant="outline" className="text-xs">
                  {fleetName}
                </Badge>
              </div>

              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <StatusIcon className="w-3 h-3" />
                  <span>{statusConfig.label}</span>
                </div>
                {hasRoute && vehiclePlate && <span>• {vehiclePlate}</span>}
              </div>

              {/* Progress for drivers with routes */}
              {hasRoute && progress.totalStops > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
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
                  {alerts.map((alert, index) => (
                    <Badge
                      key={index}
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
}
