"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  type LucideIcon,
} from "lucide-react";

export interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    label?: string;
  };
  status?: "success" | "warning" | "error" | "neutral";
  className?: string;
}

const statusColors = {
  success: "text-green-500 bg-green-50 dark:bg-green-950",
  warning: "text-amber-500 bg-amber-50 dark:bg-amber-950",
  error: "text-red-500 bg-red-50 dark:bg-red-950",
  neutral: "text-slate-500 bg-slate-50 dark:bg-slate-900",
};

const iconBgColors = {
  success: "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400",
  warning: "bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400",
  error: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400",
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  status = "neutral",
  className,
}: KpiCardProps) {
  const TrendIcon =
    trend?.value !== undefined
      ? trend.value > 0
        ? TrendingUp
        : trend.value < 0
          ? TrendingDown
          : Minus
      : null;

  const trendColor =
    trend?.value !== undefined
      ? trend.value > 0
        ? "text-green-500"
        : trend.value < 0
          ? "text-red-500"
          : "text-slate-400"
      : "";

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {title}
          </p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div
            className={cn(
              "rounded-lg p-2",
              iconBgColors[status],
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>

      {trend !== undefined && TrendIcon && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          <TrendIcon className={cn("h-3 w-3", trendColor)} />
          <span className={cn("font-medium", trendColor)}>
            {trend.value > 0 ? "+" : ""}
            {trend.value}%
          </span>
          {trend.label && (
            <span className="text-muted-foreground">{trend.label}</span>
          )}
        </div>
      )}
    </div>
  );
}

export interface KpiGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

export function KpiGrid({
  children,
  columns = 4,
  className,
}: KpiGridProps) {
  const gridCols = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className={cn("grid gap-4", gridCols[columns], className)}>
      {children}
    </div>
  );
}
