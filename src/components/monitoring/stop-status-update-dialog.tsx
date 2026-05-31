"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Can } from "@/components/auth/can";
import type { FieldDefinition } from "@/components/custom-fields/custom-fields-context";
import { DynamicFieldRenderer } from "@/components/custom-fields/dynamic-field-renderer";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { STOP_STATUS_TRANSITIONS } from "@/db/schema";
import {
  ALLOWED_TRANSITIONS,
  isTerminal,
  type SystemState,
} from "@/lib/workflow/states";
import { type DeliveryPolicy, policyForState } from "./monitoring-context";

export interface StopInfo {
  id: string;
  orderId: string;
  trackingId: string;
  sequence: number;
  address: string;
  status: SystemState;
  estimatedArrival?: string | null;
  timeWindowStart?: string | null;
  timeWindowEnd?: string | null;
  customFields?: Record<string, unknown> | null;
}

export interface StopStatusUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stop: StopInfo | null;
  onUpdate: (
    stopId: string,
    status: string,
    notes?: string,
    customFields?: Record<string, unknown>,
    failureReason?: string,
  ) => Promise<void>;
  deliveryPolicy?: DeliveryPolicy;
  customFieldDefinitions?: FieldDefinition[];
}

const STATUS_ICONS: Record<SystemState, typeof Clock> = {
  PENDING: Clock,
  IN_PROGRESS: Loader2,
  COMPLETED: CheckCircle2,
  FAILED: XCircle,
};

/**
 * Build the list of states the user can transition to from the
 * stop's current status. Includes the current status itself so the
 * UI shows it as "Actual" (disabled) for context.
 */
function nextStatesFor(current: SystemState): SystemState[] {
  const next = ALLOWED_TRANSITIONS[current];
  // Include the current state at the head so the UI can mark it
  // "Actual" without a separate code path.
  return [current, ...next.filter((s) => s !== current)];
}

