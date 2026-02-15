"use client";

import { AlertCircle, ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ProtectedPage } from "@/components/auth/protected-page";
import {
  JobProgress,
  type OptimizationJobData,
} from "@/components/optimization/job-progress";
import { OptimizationResultsDashboard } from "@/components/optimization/optimization-results-dashboard";
import { useFullScreenLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";

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
    latitude?: string;
    longitude?: string;
    address?: string;
  }>;
  vehiclesWithoutRoutes?: Array<{
    id: string;
    plate: string;
    originLatitude?: string;
    originLongitude?: string;
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
  const { effectiveCompanyId: companyId, isReady } = useCompanyContext();
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

  // Guard against React Strict Mode double-mounting creating duplicate jobs
  const jobStartedRef = useRef(false);

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
    if (jobStartedRef.current) return;
    jobStartedRef.current = true;

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
    jobStartedRef.current = false;

    // Force re-run of the effect by navigating to the same URL without jobId
    router.push(`/planificacion/${configId}/results?reoptimize=true`);
  };

  const [showPostConfirmDialog, setShowPostConfirmDialog] = useState(false);
  const { toast } = useToast();

  // Called by PlanConfirmationDialog's onConfirmed callback AFTER the dialog
  // already confirmed the plan via the API. This only handles post-confirm UI.
  const handleConfirm = () => {
    toast({
      title: "Plan confirmado",
      description: "Pedidos asignados exitosamente",
    });
    setShowPostConfirmDialog(true);
  };

  const handlePostConfirmAction = (action: "monitor" | "new" | "history") => {
    setShowPostConfirmDialog(false);
    switch (action) {
      case "monitor":
        router.push("/monitoring");
        break;
      case "new":
        router.push("/planificacion");
        break;
      case "history":
        router.push("/planificacion/historial");
        break;
    }
  };

  if (!isReady || isStartingJob) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-full max-w-md">
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg font-medium">
                {!isReady ? "Cargando..." : "Iniciando optimización..."}
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

  // Handler for in-place result updates (e.g., reassignment)
  const handleResultUpdate = (newResult: OptimizationResult) => {
    setResult(newResult);
  };

  // Show results dashboard
  if (result) {
    return (
      <>
        <OptimizationResultsDashboard
          jobId={jobId || undefined}
          result={result}
          isPartial={result.isPartial}
          jobStatus={jobData?.status}
          onReoptimize={handleReoptimize}
          onConfirm={handleConfirm}
          onBack={() => router.push("/planificacion")}
          onResultUpdate={handleResultUpdate}
        />

        {/* Dialog post-confirmación */}
        <Dialog open={showPostConfirmDialog} onOpenChange={setShowPostConfirmDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-green-600 flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Plan confirmado exitosamente
              </DialogTitle>
              <DialogDescription>
                Los pedidos han sido asignados a las rutas.
                ¿Qué deseas hacer ahora?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button
                className="w-full"
                onClick={() => handlePostConfirmAction("monitor")}
              >
                Ir al monitoreo
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handlePostConfirmAction("new")}
              >
                Crear nueva planificación
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => handlePostConfirmAction("history")}
              >
                Ver historial de planes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return null;
}

export default function PlanificacionResultsPage() {
  return (
    <ProtectedPage requiredPermission="plan:read">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        }
      >
        <ResultsPageContent />
      </Suspense>
    </ProtectedPage>
  );
}
