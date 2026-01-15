"use client";

import { AlertCircle, ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  JobProgress,
  type OptimizationJobData,
} from "@/components/optimization/job-progress";
import { OptimizationResultsDashboard } from "@/components/optimization/optimization-results-dashboard";
import { useFullScreenLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

interface OptimizationResult {
  routes: Array<{
    routeId: string;
    vehicleId: string;
    vehiclePlate: string;
    driverId?: string;
    driverName?: string;
    driverOrigin?: {
      latitude: string;
      longitude: string;
      address?: string;
    };
    stops: Array<{
      orderId: string;
      trackingId: string;
      sequence: number;
      address: string;
      latitude: string;
      longitude: string;
      estimatedArrival?: string;
      timeWindow?: {
        start: string;
        end: string;
      };
    }>;
    totalDistance: number;
    totalDuration: number;
    totalWeight: number;
    totalVolume: number;
    utilizationPercentage: number;
    timeWindowViolations: number;
    geometry?: string;
    assignmentQuality?: {
      score: number;
      warnings: string[];
      errors: string[];
    };
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
  assignmentMetrics?: {
    totalAssignments: number;
    assignmentsWithWarnings: number;
    assignmentsWithErrors: number;
    averageScore: number;
    skillCoverage: number;
    licenseCompliance: number;
    fleetAlignment: number;
    workloadBalance: number;
  };
  summary: {
    optimizedAt: string;
    objective: string;
    processingTimeMs: number;
  };
  depot?: {
    latitude: number;
    longitude: number;
  };
  isPartial?: boolean;
}

function ResultsPageContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { companyId, isLoading: isAuthLoading } = useAuth();
  const configId = params.id as string;
  const existingJobId = searchParams.get("jobId");
  const reoptimize = searchParams.get("reoptimize") === "true";

  // Use full-screen layout (hide header, remove padding)
  useFullScreenLayout();

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<OptimizationJobData | null>(null);
  const [isStartingJob, setIsStartingJob] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [viewMode, setViewMode] = useState<"existing" | "new">(() => {
    return existingJobId ? "existing" : "new";
  });

  // Start optimization job when component mounts and companyId is available
  useEffect(() => {
    if (!companyId) return;

    // If viewing an existing job, fetch its data
    if (existingJobId && viewMode === "existing" && !reoptimize) {
      const fetchExistingJob = async () => {
        setIsStartingJob(true);
        setStartError(null);

        try {
          const response = await fetch(
            `/api/optimization/jobs/${existingJobId}`,
            {
              headers: { "x-company-id": companyId },
            },
          );

          if (!response.ok) {
            throw new Error("Job not found");
          }

          const data = await response.json();
          const job = data.data;

          setJobId(job.id);
          setJobData(job);

          // If job has results, load them
          if (job.result) {
            setResult(job.result as OptimizationResult);
          } else if (job.status === "COMPLETED" || job.status === "CANCELLED") {
            // Job is done but no results - treat as error
            setStartError("Job completed but no results available");
          }
        } catch (err) {
          setStartError(
            err instanceof Error ? err.message : "Failed to load job",
          );
        } finally {
          setIsStartingJob(false);
        }
      };

      fetchExistingJob();
      return;
    }

    // Otherwise, start a new optimization job
    const startOptimization = async () => {
      setIsStartingJob(true);
      setStartError(null);

      try {
        // First, fetch the configuration to get vehicle and driver IDs
        const configResponse = await fetch(
          `/api/optimization/configure/${configId}`,
          {
            headers: {
              "x-company-id": companyId,
            },
          },
        );

        if (!configResponse.ok) {
          throw new Error("Configuration not found");
        }

        const configData = await configResponse.json();
        const config = configData.data;

        // Parse the JSON arrays from the configuration
        const vehicleIds = JSON.parse(config.selectedVehicleIds);
        const driverIds = JSON.parse(config.selectedDriverIds);

        // Now start the optimization job
        const response = await fetch("/api/optimization/jobs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": companyId,
          },
          body: JSON.stringify({
            configurationId: configId,
            companyId: companyId,
            vehicleIds,
            driverIds,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to start optimization");
        }

        const data = await response.json();
        setJobId(data.data.id);
        setJobData({
          id: data.data.id,
          configurationId: configId,
          status: "PENDING",
          progress: 0,
          startedAt: null,
          completedAt: null,
          cancelledAt: null,
          timeoutMs: 300000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        setStartError(
          err instanceof Error ? err.message : "Failed to start optimization",
        );
      } finally {
        setIsStartingJob(false);
      }
    };

    startOptimization();
  }, [configId, viewMode, existingJobId, reoptimize, companyId]);

  const handleJobComplete = (jobResult: unknown) => {
    setResult(jobResult as OptimizationResult);
  };

  const handleJobError = (error: string) => {
    setStartError(error);
  };

  const handleReoptimize = () => {
    // Reset state and start new job with same configuration
    setResult(null);
    setJobId(null);
    setJobData(null);
    setStartError(null);
    setViewMode("new");

    // Force re-run of the effect by navigating to the same URL without jobId
    router.push(`/planificacion/${configId}/results?reoptimize=true`);
  };

  const handleConfirm = async () => {
    // TODO: Implement plan confirmation
    console.log("Confirming plan with result:", result);
    alert("Plan confirmation will be implemented in Story 9.3");
  };

  if (isAuthLoading || !companyId || isStartingJob) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-full max-w-md">
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg font-medium">
                {isAuthLoading ? "Cargando..." : "Iniciando optimización..."}
              </p>
              <p className="text-sm text-muted-foreground">
                Preparando el trabajo de optimización de rutas
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (startError) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-full max-w-md">
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <p className="text-lg font-medium">Error en la optimización</p>
              <p className="text-sm text-muted-foreground text-center">
                {startError}
              </p>
              <div className="flex gap-3 mt-4">
                <Button variant="outline" onClick={handleReoptimize}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reintentar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push("/planificacion")}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Volver
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show job progress while running
  if (jobId && !result && companyId) {
    return (
      <div className="flex flex-col h-full">
        {/* Minimal header for progress view */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/planificacion")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
            <h1 className="text-lg font-semibold">Optimizando rutas...</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-2xl">
            <JobProgress
              jobId={jobId}
              onComplete={handleJobComplete}
              onError={handleJobError}
              companyId={companyId}
            />
          </div>
        </div>
      </div>
    );
  }

  // Show results dashboard
  if (result) {
    return (
      <OptimizationResultsDashboard
        jobId={jobId || undefined}
        result={result}
        isPartial={result.isPartial}
        jobStatus={jobData?.status}
        onReoptimize={handleReoptimize}
        onConfirm={handleConfirm}
        onBack={() => router.push("/planificacion")}
      />
    );
  }

  return null;
}

export default function PlanificacionResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      }
    >
      <ResultsPageContent />
    </Suspense>
  );
}
