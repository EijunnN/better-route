"use client";

import {
  AlertCircle,
  AlertTriangle,
  Check,
  Clock,
  Info,
  MoreVertical,
  X,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";
export type AlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";

export interface Alert {
  id: string;
  type: string;
  severity: AlertSeverity;
  entityType: string;
  entityId: string;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  status: AlertStatus;
  createdAt: string;
  acknowledgedAt?: string | null;
  acknowledgedBy?: {
    id: string;
    name: string;
  } | null;
}

interface AlertItemProps {
  alert: Alert;
  onAcknowledge?: (alertId: string, note?: string) => Promise<void>;
  onDismiss?: (alertId: string, note?: string) => Promise<void>;
  onClick?: () => void;
}

const SEVERITY_CONFIG = {
  CRITICAL: {
    label: "Critical",
    color: "bg-red-500",
    badgeVariant: "destructive" as const,
    icon: AlertTriangle,
  },
  WARNING: {
    label: "Warning",
    color: "bg-amber-500",
    badgeVariant: "secondary" as const,
    icon: AlertCircle,
  },
  INFO: {
    label: "Info",
    color: "bg-blue-500",
    badgeVariant: "outline" as const,
    icon: Info,
  },
};

const STATUS_CONFIG = {
  ACTIVE: { label: "Active", color: "text-red-600 dark:text-red-400" },
  ACKNOWLEDGED: { label: "Acknowledged", color: "text-amber-600 dark:text-amber-400" },
  RESOLVED: { label: "Resolved", color: "text-emerald-600 dark:text-emerald-400" },
  DISMISSED: { label: "Dismissed", color: "text-gray-600 dark:text-gray-400" },
};

export function AlertItem({
  alert,
  onAcknowledge,
  onDismiss,
  onClick,
}: AlertItemProps) {
  const [acknowledgeDialogOpen, setAcknowledgeDialogOpen] = useState(false);
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const severityConfig = SEVERITY_CONFIG[alert.severity];
  const statusConfig = STATUS_CONFIG[alert.status];
  const SeverityIcon = severityConfig.icon;

  const handleAcknowledge = async () => {
    if (!onAcknowledge) return;
    setIsLoading(true);
    try {
      await onAcknowledge(alert.id, note || undefined);
      setAcknowledgeDialogOpen(false);
      setNote("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = async () => {
    if (!onDismiss) return;
    setIsLoading(true);
    try {
      await onDismiss(alert.id, note || undefined);
      setDismissDialogOpen(false);
      setNote("");
    } finally {
      setIsLoading(false);
    }
  };

  const getTimeSince = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <>
      <Card
        className={`hover:bg-accent/50 transition-colors ${
          onClick ? "cursor-pointer" : ""
        } ${alert.status === "ACTIVE" ? "border-l-4 border-l-red-500" : ""}`}
        onClick={onClick}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Severity Icon */}
            <div
              className={`mt-0.5 ${severityConfig.color} rounded-full p-1.5`}
            >
              <SeverityIcon className="w-4 h-4 text-white" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium truncate">{alert.title}</h4>
                    <Badge
                      variant={severityConfig.badgeVariant}
                      className="text-xs"
                    >
                      {severityConfig.label}
                    </Badge>
                    {alert.status !== "ACTIVE" && (
                      <Badge variant="outline" className="text-xs">
                        {statusConfig.label}
                      </Badge>
                    )}
                  </div>

                  {alert.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {alert.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{getTimeSince(alert.createdAt)}</span>
                    </div>
                    <span className="uppercase">{alert.entityType}</span>
                    {alert.acknowledgedBy && (
                      <span>Acknowledged by {alert.acknowledgedBy.name}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {alert.status === "ACTIVE" && (onAcknowledge || onDismiss) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onAcknowledge && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setAcknowledgeDialogOpen(true);
                          }}
                        >
                          <Check className="w-4 h-4 mr-2" />
                          Acknowledge
                        </DropdownMenuItem>
                      )}
                      {onDismiss && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setDismissDialogOpen(true);
                          }}
                        >
                          <X className="w-4 h-4 mr-2" />
                          Dismiss
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Acknowledge Dialog */}
      <Dialog
        open={acknowledgeDialogOpen}
        onOpenChange={setAcknowledgeDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge Alert</DialogTitle>
            <DialogDescription>
              Add an optional note to acknowledge this alert.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Add a note (optional)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAcknowledgeDialogOpen(false);
                setNote("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAcknowledge} disabled={isLoading}>
              {isLoading ? "Acknowledging..." : "Acknowledge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dismiss Dialog */}
      <Dialog open={dismissDialogOpen} onOpenChange={setDismissDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss Alert</DialogTitle>
            <DialogDescription>
              Dismissing this alert will hide it from the active list. Add an
              optional note.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Add a note (optional)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDismissDialogOpen(false);
                setNote("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDismiss}
              disabled={isLoading}
            >
              {isLoading ? "Dismissing..." : "Dismiss"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
