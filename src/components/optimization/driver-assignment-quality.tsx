"use client";

import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Shield,
  Star,
  TrendingUp,
  User,
  Users,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface AssignmentQuality {
  score: number;
  warnings: string[];
  errors: string[];
}

export interface DriverAssignmentDisplayProps {
  route: {
    routeId: string;
    vehicleId: string;
    vehiclePlate: string;
    driverId?: string;
    driverName?: string;
    assignmentQuality?: AssignmentQuality;
  };
  onReassignDriver?: (routeId: string, vehicleId: string) => void;
}

export function DriverAssignmentDisplay({
  route,
  onReassignDriver,
}: DriverAssignmentDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!route.driverId || !route.driverName) {
    return (
      <div className="p-3 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/20 flex items-center gap-3">
        <User className="h-4 w-4 text-orange-500 dark:text-orange-400" />
        <span className="text-sm text-orange-800 dark:text-orange-300">No driver assigned</span>
        {onReassignDriver && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => onReassignDriver(route.routeId, route.vehicleId)}
          >
            Assign Driver
          </Button>
        )}
      </div>
    );
  }

  const quality = route.assignmentQuality;
  const hasWarnings = quality?.warnings && quality.warnings.length > 0;
  const hasErrors = quality?.errors && quality.errors.length > 0;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return "Excellent";
    if (score >= 80) return "Good";
    if (score >= 60) return "Fair";
    return "Poor";
  };

  return (
    <div className="space-y-2">
      {/* Driver Info Header */}
      <button
        type="button"
        className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition-colors w-full text-left ${
          hasErrors
            ? "border-red-200 bg-red-50/50"
            : hasWarnings
              ? "border-yellow-200 bg-yellow-50/50"
              : "border-green-200 bg-green-50/50"
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{route.driverName}</span>
          {quality && (
            <Badge
              variant="outline"
              className={`${getScoreColor(quality.score)} border-current`}
            >
              <Star className="h-3 w-3 mr-1 fill-current" />
              {quality.score}/100
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasErrors && (
            <Badge variant="destructive" className="text-xs">
              <XCircle className="h-3 w-3 mr-1" />
              {quality.errors.length} error
              {quality.errors.length > 1 ? "s" : ""}
            </Badge>
          )}
          {hasWarnings && (
            <Badge
              variant="outline"
              className="text-xs border-yellow-300 text-yellow-700"
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              {quality.warnings.length} warning
              {quality.warnings.length > 1 ? "s" : ""}
            </Badge>
          )}
          {!hasErrors && !hasWarnings && quality && quality.score >= 80 && (
            <Badge
              variant="outline"
              className="text-xs border-green-300 text-green-700"
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Optimal
            </Badge>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded Details */}
      {isExpanded && quality && (
        <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
          {/* Score Breakdown */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Assignment Quality
            </span>
            <span
              className={`text-sm font-semibold ${getScoreColor(quality.score)}`}
            >
              {getScoreLabel(quality.score)} ({quality.score}/100)
            </span>
          </div>

          {/* Warnings */}
          {hasWarnings && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-yellow-700">Warnings:</p>
              <ul className="space-y-1">
                {quality.warnings.map((warning) => (
                  <li
                    key={warning}
                    className="text-xs text-yellow-600 flex items-start gap-1"
                  >
                    <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Errors */}
          {hasErrors && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-red-700">Errors:</p>
              <ul className="space-y-1">
                {quality.errors.map((error) => (
                  <li
                    key={error}
                    className="text-xs text-red-600 flex items-start gap-1"
                  >
                    <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* No Issues Message */}
          {!hasWarnings && !hasErrors && (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs">All requirements met</span>
            </div>
          )}

          {/* Reassign Button */}
          {onReassignDriver && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => onReassignDriver(route.routeId, route.vehicleId)}
            >
              Reassign Driver
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export interface AssignmentMetricsProps {
  metrics?: {
    totalAssignments: number;
    assignmentsWithWarnings: number;
    assignmentsWithErrors: number;
    averageScore: number;
    skillCoverage: number;
    licenseCompliance: number;
    fleetAlignment: number;
    workloadBalance: number;
  };
}

export function AssignmentMetricsCard({ metrics }: AssignmentMetricsProps) {
  if (!metrics) {
    return null;
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-50 border-green-200";
    if (score >= 60) return "bg-yellow-50 border-yellow-200";
    return "bg-red-50 border-red-200";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5" />
          Driver Assignment Quality
        </CardTitle>
        <CardDescription>
          Quality metrics for automatic driver assignments
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Overall Status */}
          <div
            className={`p-4 rounded-lg border ${getScoreBg(metrics.averageScore)}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                <span className="font-medium">Overall Assignment Quality</span>
              </div>
              <Badge
                variant="outline"
                className={`${getScoreColor(metrics.averageScore)} border-current text-sm px-3 py-1`}
              >
                {metrics.averageScore}/100
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.averageScore >= 80
                ? "Excellent driver matching with minimal issues"
                : metrics.averageScore >= 60
                  ? "Good driver matching with some concerns"
                  : "Poor driver matching - review recommended"}
            </p>
          </div>

          {/* Issue Counts */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border bg-red-50/50 border-red-200">
              <div className="flex items-center gap-2 text-red-700">
                <XCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Errors</span>
              </div>
              <p className="text-2xl font-bold text-red-700 mt-1">
                {metrics.assignmentsWithErrors}
              </p>
              <p className="text-xs text-red-600">
                of {metrics.totalAssignments} assignments
              </p>
            </div>
            <div className="p-3 rounded-lg border bg-yellow-50/50 border-yellow-200">
              <div className="flex items-center gap-2 text-yellow-700">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Warnings</span>
              </div>
              <p className="text-2xl font-bold text-yellow-700 mt-1">
                {metrics.assignmentsWithWarnings}
              </p>
              <p className="text-xs text-yellow-600">
                of {metrics.totalAssignments} assignments
              </p>
            </div>
          </div>

          {/* Detailed Metrics */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              Quality Breakdown
            </p>
            <div className="grid grid-cols-2 gap-3">
              <MetricItem
                icon={Shield}
                label="License Compliance"
                value={metrics.licenseCompliance}
              />
              <MetricItem
                icon={Star}
                label="Skill Coverage"
                value={metrics.skillCoverage}
              />
              <MetricItem
                icon={Users}
                label="Fleet Alignment"
                value={metrics.fleetAlignment}
              />
              <MetricItem
                icon={TrendingUp}
                label="Workload Balance"
                value={metrics.workloadBalance}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
}) {
  const getColor = (value: number) => {
    if (value >= 80) return "text-green-600";
    if (value >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
      <Icon className={`h-4 w-4 ${getColor(value)}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className={`text-sm font-semibold ${getColor(value)}`}>{value}%</p>
      </div>
    </div>
  );
}
