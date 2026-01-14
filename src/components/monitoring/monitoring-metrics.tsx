"use client";

import { AlertTriangle, CheckCircle2, Clock, Route, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MonitoringMetrics {
  totalDrivers: number;
  driversInRoute: number;
  driversAvailable: number;
  driversOnPause: number;
  completedStops: number;
  totalStops: number;
  completenessPercentage: number;
  delayedStops: number;
  activeAlerts: number;
}

interface MonitoringMetricsProps {
  metrics: MonitoringMetrics;
}

export function MonitoringMetrics({ metrics }: MonitoringMetricsProps) {
  const metricCards = [
    {
      title: "Total Drivers",
      value: metrics.totalDrivers,
      icon: Users,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "In Route",
      value: metrics.driversInRoute,
      icon: Route,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Available",
      value: metrics.driversAvailable,
      icon: CheckCircle2,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "On Pause",
      value: metrics.driversOnPause,
      icon: Clock,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
  ];

  const progressMetrics = [
    {
      label: "Completed Stops",
      current: metrics.completedStops,
      total: metrics.totalStops,
      percentage: metrics.completenessPercentage,
      color: "bg-green-500",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Driver Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${card.bgColor}`}>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <span className="text-2xl font-bold">{card.value}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Completeness and Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Completeness Progress */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Route Completeness
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {progressMetrics.map((metric) => (
              <div key={metric.label} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{metric.label}</span>
                  <span className="font-medium">
                    {metric.current} / {metric.total} ({metric.percentage}%)
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${metric.color} transition-all duration-500`}
                    style={{ width: `${metric.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Alerts Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-lg ${metrics.activeAlerts > 0 ? "bg-red-500/10" : "bg-green-500/10"}`}
              >
                <AlertTriangle
                  className={`w-6 h-6 ${metrics.activeAlerts > 0 ? "text-red-500" : "text-green-500"}`}
                />
              </div>
              <div>
                <div className="text-2xl font-bold">{metrics.activeAlerts}</div>
                {metrics.delayedStops > 0 && (
                  <Badge variant="destructive" className="mt-1">
                    {metrics.delayedStops} delayed stops
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
