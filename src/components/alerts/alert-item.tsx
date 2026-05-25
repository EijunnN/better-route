"use client";

import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Check, Clock, MoreVertical, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  {
    label: string;
    borderColor: string;
    dotColor: string;
    pillClass: string;
  }
> = {
  CRITICAL: {
    label: "Crítica",
    borderColor: "var(--cockpit-danger)",
    dotColor: "var(--cockpit-danger)",
    pillClass:
      "border-[var(--cockpit-danger)]/40 bg-[var(--cockpit-danger)]/10 text-[oklch(0.85_0.15_27)]",
  },
  WARNING: {
    label: "Advertencia",
    borderColor: "var(--cockpit-warn)",
    dotColor: "var(--cockpit-warn)",
    pillClass: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  INFO: {
    label: "Info",
    borderColor: "var(--cockpit-live)",
    dotColor: "var(--cockpit-live)",
    pillClass:
      "border-[var(--cockpit-live)]/40 bg-[var(--cockpit-live)]/10 text-[var(--cockpit-live)]",
  },
};

const STATUS_LABEL: Record<AlertStatus, string> = {
  ACTIVE: "Activa",
  ACKNOWLEDGED: "Reconocida",
  RESOLVED: "Resuelta",
  DISMISSED: "Descartada",
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

  const severity = SEVERITY_CONFIG[alert.severity];
  const isActive = alert.status === "ACTIVE";

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
    formatDistanceToNow(new Date(dateString), {
      addSuffix: true,
      locale: es,
    });

  const metadata = (alert.metadata as AlertMetadataShape | null) ?? {};
  const contextLabel =
    metadata.trackingId ??
    (metadata.sequence != null ? `Parada #${metadata.sequence}` : null) ??
    metadata.plate ??
    metadata.driverName ??
    null;

  return (
    <>
      <li
        className={cn(
          "cockpit-enter relative px-3 py-2.5 transition-colors",
          onClick &&
            "cursor-pointer hover:bg-muted/60 focus-within:bg-muted/60",
          !isActive && "opacity-70",
        )}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
      >
        {/* Severity accent — 2px coloured rule on the left edge. The
            border itself communicates severity, the pill confirms it. */}
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[2px]"
          style={{
            background: isActive ? severity.borderColor : "transparent",
          }}
        />

        <div className="flex items-start gap-2.5 pl-1">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-medium text-sm leading-snug line-clamp-2">
                {alert.title}
              </h4>
              {isActive && (onAcknowledge || onDismiss) && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 -mr-1 -mt-0.5"
                      aria-label="Más acciones"
                    >
                      <MoreVertical className="size-3.5" />
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
                        <Check className="size-3.5 mr-2" />
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
                        <X className="size-3.5 mr-2" />
                        Descartar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {alert.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {alert.description}
              </p>
            )}

            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[10px]">
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border cockpit-mono uppercase tracking-wider",
                  severity.pillClass,
                )}
              >
                <span
                  aria-hidden
                  className="size-1 rounded-full"
                  style={{ background: severity.dotColor }}
                />
                {severity.label}
              </span>

              {!isActive && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm border border-border/60 text-muted-foreground cockpit-mono uppercase tracking-wider">
                  {STATUS_LABEL[alert.status]}
                </span>
              )}

              <span className="inline-flex items-center gap-1 cockpit-mono text-muted-foreground">
                <Clock className="size-2.5" />
                {getTimeSince(alert.createdAt)}
              </span>

              {contextLabel && (
                <span className="cockpit-mono text-muted-foreground">
                  · {contextLabel}
                </span>
              )}
            </div>

            {alert.acknowledgedBy && (
              <p className="cockpit-label">
                Reconocida por {alert.acknowledgedBy.name}
              </p>
            )}
          </div>
        </div>
      </li>

      {/* Acknowledge Dialog */}
      <Dialog
        open={acknowledgeDialogOpen}
        onOpenChange={setAcknowledgeDialogOpen}
      >
        <DialogContent data-cockpit>
          <DialogHeader>
            <DialogTitle>Reconocer alerta</DialogTitle>
            <DialogDescription>
              Agrega una nota opcional para reconocer esta alerta.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Agregar una nota (opcional)…"
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
              {isLoading ? "Reconociendo…" : "Reconocer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dismissDialogOpen} onOpenChange={setDismissDialogOpen}>
        <DialogContent data-cockpit>
          <DialogHeader>
            <DialogTitle>Descartar alerta</DialogTitle>
            <DialogDescription>
              Al descartarla, la alerta se oculta de la lista activa. Puedes
              agregar una nota opcional.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Agregar una nota (opcional)…"
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
              {isLoading ? "Descartando…" : "Descartar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
