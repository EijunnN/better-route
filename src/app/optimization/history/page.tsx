"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpDown,
  Eye,
  RotateCcw,
} from "lucide-react";

const DEFAULT_COMPANY_ID = "default-company";

interface OptimizationJob {
  id: string;
  configurationId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  result?: OptimizationResult;
  configuration?: {
    name: string;
    objective: string;
  };
}

interface OptimizationResult {
  routes: Array<{
    routeId: string;
    vehicleId: string;
    vehiclePlate: string;
    driverId?: string;
    driverName?: string;
    totalDistance: number;
    totalDuration: number;
    totalStops: number;
    utilizationPercentage: number;
    timeWindowViolations: number;
  }>;
  unassignedOrders: Array<{
    orderId: string;
    trackingId: string;
    reason: string;
  }>;
  metrics: {
    totalDistance: number;
    totalDuration: number;
    totalRoutes: number;
    totalStops: number;
    utilizationRate: number;
    timeWindowComplianceRate: number;
  };
  summary: {
    optimizedAt: string;
    objective: string;
    processingTimeMs: number;
  };
  isPartial?: boolean;
}

const STATUS_CONFIG = {
  COMPLETED: {
    label: "Completed",
    color: "bg-green-500/10 text-green-700 border-green-500/20",
    icon: "check-circle",
  },
  FAILED: {
    label: "Failed",
    color: "bg-red-500/10 text-red-700 border-red-500/20",
    icon: "x-circle",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "bg-orange-500/10 text-orange-700 border-orange-500/20",
    icon: "x-circle",
  },
  RUNNING: {
    label: "Running",
    color: "bg-blue-500/10 text-blue-700 border-blue-500/20",
    icon: "clock",
  },
  PENDING: {
    label: "Pending",
    color: "bg-gray-500/10 text-gray-700 border-gray-500/20",
    icon: "clock",
  },
};

