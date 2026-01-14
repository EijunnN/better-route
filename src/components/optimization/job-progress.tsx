"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export type JobStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface OptimizationJobData {
  id: string;
  configurationId: string;
  status: JobStatus;
  progress: number;
  result?: unknown;
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
}

interface JobProgressProps {
  jobId: string | null;
  onComplete?: (result: unknown) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  pollInterval?: number; // milliseconds
  companyId?: string;
  userId?: string;
}

const STATUS_ICONS: Record<JobStatus, React.ReactNode> = {
  PENDING: <Clock className="h-5 w-5 text-yellow-500" />,
  RUNNING: <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />,
  COMPLETED: <CheckCircle2 className="h-5 w-5 text-green-500" />,
  FAILED: <AlertCircle className="h-5 w-5 text-red-500" />,
  CANCELLED: <XCircle className="h-5 w-5 text-gray-500" />,
};

const STATUS_COLORS: Record<JobStatus, string> = {
  PENDING: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
  RUNNING: "bg-blue-500/10 text-blue-700 border-blue-200",
  COMPLETED: "bg-green-500/10 text-green-700 border-green-200",
  FAILED: "bg-red-500/10 text-red-700 border-red-200",
  CANCELLED: "bg-gray-500/10 text-gray-700 border-gray-200",
};

export function JobProgress({
  jobId,
  onComplete,
  onError,
  onCancel,
  pollInterval = 2000,
  companyId,
  userId,
}: JobProgressProps) {
  const [jobData, setJobData] = useState<OptimizationJobData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchJobStatus = useCallback(async () => {
    if (!jobId) return;

    try {
      const headers: Record<string, string> = {};
      if (companyId) headers["x-company-id"] = companyId;
      if (userId) headers["x-user-id"] = userId;

      const response = await fetch(`/api/optimization/jobs/${jobId}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error("Failed to fetch job status");
      }

      const json = await response.json();
      setJobData(json.data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch job status",
      );
    }
  }, [jobId, companyId, userId]);

  const cancelJob = async () => {
    if (!jobId || isCancelling) return;

    setIsCancelling(true);
    try {
      const headers: Record<string, string> = {};
      if (companyId) headers["x-company-id"] = companyId;
      if (userId) headers["x-user-id"] = userId;

      const response = await fetch(`/api/optimization/jobs/${jobId}`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        throw new Error("Failed to cancel job");
      }

      // Refresh status after cancellation
      await fetchJobStatus();
      onCancel?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel job");
    } finally {
      setIsCancelling(false);
    }
  };

  // Poll for job status updates
  useEffect(() => {
    if (!jobId) return;

    // Initial fetch
    fetchJobStatus();

    // Set up polling
    const intervalId = setInterval(() => {
      fetchJobStatus();
    }, pollInterval);

    return () => clearInterval(intervalId);
  }, [jobId, pollInterval, fetchJobStatus]);

  // Handle job completion/failure
  useEffect(() => {
    if (!jobData) return;

    if (jobData.status === "COMPLETED" && jobData.result) {
      onComplete?.(jobData.result);
    } else if (jobData.status === "FAILED" && jobData.error) {
      onError?.(jobData.error);
    }
  }, [jobData, onComplete, onError]);

  // Calculate elapsed time
  const getElapsedTime = () => {
    if (!jobData) return null;

    const start = jobData.startedAt
      ? new Date(jobData.startedAt)
      : new Date(jobData.createdAt);
    const end =
      jobData.completedAt || jobData.cancelledAt
        ? new Date(jobData.completedAt || jobData.cancelledAt!)
        : new Date();
    const elapsed = Math.floor((end.getTime() - start.getTime()) / 1000);

    if (elapsed < 60) return `${elapsed}s`;
    if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
    return `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
  };

  if (!jobId || !jobData) {
    return null;
  }

  const canCancel =
    jobData.status === "PENDING" || jobData.status === "RUNNING";

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {STATUS_ICONS[jobData.status]}
            <div>
              <CardTitle className="text-lg">Optimization Progress</CardTitle>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span>Job ID: {jobId.slice(0, 8)}...</span>
                <Badge
                  variant="outline"
                  className={STATUS_COLORS[jobData.status]}
                >
                  {jobData.status}
                </Badge>
              </div>
            </div>
          </div>
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={cancelJob}
              disabled={isCancelling}
              className="text-destructive hover:text-destructive"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        {jobData.status === "RUNNING" || jobData.status === "PENDING" ? (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{jobData.progress}%</span>
            </div>
            <Progress value={jobData.progress} className="h-2" />
          </div>
        ) : null}

        {/* Status message */}
        {jobData.status === "COMPLETED" && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              Optimization completed successfully in {getElapsedTime()}!
            </p>
          </div>
        )}

        {jobData.status === "FAILED" && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800 font-medium">
              Optimization failed
            </p>
            {jobData.error && (
              <p className="text-sm text-red-700 mt-1">{jobData.error}</p>
            )}
          </div>
        )}

        {jobData.status === "CANCELLED" && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-sm text-gray-700">
              Optimization was cancelled after {getElapsedTime()}.
            </p>
          </div>
        )}

        {/* Error message from fetch */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Metadata */}
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span>Created:</span>
            <span>{new Date(jobData.createdAt).toLocaleString()}</span>
          </div>
          {jobData.startedAt && (
            <div className="flex justify-between">
              <span>Started:</span>
              <span>{new Date(jobData.startedAt).toLocaleString()}</span>
            </div>
          )}
          {(jobData.completedAt || jobData.cancelledAt) && (
            <div className="flex justify-between">
              <span>Ended:</span>
              <span>
                {new Date(
                  jobData.completedAt || jobData.cancelledAt!,
                ).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