export function StopStatusUpdateDialog({
  open,
  onOpenChange,
  stop,
  onUpdate,
  deliveryPolicy,
  customFieldDefinitions = [],
}: StopStatusUpdateDialogProps) {
  const initialStatus = (stop?.status as SystemState | undefined) ?? "PENDING";
  const [selectedStatus, setSelectedStatus] =
    useState<SystemState>(initialStatus);
  const [notes, setNotes] = useState("");
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [customFieldValues, setCustomFieldValues] = useState<
    Record<string, unknown>
  >({});
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const relevantCustomFields = customFieldDefinitions.filter(
    (f) => f.active && f.entity === "route_stops",
  );
  const hasCustomFields = relevantCustomFields.length > 0;

  // Reset state when the stop changes. Initialize customFieldValues
  // from the stop's existing customFields so the driver sees what was
  // captured before. `selectedStatus` is reset to the current status
  // so the dialog always opens on "no change pending".
  if (stop && selectedStatus !== (stop.status as SystemState)) {
    setSelectedStatus(stop.status as SystemState);
    setFailureReason(null);
    setCustomFieldValues(
      (stop.customFields as Record<string, unknown> | null) ?? {},
    );
  }

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return "--:--";
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const willCompleteStop = selectedStatus === "COMPLETED";
  const willFailStop = selectedStatus === "FAILED";

  const policyForCurrent = stop
    ? policyForState(stop.status as SystemState, deliveryPolicy)
    : null;
  const policyForSelected = policyForState(selectedStatus, deliveryPolicy);

  // Evidence requirements come from the company's delivery policy. With
  // no policy loaded, fall back to "photo on complete" which matches
  // the historic default before the crystallization refactor.
  const completedRequiresPhoto = deliveryPolicy?.completedRequiresPhoto ?? true;
  const completedRequiresNotes =
    deliveryPolicy?.completedRequiresNotes ?? false;
  const failedRequiresNotes = deliveryPolicy?.failedRequiresNotes ?? true;
  const failureReasons = deliveryPolicy?.failureReasons ?? [];

  const handleUpdate = async () => {
    if (!stop) return;

    setUpdating(true);
    setError(null);
    try {
      const finalNotes = notes.trim() || undefined;
      const customFieldsPayload = hasCustomFields
        ? customFieldValues
        : undefined;
      await onUpdate(
        stop.id,
        selectedStatus,
        finalNotes,
        customFieldsPayload,
        willFailStop && failureReason ? failureReason : undefined,
      );
      onOpenChange(false);
      setNotes("");
      setFailureReason(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Error al actualizar el estado de la parada";
      setError(message);
    } finally {
      setUpdating(false);
    }
  };

  // Missing required customFields block the button when moving to COMPLETED.
  const missingRequiredFields = relevantCustomFields
    .filter((f) => f.required)
    .filter((f) => {
      const v = customFieldValues[f.code];
      return v === undefined || v === null || v === "";
    });
  const blockedByMissingFields =
    willCompleteStop && missingRequiredFields.length > 0;

  const blockedByMissingFailureReason = willFailStop && !failureReason;
  const blockedByMissingNotes =
    (willCompleteStop && completedRequiresNotes && !notes.trim()) ||
    (willFailStop && failedRequiresNotes && !notes.trim());
  const blockedByNoChange = stop ? selectedStatus === stop.status : true;

  const CurrentIcon = stop
    ? (STATUS_ICONS[stop.status as SystemState] ?? Clock)
    : Clock;
  const availableStates = stop ? nextStatesFor(stop.status) : [];

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
              <div
                className="mt-0.5"
                style={{ color: policyForCurrent?.color }}
              >
                <CurrentIcon className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    #{stop.sequence}
                  </Badge>
                  <span className="font-medium text-sm">{stop.trackingId}</span>
                  <Badge
                    className="text-xs"
                    style={{
                      backgroundColor: `${policyForCurrent?.color}1a`,
                      color: policyForCurrent?.color,
                    }}
                  >
                    {policyForCurrent?.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                  <MapPin className="size-3 flex-shrink-0" />
                  <span className="truncate">{stop.address}</span>
                </div>
                {(stop.timeWindowStart || stop.timeWindowEnd) && (
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    <span>
                      Ventana: {formatTime(stop.timeWindowStart)} -{" "}
                      {formatTime(stop.timeWindowEnd)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Status Selection — only states reachable from the current
                status appear (plus the current itself, disabled). */}
            <div className="space-y-2">
              <Label>Seleccionar nuevo estado</Label>
              <div className="grid grid-cols-1 gap-2">
                {availableStates.map((state) => {
                  const Icon = STATUS_ICONS[state] ?? Clock;
                  const config = policyForState(state, deliveryPolicy);
                  const isSelected = selectedStatus === state;
                  const isCurrent = state === (stop.status as SystemState);
                  return (
                    <button
                      key={state}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => {
                        setSelectedStatus(state);
                        setFailureReason(null);
                      }}
                      className={`
                        flex items-start gap-3 p-3 rounded-lg border text-left transition-colors
                        ${isSelected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-muted/50"}
                        ${isCurrent ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                      `}
                    >
                      <div style={{ color: config.color }}>
                        <Icon className="size-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {config.label}
                          </span>
                          {isCurrent && (
                            <Badge variant="outline" className="text-xs">
                              Actual
                            </Badge>
                          )}
                          {isTerminal(state) && (
                            <Badge variant="secondary" className="text-xs">
                              Terminal
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {state}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Failure reason picker (when marking FAILED). Options come
                from the company's delivery policy. */}
            {willFailStop && (
              <div className="space-y-2">
                <Label htmlFor="failureReason">Motivo de la falla *</Label>
                {failureReasons.length > 0 ? (
                  <Select
                    value={failureReason ?? ""}
                    onValueChange={(value) => setFailureReason(value || null)}
                  >
                    <SelectTrigger id="failureReason">
                      <SelectValue placeholder="Seleccionar motivo" />
                    </SelectTrigger>
                    <SelectContent>
                      {failureReasons.map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {reason}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No hay motivos configurados. Agregá motivos en{" "}
                    <span className="font-mono">
                      Configuración → Política de entrega
                    </span>
                    .
                  </p>
                )}
                {blockedByMissingFailureReason && (
                  <p className="text-xs text-destructive">
                    Selecciona un motivo para registrar la falla.
                  </p>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">
                Notas{" "}
                {(willCompleteStop && completedRequiresNotes) ||
                (willFailStop && failedRequiresNotes)
                  ? "(Requerido)"
                  : "(Opcional)"}
              </Label>
              <Textarea
                id="notes"
                placeholder="Agrega notas relevantes sobre este cambio de estado..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Custom fields for the stop */}
            {hasCustomFields && (
              <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
                <div>
                  <Label className="text-sm">Campos personalizados</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Completa los campos definidos para esta entrega. Los
                    obligatorios deben tener valor antes de marcar como
                    completada.
                  </p>
                </div>
                {relevantCustomFields.map((def) => (
                  <DynamicFieldRenderer
                    key={def.id}
                    definition={def}
                    value={customFieldValues[def.code]}
                    onChange={(value) =>
                      setCustomFieldValues((prev) => ({
                        ...prev,
                        [def.code]: value,
                      }))
                    }
                  />
                ))}
                {blockedByMissingFields && (
                  <p className="text-xs text-destructive">
                    Faltan campos obligatorios:{" "}
                    {missingRequiredFields.map((f) => f.label).join(", ")}
                  </p>
                )}
              </div>
            )}

            {/* Photo evidence hint for COMPLETED when required */}
            {willCompleteStop && completedRequiresPhoto && (
              <div className="text-xs text-muted-foreground italic">
                Esta empresa requiere foto al marcar como entregado. El
                conductor la adjunta desde el mobile; este diálogo solo
                actualiza el estado.
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <XCircle className="size-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Warning for terminal states */}
            {isTerminal(selectedStatus) && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 dark:bg-amber-900/20 dark:border-amber-700/50">
                <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  <p className="font-medium">Nota importante</p>
                  <p className="mt-1">
                    {willFailStop
                      ? "Esta parada será marcada como fallida y se creará una alerta. Puedes reintentar esta parada más tarde cambiando su estado a Pendiente."
                      : "Esta parada quedará cerrada — no podrá volver a cambiar de estado."}
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
          <Can perm="route_stop:update">
            <Button
              type="button"
              onClick={handleUpdate}
              disabled={
                updating ||
                !stop ||
                blockedByNoChange ||
                blockedByMissingFields ||
                blockedByMissingFailureReason ||
                blockedByMissingNotes
              }
            >
              {updating && <Loader2 className="size-4 mr-2 animate-spin" />}
              Actualizar a {policyForSelected.label}
            </Button>
          </Can>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-exported for any external caller that still imports the legacy
// constant; kept here so removing the workflow tables doesn't break
// type-only imports during the transition.
export { STOP_STATUS_TRANSITIONS };
