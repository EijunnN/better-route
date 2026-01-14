"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface AssignmentHistoryEntry {
  id: string;
  action: string;
  changes: {
    action?: string;
    driverId?: string;
    driverName?: string;
    previousDriverId?: string | null;
    previousDriverName?: string | null;
    vehicleId?: string;
    reason?: string;
    overrideWarnings?: boolean;
    validation?: {
      isValid: boolean;
      errors: string[];
      warnings: string[];
    };
  };
  createdAt: string;
  userId?: string;
}

export interface AssignmentHistoryProps {
  routeId: string;
  open?: boolean;
}

export function AssignmentHistory({
  routeId,
  open = false,
}: AssignmentHistoryProps) {
  const [history, setHistory] = useState<AssignmentHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState<{
    total: number;
    byAction: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    if (open) {
      loadHistory();
    }
  }, [routeId, open]);

  async function loadHistory() {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/driver-assignment/history/${routeId}`,
        {
          headers: {
            "Content-Type": "application/json",
            "x-company-id": localStorage.getItem("companyId") || "",
            "x-user-id": localStorage.getItem("userId") || "",
          },
        },
      );

      if (response.ok) {
        const result = await response.json();
        setHistory(result.data.history || []);
        setSummary(result.data.summary);
      }
    } catch (error) {
      console.error("Error loading assignment history:", error);
    } finally {
      setLoading(false);
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case "MANUAL_ASSIGNMENT":
        return "default";
      case "REMOVE_ASSIGNMENT":
        return "destructive";
      case "AUTOMATIC_ASSIGNMENT":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "MANUAL_ASSIGNMENT":
        return "Manual Assignment";
      case "REMOVE_ASSIGNMENT":
        return "Removed";
      case "AUTOMATIC_ASSIGNMENT":
        return "Automatic Assignment";
      default:
        return action;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Assignment History
            </CardTitle>
            <CardDescription>
              Track all driver assignment changes for this route
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No assignment history found
            </p>
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              {summary && (
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {summary.total} change{summary.total !== 1 ? "s" : ""}
                  </span>
                  {Object.entries(summary.byAction).map(([action, count]) => (
                    <Badge key={action} variant="outline" className="text-xs">
                      {getActionLabel(action)}: {count}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Timeline */}
              <div className="space-y-3">
                {history.map((entry, idx) => (
                  <HistoryEntry
                    key={entry.id}
                    entry={entry}
                    showConnector={idx < history.length - 1}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

interface HistoryEntryProps {
  entry: AssignmentHistoryEntry;
  showConnector: boolean;
}

function HistoryEntry({ entry, showConnector }: HistoryEntryProps) {
  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case "MANUAL_ASSIGNMENT":
        return "default";
      case "REMOVE_ASSIGNMENT":
        return "destructive";
      case "AUTOMATIC_ASSIGNMENT":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "MANUAL_ASSIGNMENT":
        return "Manual Assignment";
      case "REMOVE_ASSIGNMENT":
        return "Removed";
      case "AUTOMATIC_ASSIGNMENT":
        return "Automatic Assignment";
      default:
        return action;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="relative">
      {showConnector && (
        <div className="absolute left-[11px] top-6 w-0.5 h-8 bg-border" />
      )}
      <div className="flex gap-3">
        <div className="h-6 w-6 rounded-full bg-primary/10 border border-primary flex items-center justify-center flex-shrink-0">
          <User className="h-3 w-3 text-primary" />
        </div>
        <div className="flex-1 min-w-0 pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={getActionBadgeVariant(entry.action) as any}>
              {getActionLabel(entry.action)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDate(entry.createdAt)}
            </span>
          </div>

          {/* Assignment Details */}
          {entry.changes.driverName && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{entry.changes.driverName}</span>
              {entry.changes.previousDriverName && (
                <>
                  <span className="text-muted-foreground">(replaced </span>
                  <span className="text-muted-foreground line-through">
                    {entry.changes.previousDriverName}
                  </span>
                  <span className="text-muted-foreground">)</span>
                </>
              )}
            </div>
          )}

          {/* Override Warning */}
          {entry.changes.overrideWarnings && (
            <div className="mt-2 flex items-center gap-2 text-xs text-yellow-700 bg-yellow-50 px-2 py-1 rounded">
              <AlertTriangle className="h-3 w-3" />
              <span>Manual override - warnings were present</span>
            </div>
          )}

          {/* Reason */}
          {entry.changes.reason && (
            <div className="mt-2 text-xs text-muted-foreground italic">
              "{entry.changes.reason}"
            </div>
          )}

          {/* Validation Details */}
          {entry.changes.validation && (
            <div className="mt-2 space-y-1">
              {entry.changes.validation.warnings.length > 0 && (
                <div className="text-xs">
                  <span className="font-medium text-yellow-700">
                    Warnings:{" "}
                  </span>
                  <span className="text-yellow-600">
                    {entry.changes.validation.warnings.join(", ")}
                  </span>
                </div>
              )}
              {entry.changes.validation.errors.length > 0 && (
                <div className="text-xs">
                  <span className="font-medium text-red-700">Errors: </span>
                  <span className="text-red-600">
                    {entry.changes.validation.errors.join(", ")}
                  </span>
                </div>
              )}
              {entry.changes.validation.isValid &&
                entry.changes.validation.warnings.length === 0 &&
                entry.changes.validation.errors.length === 0 && (
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Valid assignment</span>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