function StatusIcon({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case "check-circle":
      return <CheckCircle2 className={className} />;
    case "x-circle":
      return <XCircle className={className} />;
    case "clock":
      return <Clock className={className} />;
    default:
      return null;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString();
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function CompareValue({
  value,
  compareValue,
  format,
}: {
  value: number;
  compareValue?: number;
  format: (v: number) => string;
}) {
  if (compareValue === undefined) {
    return <span>{format(value)}</span>;
  }

  const diff = value - compareValue;
  const percent = compareValue !== 0 ? (diff / compareValue) * 100 : 0;

  if (Math.abs(diff) < 0.01) {
    return (
      <span className="flex items-center gap-1">
        <span>{format(value)}</span>
        <Minus className="w-3 h-3 text-muted-foreground" />
      </span>
    );
  }

  const isGood = diff < 0; // Lower is better for distance and time
  const Icon = isGood ? TrendingDown : TrendingUp;
  const colorClass = isGood ? "text-green-600" : "text-red-600";

  return (
    <span className={`flex items-center gap-1 ${colorClass}`}>
      <span>{format(value)}</span>
      <Icon className="w-3 h-3" />
      <span className="text-xs">{Math.abs(percent).toFixed(1)}%</span>
    </span>
  );
}

export default function OptimizationHistoryPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<OptimizationJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    loadJobs();
  }, [statusFilter]);

  const loadJobs = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      params.append("limit", "50");
      params.append("offset", "0");

      const response = await fetch(`/api/optimization/jobs?${params}`, {
        headers: { "x-company-id": DEFAULT_COMPANY_ID },
      });

      if (!response.ok) throw new Error("Failed to load jobs");

      const data = await response.json();
      const jobsWithDetails = await Promise.all(
        (data.data || []).map(async (job: OptimizationJob) => {
          // Fetch configuration details
          let config = null;
          if (job.configurationId) {
            try {
              const configResponse = await fetch(
                `/api/optimization/configure/${job.configurationId}`,
                {
                  headers: { "x-company-id": DEFAULT_COMPANY_ID },
                }
              );
              if (configResponse.ok) {
                const configData = await configResponse.json();
                config = configData.data;
              }
            } catch {
              // Ignore config fetch errors
            }
          }

          return {
            ...job,
            configuration: config,
          };
        })
      );

      setJobs(jobsWithDetails);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReoptimize = async (job: OptimizationJob) => {
    if (!job.configurationId) {
      setError("Cannot re-optimize: configuration not found");
      return;
    }

    // Navigate to the results page with the existing configuration
    // This will trigger a new optimization with the same settings
    router.push(`/optimization/${job.configurationId}/results?reoptimize=true`);
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobIds((prev) =>
      prev.includes(jobId)
        ? prev.filter((id) => id !== jobId)
        : [...prev, jobId].slice(0, 2) // Max 2 for comparison
    );
  };

  const filteredJobs = jobs.filter((job) => {
    if (statusFilter === "all") return true;
    return job.status === statusFilter;
  });

  const selectedJobs = jobs.filter((j) => selectedJobIds.includes(j.id));
  const job1 = selectedJobs[0];
  const job2 = selectedJobs[1];

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">Optimization History</h1>
            <p className="text-muted-foreground mt-2">
              View and compare past optimization runs
            </p>
          </div>
          <Link href="/optimization">
            <Button variant="outline">
              <RotateCcw className="w-4 h-4 mr-2" />
              New Optimization
            </Button>
          </Link>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2">
          {["all", "COMPLETED", "CANCELLED", "FAILED", "RUNNING", "PENDING"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg capitalize transition-colors ${
                statusFilter === status
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredJobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No optimization jobs found.{" "}
              <Link href="/optimization" className="text-primary hover:underline">
                Create your first optimization
              </Link>
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Comparison Section */}
          {selectedJobIds.length >= 2 && job1 && job2 && (
            <Card className="border-primary/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ArrowUpDown className="w-5 h-5" />
                      Side-by-Side Comparison
                    </CardTitle>
                    <CardDescription>
                      Comparing results between two optimization runs
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedJobIds([])}
                  >
                    Clear
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-8">
                  {/* Job 1 */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Badge className={STATUS_CONFIG[job1.status].color}>
                        <StatusIcon name={STATUS_CONFIG[job1.status].icon} className="w-3 h-3 mr-1" />
                        {STATUS_CONFIG[job1.status].label}
                      </Badge>
                      {job1.result?.isPartial && (
                        <Badge variant="outline">Partial Results</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(job1.completedAt || job1.cancelledAt || job1.createdAt)}
                    </p>
                    {job1.configuration && (
                      <p className="text-sm font-medium">{job1.configuration.name}</p>
                    )}

                    {job1.result && (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Routes:</span>
                          <span className="font-medium">{job1.result.metrics.totalRoutes}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Stops:</span>
                          <span className="font-medium">{job1.result.metrics.totalStops}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Distance:</span>
                          <span className="font-medium">
                            {formatDistance(job1.result.metrics.totalDistance)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Duration:</span>
                          <span className="font-medium">
                            {formatDuration(job1.result.metrics.totalDuration * 1000)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Utilization:</span>
                          <span className="font-medium">
                            {job1.result.metrics.utilizationRate}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Compliance:</span>
                          <span className="font-medium">
                            {job1.result.metrics.timeWindowComplianceRate}%
                          </span>
                        </div>
                        {job1.result.unassignedOrders.length > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Unassigned:</span>
                            <span className="font-medium text-orange-600">
                              {job1.result.unassignedOrders.length}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Job 2 */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Badge className={STATUS_CONFIG[job2.status].color}>
                        <StatusIcon name={STATUS_CONFIG[job2.status].icon} className="w-3 h-3 mr-1" />
                        {STATUS_CONFIG[job2.status].label}
                      </Badge>
                      {job2.result?.isPartial && (
                        <Badge variant="outline">Partial Results</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(job2.completedAt || job2.cancelledAt || job2.createdAt)}
                    </p>
                    {job2.configuration && (
                      <p className="text-sm font-medium">{job2.configuration.name}</p>
                    )}

                    {job2.result && job1.result && (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Routes:</span>
                          <CompareValue
                            value={job2.result.metrics.totalRoutes}
                            compareValue={job1.result.metrics.totalRoutes}
                            format={(v) => v.toString()}
                          />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Stops:</span>
                          <CompareValue
                            value={job2.result.metrics.totalStops}
                            compareValue={job1.result.metrics.totalStops}
                            format={(v) => v.toString()}
                          />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Distance:</span>
                          <CompareValue
                            value={job2.result.metrics.totalDistance}
                            compareValue={job1.result.metrics.totalDistance}
                            format={formatDistance}
                          />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Duration:</span>
                          <CompareValue
                            value={job2.result.metrics.totalDuration * 1000}
                            compareValue={job1.result.metrics.totalDuration * 1000}
                            format={formatDuration}
                          />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Utilization:</span>
                          <CompareValue
                            value={job2.result.metrics.utilizationRate}
                            compareValue={job1.result.metrics.utilizationRate}
                            format={(v) => `${v}%`}
                          />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Compliance:</span>
                          <CompareValue
                            value={job2.result.metrics.timeWindowComplianceRate}
                            compareValue={job1.result.metrics.timeWindowComplianceRate}
                            format={(v) => `${v}%`}
                          />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Unassigned:</span>
                          <CompareValue
                            value={job2.result.unassignedOrders.length}
                            compareValue={job1.result.unassignedOrders.length}
                            format={(v) => v.toString()}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Jobs List */}
          <div className="space-y-3">
            {filteredJobs.map((job) => {
              const statusConfig = STATUS_CONFIG[job.status];
              const isSelected = selectedJobIds.includes(job.id);
              const hasResult = job.result && (job.status === "COMPLETED" || job.status === "CANCELLED");

              return (
                <Card
                  key={job.id}
                  className={`transition-all cursor-pointer hover:shadow-md ${
                    isSelected ? "ring-2 ring-primary" : ""
                  } ${job.status === "CANCELLED" ? "border-orange-500/50" : ""}`}
                  onClick={() => hasResult && toggleJobSelection(job.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        {/* Selection Checkbox */}
                        {hasResult && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleJobSelection(job.id);
                            }}
                            className="w-4 h-4"
                          />
                        )}

                        {/* Status Badge */}
                        <Badge className={statusConfig.color}>
                          <StatusIcon name={statusConfig.icon} className="w-3 h-3 mr-1" />
                          {statusConfig.label}
                        </Badge>

                        {/* Partial Results Indicator */}
                        {job.result?.isPartial && (
                          <Badge variant="outline" className="text-orange-600 border-orange-600">
                            Partial
                          </Badge>
                        )}

                        {/* Configuration Name */}
                        <div className="flex-1">
                          {job.configuration ? (
                            <>
                              <p className="font-medium">{job.configuration.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {job.configuration.objective}
                              </p>
                            </>
                          ) : (
                            <p className="text-muted-foreground">Configuration {job.configurationId?.slice(0, 8)}...</p>
                          )}
                        </div>

                        {/* Result Metrics */}
                        {job.result && (
                          <div className="flex items-center gap-6 text-sm">
                            <div className="text-center">
                              <p className="text-muted-foreground">Routes</p>
                              <p className="font-medium">{job.result.metrics.totalRoutes}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-muted-foreground">Stops</p>
                              <p className="font-medium">{job.result.metrics.totalStops}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-muted-foreground">Distance</p>
                              <p className="font-medium">
                                {formatDistance(job.result.metrics.totalDistance)}
                              </p>
                            </div>
                            {job.result.unassignedOrders.length > 0 && (
                              <div className="text-center">
                                <p className="text-muted-foreground">Unassigned</p>
                                <p className="font-medium text-orange-600">
                                  {job.result.unassignedOrders.length}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Timestamp */}
                        <div className="text-sm text-muted-foreground w-40 text-right">
                          <p>{formatDate(job.completedAt || job.cancelledAt || job.createdAt)}</p>
                          {job.status === "RUNNING" && job.progress > 0 && (
                            <p className="text-xs">{job.progress}%</p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 ml-4">
                        {job.status === "COMPLETED" || job.status === "CANCELLED" ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/optimization/${job.configurationId}/results?jobId=${job.id}`);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {job.configurationId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReoptimize(job);
                                }}
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            )}
                          </>
                        ) : job.status === "RUNNING" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/optimization/${job.configurationId}/results?jobId=${job.id}`);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                            View Progress
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Selection Hint */}
          {selectedJobIds.length > 0 && selectedJobIds.length < 2 && (
            <div className="text-center text-sm text-muted-foreground">
              Select one more job to compare results
            </div>
          )}
        </div>
      )}
    </div>
  );
}
