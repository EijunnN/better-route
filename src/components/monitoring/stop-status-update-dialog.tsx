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
import type { WorkflowState } from "./monitoring-context";

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
  onUpdate: (stopId: string, status: string, notes?: string, workflowStateId?: string) => Promise<void>;
  workflowStates?: WorkflowState[];
}

const STOP_STATUS_OPTIONS = [
  {
    value: "PENDING",
    label: "PENDING",
    description: "La parada está en espera de ser iniciada",
    icon: Clock,
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/30",
  },
  {
    value: "IN_PROGRESS",
    label: "IN_PROGRESS",
    description: "El conductor está actualmente en esta parada",
    icon: Loader2,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
  },
  {
    value: "COMPLETED",
    label: "COMPLETED",
    description: "La parada fue completada exitosamente",
    icon: CheckCircle2,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
  },
  {
    value: "FAILED",
    label: "FAILED",
    description: "La parada no pudo ser completada",
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
  },
  {
    value: "SKIPPED",
    label: "SKIPPED",
    description: "La parada fue omitida intencionalmente",
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
  workflowStates = [],
}: StopStatusUpdateDialogProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>(
    stop?.status || "PENDING",
  );
  const [selectedWorkflowStateId, setSelectedWorkflowStateId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasWorkflowStates = workflowStates.length > 0;

  // Reset state when stop changes
  if (stop && selectedStatus !== stop.status) {
    setSelectedStatus(stop.status);
    setSelectedWorkflowStateId(null);
    setSelectedReason(null);
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
      const finalNotes = selectedReason
        ? (notes ? `${selectedReason}: ${notes}` : selectedReason)
        : (notes || undefined);
      await onUpdate(stop.id, selectedStatus, finalNotes, selectedWorkflowStateId || undefined);
      onOpenChange(false);
      setNotes("");
      setSelectedReason(null);
      setSelectedWorkflowStateId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al actualizar el estado de la parada";
      setError(message);
    } finally {
      setUpdating(false);
    }
  };

  const selectedWorkflowState = selectedWorkflowStateId
    ? workflowStates.find(ws => ws.id === selectedWorkflowStateId)
    : null;

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
          <DialogTitle>Actualizar estado de parada</DialogTitle>
          <DialogDescription>
            Actualiza el estado de esta parada de entrega. Este cambio quedará
            registrado en el log de auditoría.
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
                      Ventana: {formatTime(stop.timeWindowStart)} -{" "}
                      {formatTime(stop.timeWindowEnd)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Status Selection */}
            <div className="space-y-2">
              <Label>Seleccionar nuevo estado</Label>
              <div className="grid grid-cols-1 gap-2">
                {hasWorkflowStates ? (
                  workflowStates.map((ws) => {
                    const isSelected = selectedWorkflowStateId === ws.id;
                    const isCurrent = stop.status === ws.systemState && !selectedWorkflowStateId;

                    return (
                      <button
                        key={ws.id}
                        type="button"
                        onClick={() => {
                          setSelectedWorkflowStateId(ws.id);
                          setSelectedStatus(ws.systemState);
                          setSelectedReason(null);
                        }}
                        className={`
                          flex items-start gap-3 p-3 rounded-lg border text-left transition-colors
                          ${isSelected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-muted/50"}
                        `}
                      >
                        <div
                          className="w-5 h-5 rounded-full shrink-0 mt-0.5"
                          style={{ backgroundColor: ws.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{ws.label}</span>
                            {isCurrent && (
                              <Badge variant="outline" className="text-xs">Actual</Badge>
                            )}
                            {ws.isTerminal && (
                              <Badge variant="secondary" className="text-xs">Terminal</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{ws.code}</p>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  STOP_STATUS_OPTIONS.map((option) => {
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
                          ${isSelected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-muted/50"}
                          ${isCurrent ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                        `}
                      >
                        <div className={option.color}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{option.label}</span>
                            {isCurrent && (
                              <Badge variant="outline" className="text-xs">Actual</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Reason Options (from workflow state) */}
            {selectedWorkflowState?.requiresReason && selectedWorkflowState.reasonOptions && (
              <div className="space-y-2">
                <Label>Motivo</Label>
                <div className="grid grid-cols-1 gap-1.5">
                  {selectedWorkflowState.reasonOptions.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setSelectedReason(selectedReason === reason ? null : reason)}
                      className={`
                        p-2.5 rounded-lg border text-left text-sm transition-colors
                        ${selectedReason === reason ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-muted/50"}
                      `}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">
                Notas {selectedWorkflowState?.requiresNotes ? "(Requerido)" : "(Opcional)"}
              </Label>
              <Textarea
                id="notes"
                placeholder="Agrega notas relevantes sobre este cambio de estado..."
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
            {(selectedStatus === "FAILED" || selectedStatus === "SKIPPED" || selectedWorkflowState?.isTerminal) && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 dark:bg-amber-900/20 dark:border-amber-700/50">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  <p className="font-medium">Nota importante</p>
                  <p className="mt-1">
                    {selectedStatus === "FAILED"
                      ? "Esta parada será marcada como fallida y se creará una alerta. Puedes reintentar esta parada más tarde cambiando su estado a PENDING."
                      : "Esta parada será marcada como omitida y se creará una alerta. Esta acción no se puede deshacer."}
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
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleUpdate}
            disabled={
              updating ||
              !stop ||
              (hasWorkflowStates
                ? !selectedWorkflowStateId || !!(selectedWorkflowState?.requiresNotes && !notes.trim()) || !!(selectedWorkflowState?.requiresReason && selectedWorkflowState.reasonOptions && !selectedReason)
                : selectedStatus === stop.status)
            }
          >
            {updating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Actualizar estado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
