"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

/**
 * Validation severity from the API
 */
type ValidationSeverity = "ERROR" | "WARNING" | "INFO";

/**
 * Validation issue from the API
 */
interface ValidationIssue {
  severity: ValidationSeverity;
  category: string;
  message: string;
  routeId?: string;
  vehicleId?: string;
  driverId?: string;
  resolution?: string;
}

/**
 * Validation result from the API
 */
interface ValidationSummary {
  totalRoutes: number;
  routesWithDrivers: number;
  routesWithoutDrivers: number;
  unassignedOrders: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

interface ValidationResult {
  isValid: boolean;
  canConfirm: boolean;
  issues: ValidationIssue[];
  summary: ValidationSummary;
  metrics: {
    driverAssignmentCoverage: number;
    timeWindowCompliance: number;
    averageAssignmentQuality: number;
  };
  issuesByCategory?: Record<string, ValidationIssue[]>;
  issuesBySeverity?: {
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    info: ValidationIssue[];
  };
  summaryText?: string;
  alreadyConfirmed?: boolean;
  message?: string;
}

interface PlanConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  onConfirmed?: () => void;
}

/**
 * Dialog for confirming an optimization plan with validation
 */
export function PlanConfirmationDialog({
  open,
  onOpenChange,
  jobId,
  onConfirmed,
}: PlanConfirmationDialogProps) {
  const [validationResult, setValidationRezult] =
    useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [overrideWarnings, setOverrideWarnings] = useState(false);
  const [confirmationNote, setConfirmationNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setOverrideWarnings(false);
      setConfirmationNote("");
      setError(null);
      validatePlan();
    }
  }, [open, jobId]);

  const validatePlan = async () => {
    setIsValidating(true);
    setError(null);

    try {
      const response = await fetch(`/api/optimization/jobs/${jobId}/validate`, {
        headers: {
          "x-company-id": localStorage.getItem("companyId") || "",
          "x-user-id": localStorage.getItem("userId") || "",
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to validate plan");
      }

      const data: ValidationResult = await response.json();
      setValidationRezult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate plan");
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfirm = async () => {
    if (!validationResult?.canConfirm) return;

    setIsConfirming(true);
    setError(null);

    try {
      const response = await fetch(`/api/optimization/jobs/${jobId}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": localStorage.getItem("companyId") || "",
          "x-user-id": localStorage.getItem("userId") || "",
        },
        body: JSON.stringify({
          companyId: localStorage.getItem("companyId"),
          jobId,
          overrideWarnings,
          confirmationNote: confirmationNote || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to confirm plan");
      }

      // Success - close dialog and trigger callback
      onOpenChange(false);
      if (onConfirmed) {
        onConfirmed();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm plan");
      // Re-validate to show current state
      await validatePlan();
    } finally {
      setIsConfirming(false);
    }
  };

  const getSeverityIcon = (severity: ValidationSeverity) => {
    switch (severity) {
      case "ERROR":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "WARNING":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case "INFO":
        return <Info className="h-4 w-4 text-blue-600" />;
    }
  };

  const getSeverityBadge = (severity: ValidationSeverity) => {
    switch (severity) {
      case "ERROR":
        return <Badge variant="destructive">Error</Badge>;
      case "WARNING":
        return (
          <Badge
            variant="outline"
            className="border-yellow-600 text-yellow-700"
          >
            Warning
          </Badge>
        );
      case "INFO":
        return <Badge variant="secondary">Info</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Confirm Plan</DialogTitle>
          <DialogDescription>
            Review validation results before confirming this plan for execution
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-1">
          {isValidating ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Validating plan...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 p-4 bg-destructive/10 text-destructive rounded-md">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-medium">Validation Error</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          ) : validationResult?.alreadyConfirmed ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 rounded-md">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-medium">Plan Already Confirmed</p>
                <p className="text-sm">{validationResult.message}</p>
              </div>
            </div>
          ) : validationResult ? (
            <div className="space-y-4">
              {/* Summary Card */}
              <div className="border rounded-md p-4 bg-muted/50">
                <h3 className="font-medium mb-3">Validation Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total Routes</p>
                    <p className="text-2xl font-semibold">
                      {validationResult.summary.totalRoutes}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">With Drivers</p>
                    <p className="text-2xl font-semibold text-green-600">
                      {validationResult.summary.routesWithDrivers}
                    </p>
                  </div>
                  {validationResult.summary.routesWithoutDrivers > 0 && (
                    <div>
                      <p className="text-muted-foreground">Missing Drivers</p>
                      <p className="text-2xl font-semibold text-destructive">
                        {validationResult.summary.routesWithoutDrivers}
                      </p>
                    </div>
                  )}
                  {validationResult.summary.unassignedOrders > 0 && (
                    <div>
                      <p className="text-muted-foreground">Unassigned Orders</p>
                      <p className="text-2xl font-semibold text-orange-600">
                        {validationResult.summary.unassignedOrders}
                      </p>
                    </div>
                  )}
                </div>
                {validationResult.summaryText && (
                  <p className="text-sm text-muted-foreground mt-3">
                    {validationResult.summaryText}
                  </p>
                )}
              </div>

              {/* Metrics Card */}
              <div className="border rounded-md p-4">
                <h3 className="font-medium mb-3">Quality Metrics</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">
                      Driver Assignment Coverage
                    </span>
                    <span className="font-medium">
                      {validationResult.metrics.driverAssignmentCoverage.toFixed(
                        1,
                      )}
                      %
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{
                        width: `${validationResult.metrics.driverAssignmentCoverage}%`,
                      }}
                    />
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">
                      Time Window Compliance
                    </span>
                    <span className="font-medium">
                      {validationResult.metrics.timeWindowCompliance.toFixed(1)}
                      %
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        validationResult.metrics.timeWindowCompliance >= 80
                          ? "bg-green-600"
                          : validationResult.metrics.timeWindowCompliance >= 60
                            ? "bg-yellow-600"
                            : "bg-destructive"
                      }`}
                      style={{
                        width: `${validationResult.metrics.timeWindowCompliance}%`,
                      }}
                    />
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">
                      Average Assignment Quality
                    </span>
                    <span className="font-medium">
                      {validationResult.metrics.averageAssignmentQuality.toFixed(
                        1,
                      )}
                      /100
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        validationResult.metrics.averageAssignmentQuality >= 70
                          ? "bg-green-600"
                          : validationResult.metrics.averageAssignmentQuality >=
                              50
                            ? "bg-yellow-600"
                            : "bg-destructive"
                      }`}
                      style={{
                        width: `${validationResult.metrics.averageAssignmentQuality}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Issues List */}
              {validationResult.issues.length > 0 && (
                <div className="border rounded-md p-4">
                  <h3 className="font-medium mb-3">Issues Found</h3>
                  <ScrollArea className="max-h-[200px]">
                    <div className="space-y-2 pr-4">
                      {validationResult.issuesBySeverity?.errors?.map(
                        (issue, idx) => (
                          <div
                            key={idx}
                            className="flex gap-3 p-3 bg-destructive/10 rounded-md"
                          >
                            {getSeverityIcon(issue.severity)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-destructive">
                                  {issue.message}
                                </p>
                                {getSeverityBadge(issue.severity)}
                              </div>
                              {issue.resolution && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Resolution: {issue.resolution}
                                </p>
                              )}
                            </div>
                          </div>
                        ),
                      )}
                      {validationResult.issuesBySeverity?.warnings?.map(
                        (issue, idx) => (
                          <div
                            key={idx}
                            className="flex gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-md"
                          >
                            {getSeverityIcon(issue.severity)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium">
                                  {issue.message}
                                </p>
                                {getSeverityBadge(issue.severity)}
                              </div>
                              {issue.resolution && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Resolution: {issue.resolution}
                                </p>
                              )}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Override Warnings */}
              {validationResult.summary.warningCount > 0 && (
                <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-md border border-yellow-200 dark:border-yellow-900">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="font-medium text-yellow-800 dark:text-yellow-400">
                        Warnings Present
                      </p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-500">
                        This plan has {validationResult.summary.warningCount}{" "}
                        warning(s). Review the issues above before confirming.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="override-warnings"
                        checked={overrideWarnings}
                        onCheckedChange={(checked) =>
                          setOverrideWarnings(checked as boolean)
                        }
                      />
                      <Label
                        htmlFor="override-warnings"
                        className="text-sm font-normal cursor-pointer"
                      >
                        I have reviewed the warnings and want to confirm this
                        plan anyway
                      </Label>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirmation Note */}
              <div className="space-y-2">
                <Label htmlFor="confirmation-note">
                  Confirmation Note (Optional)
                </Label>
                <Textarea
                  id="confirmation-note"
                  placeholder="Add any notes about this confirmation for audit purposes..."
                  value={confirmationNote}
                  onChange={(e) => setConfirmationNote(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">
                No validation data available
              </p>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isConfirming}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              isValidating ||
              isConfirming ||
              !validationResult?.canConfirm ||
              (validationResult.summary.warningCount > 0 &&
                !overrideWarnings) ||
              !!error
            }
          >
            {isConfirming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
