"use client";

import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
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
import { cn } from "@/lib/utils";

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
    label: "Crítica",
    iconBg: "bg-red-500",
    borderClass: "border-l-red-500",
    icon: AlertTriangle,
  },
  WARNING: {
    label: "Advertencia",
    iconBg: "bg-amber-500",
    borderClass: "border-l-amber-500",
    icon: AlertCircle,
  },
  INFO: {
    label: "Info",
    iconBg: "bg-blue-500",
    borderClass: "border-l-blue-500",
    icon: Info,
  },
};

const STATUS_CONFIG = {
  ACTIVE: { label: "Activa" },
  ACKNOWLEDGED: { label: "Reconocida" },
  RESOLVED: { label: "Resuelta" },
  DISMISSED: { label: "Descartada" },
};

interface AlertMetadataShape {
  trackingId?: string;
  sequence?: number;
  driverName?: string;
  plate?: string;
}

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

  const getTimeSince = (dateString: string) =>
    formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: es });

  const metadata = (alert.metadata as AlertMetadataShape | null) ?? {};
  const contextLabel =
    metadata.trackingId ??
    (metadata.sequence != null ? `Parada #${metadata.sequence}` : null) ??
    metadata.plate ??
    metadata.driverName ??
    null;

  return (
    <>
      <Card
        className={cn(
          "hover:bg-accent/50 transition-colors",
          onClick && "cursor-pointer",
          alert.status === "ACTIVE" && "border-l-4",
          alert.status === "ACTIVE" && severityConfig.borderClass,
        )}
        onClick={onClick}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div
              className={cn("mt-0.5 rounded-full p-1.5", severityConfig.iconBg)}
            >
              <SeverityIcon className="size-4 text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium line-clamp-2">{alert.title}</h4>
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
                      <Clock className="size-3" />
                      <span>{getTimeSince(alert.createdAt)}</span>
                    </div>
                    {contextLabel && (
                      <span className="font-medium">{contextLabel}</span>
                    )}
                    {alert.acknowledgedBy && (
                      <span>Reconocida por {alert.acknowledgedBy.name}</span>
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
                      <Button variant="ghost" size="sm" className="size-8 p-0">
                        <MoreVertical className="size-4" />
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
                          <Check className="size-4 mr-2" />
                          Reconocer
                        </DropdownMenuItem>
                      )}
                      {onDismiss && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setDismissDialogOpen(true);
                          }}
                        >
                          <X className="size-4 mr-2" />
                          Descartar
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
            <DialogTitle>Reconocer alerta</DialogTitle>
            <DialogDescription>
              Agrega una nota opcional para reconocer esta alerta.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Agregar una nota (opcional)..."
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
              Cancelar
            </Button>
            <Button onClick={handleAcknowledge} disabled={isLoading}>
              {isLoading ? "Reconociendo..." : "Reconocer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dismissDialogOpen} onOpenChange={setDismissDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar alerta</DialogTitle>
            <DialogDescription>
              Al descartarla, la alerta se oculta de la lista activa. Puedes
              agregar una nota opcional.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Agregar una nota (opcional)..."
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
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDismiss}
              disabled={isLoading}
            >
              {isLoading ? "Descartando..." : "Descartar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
