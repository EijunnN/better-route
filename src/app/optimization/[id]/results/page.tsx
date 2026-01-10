"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { OptimizationResults } from "@/components/optimization/optimization-results";
import { JobProgress, type OptimizationJobData } from "@/components/optimization/job-progress";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, AlertCircle, Clock, History, CheckCircle2 } from "lucide-react";

const DEFAULT_COMPANY_ID = "default-company";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

function ResultsPageContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const configId = params.id as string;
  const existingJobId = searchParams.get("jobId");
  const reoptimize = searchParams.get("reoptimize") === "true";

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<OptimizationJobData | null>(null);
  const [isStartingJob, setIsStartingJob] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"existing" | "new">(() => {
    return existingJobId ? "existing" : "new";
  });

  // Start optimization job when component mounts
  useEffect(() => {
    // If viewing an existing job, fetch its data
    if (existingJobId && viewMode === "existing" && !reoptimize) {
      const fetchExistingJob = async () => {
        setIsStartingJob(true);
        setStartError(null);

        try {
          const response = await fetch(`/api/optimization/jobs/${existingJobId}`, {
            headers: { "x-company-id": DEFAULT_COMPANY_ID },
          });

          if (!response.ok) {
            throw new Error("Job not found");
          }

          const data = await response.json();
          const job = data.data;

          setJobId(job.id);
          setJobData(job);

          // If job has results, load them
          if (job.result) {
            setResult(job.result);
          } else if (job.status === "COMPLETED" || job.status === "CANCELLED") {
            // Job is done but no results - treat as error
            setStartError("Job completed but no results available");
          }
        } catch (err) {
          setStartError(err instanceof Error ? err.message : "Failed to load job");
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
        const configResponse = await fetch(`/api/optimization/configure/${configId}`, {
          headers: {
            "x-company-id": DEFAULT_COMPANY_ID,
          },
        });

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
            "x-company-id": DEFAULT_COMPANY_ID,
          },
          body: JSON.stringify({
            configurationId: configId,
            companyId: DEFAULT_COMPANY_ID,
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
        setStartError(err instanceof Error ? err.message : "Failed to start optimization");
      } finally {
        setIsStartingJob(false);
      }
    };

    startOptimization();
  }, [configId, viewMode, existingJobId, reoptimize]);

  const handleJobComplete = (jobResult: any) => {
    setResult(jobResult);
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
    router.push(`/optimization/${configId}/results?reoptimize=true`);
  };

  const handleConfirm = async () => {
    // TODO: Implement plan confirmation
    console.log("Confirming plan with result:", result);
    alert("Plan confirmation will be implemented in Story 9.3");
  };

  if (isStartingJob) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="w-full max-w-md">
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-lg font-medium">Starting optimization...</p>
                <p className="text-sm text-muted-foreground">
                  Preparing your route optimization job
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (startError) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="w-full max-w-md">
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4">
                <AlertCircle className="h-12 w-12 text-destructive" />
                <p className="text-lg font-medium">Optimization Failed</p>
                <p className="text-sm text-muted-foreground text-center">{startError}</p>
                <div className="flex gap-3 mt-4">
                  <Button variant="outline" onClick={handleReoptimize}>
                    Try Again
                  </Button>
                  <Button variant="outline" onClick={() => router.push("/optimization")}>
                    Back to Configuration
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/optimization")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Link href="/optimization/history">
              <Button variant="outline" size="sm">
                <History className="h-4 w-4 mr-2" />
                History
              </Button>
            </Link>
          </div>
          {/* Status badge for viewing existing jobs */}
          {existingJobId && jobData && (
            <Badge
              className={
                jobData.status === "CANCELLED"
                  ? "bg-orange-500/10 text-orange-700 border-orange-500/20"
                  : jobData.status === "COMPLETED"
                  ? "bg-green-500/10 text-green-700 border-green-500/20"
                  : "bg-blue-500/10 text-blue-700 border-blue-500/20"
              }
            >
              {jobData.status === "CANCELLED" && <Clock className="w-3 h-3 mr-1" />}
              {jobData.status === "COMPLETED" && <CheckCircle2 className="w-3 h-3 mr-1" />}
              {jobData.status === "CANCELLED"
                ? "Cancelled"
                : jobData.status === "COMPLETED"
                ? "Completed"
                : jobData.status.toLowerCase()}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">Optimization Results</h1>
          {result?.isPartial && (
            <Badge variant="outline" className="text-orange-600 border-orange-600">
              Partial Results
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-2">
          {result?.isPartial
            ? "This optimization was cancelled. Showing partial results that were computed before cancellation."
            : "Review the generated routes and confirm or reoptimize as needed."}
        </p>
      </div>

      {/* Job Progress */}
      {jobId && !result && (
        <JobProgress
          jobId={jobId}
          apiUrl={API_URL || ""}
          onComplete={handleJobComplete}
          onError={handleJobError}
          companyId={DEFAULT_COMPANY_ID}
        />
      )}

      {/* Results */}
      {result && (
        <OptimizationResults
          result={result}
          onReoptimize={handleReoptimize}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

export default function OptimizationResultsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
      <ResultsPageContent />
    </Suspense>
  );
}
