"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  SkipForward,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { STOP_STATUS } from "@/db/schema";

export interface StopInfo {
  id: string;
  orderId: string;
  trackingId: string;
  sequence: number;
  address: string;
  status: keyof typeof STOP_STATUS;
  estimatedArrival?: string | null;
  timeWindowStart?: string | null;
  timeWindowEnd?: string | null;
}

export interface StopStatusUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stop: StopInfo | null;
  onUpdate: (stopId: string, status: string, notes?: string) => Promise<void>;
}

const STOP_STATUS_OPTIONS = [
  {
    value: "PENDING",
    label: "Pending",
    description: "Stop is waiting to be started",
    icon: Clock,
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/30",
  },
  {
    value: "IN_PROGRESS",
    label: "In Progress",
    description: "Driver is currently at this stop",
    icon: Loader2,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
  },
  {
    value: "COMPLETED",
    label: "Completed",
    description: "Stop was successfully completed",
    icon: CheckCircle2,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
  },
  {
    value: "FAILED",
    label: "Failed",
    description: "Stop could not be completed",
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
  },
  {
    value: "SKIPPED",
    label: "Skipped",
    description: "Stop was intentionally skipped",
    icon: SkipForward,
    color: "text-gray-400",
    bgColor: "bg-gray-400/10",
    borderColor: "border-gray-400/30",
  },
];

export function StopStatusUpdateDialog({
  open,
  onOpenChange,
  stop,
  onUpdate,
}: StopStatusUpdateDialogProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>(
    stop?.status || "PENDING",
  );
  const [notes, setNotes] = useState("");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when stop changes
  if (stop && selectedStatus !== stop.status) {
    setSelectedStatus(stop.status);
  }

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return "--:--";
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleUpdate = async () => {
    if (!stop) return;

    setUpdating(true);
    setError(null);
    try {
      await onUpdate(stop.id, selectedStatus, notes || undefined);
      onOpenChange(false);
      setNotes("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al actualizar el estado de la parada";
      setError(message);
    } finally {
      setUpdating(false);
    }
  };

  const getStatusConfig = (status: string) => {
    return (
      STOP_STATUS_OPTIONS.find((s) => s.value === status) ||
      STOP_STATUS_OPTIONS[0]
    );
  };

  const currentStatusConfig = stop ? getStatusConfig(stop.status) : null;
  const StatusIcon = currentStatusConfig?.icon || Clock;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Update Stop Status</DialogTitle>
          <DialogDescription>
            Update the status for this delivery stop. This change will be
            recorded in the audit log.
          </DialogDescription>
        </DialogHeader>

        {stop && (
          <div className="space-y-4">
            {/* Stop Info */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted">
              <div className={`mt-0.5 ${currentStatusConfig?.color}`}>
                <StatusIcon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    #{stop.sequence}
                  </Badge>
                  <span className="font-medium text-sm">{stop.trackingId}</span>
                  <Badge
                    className={`text-xs ${currentStatusConfig?.bgColor} ${currentStatusConfig?.color}`}
                  >
                    {currentStatusConfig?.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{stop.address}</span>
                </div>
                {(stop.timeWindowStart || stop.timeWindowEnd) && (
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>
                      Window: {formatTime(stop.timeWindowStart)} -{" "}
                      {formatTime(stop.timeWindowEnd)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Status Selection */}
            <div className="space-y-2">
              <Label>Select New Status</Label>
              <div className="grid grid-cols-1 gap-2">
                {STOP_STATUS_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isSelected = selectedStatus === option.value;
                  const isCurrent = stop.status === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => setSelectedStatus(option.value)}
                      className={`
                        flex items-start gap-3 p-3 rounded-lg border text-left transition-colors
                        ${
                          isSelected
                            ? `border-primary bg-primary/5 ring-2 ring-primary/20`
                            : `border-border hover:bg-muted/50`
                        }
                        ${isCurrent ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                      `}
                    >
                      <div className={option.color}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {option.label}
                          </span>
                          {isCurrent && (
                            <Badge variant="outline" className="text-xs">
                              Current
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {option.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any relevant notes about this status change..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <XCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Warning for terminal states */}
            {(selectedStatus === "FAILED" || selectedStatus === "SKIPPED") && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 dark:bg-amber-900/20 dark:border-amber-700/50">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  <p className="font-medium">Important Note</p>
                  <p className="mt-1">
                    {selectedStatus === "FAILED"
                      ? "This stop will be marked as failed and an alert will be created. You can retry this stop later by changing its status back to PENDING."
                      : "This stop will be marked as skipped and an alert will be created. This action cannot be undone."}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleUpdate}
            disabled={updating || !stop || selectedStatus === stop.status}
          >
            {updating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Update Status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
