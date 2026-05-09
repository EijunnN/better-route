"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export type RescheduleMode = "same-day" | "cross-day";

export interface ReschedulePrefill {
  address: string;
  latitude: string;
  longitude: string;
  /** "HH:MM" — if absent the input renders empty. */
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  /** ISO yyyy-mm-dd — only meaningful in cross-day mode. */
  promisedDate: string | null;
  notes: string | null;
}

export interface ReschedulePayload {
  reason: string;
  addressOverride?: string;
  latitudeOverride?: string;
  longitudeOverride?: string;
  timeWindowStartOverride?: string;
  timeWindowEndOverride?: string;
  promisedDateOverride?: string;
  notesOverride?: string;
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: RescheduleMode;
  prefill: ReschedulePrefill;
  /** Called with the diff (only changed fields) plus reason. */
  onSubmit: (payload: ReschedulePayload) => Promise<void>;
}

const COPY: Record<
  RescheduleMode,
  { title: string; description: string; submit: string }
> = {
  "same-day": {
    title: "Programar próxima entrega",
    description:
      "Reabre la parada para que el conductor lo vuelva a intentar hoy. La evidencia previa queda registrada en el historial de visitas.",
    submit: "Reabrir parada",
  },
  "cross-day": {
    title: "Programar próxima entrega",
    description:
      "Reactiva el pedido para que entre en el próximo plan disponible. La visita anterior queda registrada en el historial.",
    submit: "Reactivar pedido",
  },
};

/**
 * Reusable dialog for both same-day Stop reopens (issue 003) and
 * cross-day Order reactivations (issue 004). Pre-fills with the
 * current values so the operator only edits what changed.
 */
export function ProgramarProximaEntregaDialog({
  open,
  onOpenChange,
  mode,
  prefill,
  onSubmit,
}: DialogProps) {
  const { toast } = useToast();
  const copy = COPY[mode];
  const [reason, setReason] = useState("");
  const [address, setAddress] = useState(prefill.address);
  const [latitude, setLatitude] = useState(prefill.latitude);
  const [longitude, setLongitude] = useState(prefill.longitude);
  const [timeWindowStart, setTimeWindowStart] = useState(
    prefill.timeWindowStart ?? "",
  );
  const [timeWindowEnd, setTimeWindowEnd] = useState(
    prefill.timeWindowEnd ?? "",
  );
  const [promisedDate, setPromisedDate] = useState(prefill.promisedDate ?? "");
  const [notes, setNotes] = useState(prefill.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setAddress(prefill.address);
    setLatitude(prefill.latitude);
    setLongitude(prefill.longitude);
    setTimeWindowStart(prefill.timeWindowStart ?? "");
    setTimeWindowEnd(prefill.timeWindowEnd ?? "");
    setPromisedDate(prefill.promisedDate ?? "");
    setNotes(prefill.notes ?? "");
  }, [open, prefill]);

  const diff = useMemo<ReschedulePayload>(() => {
    const out: ReschedulePayload = { reason: reason.trim() };
    if (address !== prefill.address) out.addressOverride = address;
    if (latitude !== prefill.latitude) out.latitudeOverride = latitude;
    if (longitude !== prefill.longitude) out.longitudeOverride = longitude;
    if (timeWindowStart !== (prefill.timeWindowStart ?? "")) {
      out.timeWindowStartOverride = timeWindowStart || undefined;
    }
    if (timeWindowEnd !== (prefill.timeWindowEnd ?? "")) {
      out.timeWindowEndOverride = timeWindowEnd || undefined;
    }
    if (promisedDate !== (prefill.promisedDate ?? "")) {
      out.promisedDateOverride = promisedDate || undefined;
    }
    if (notes !== (prefill.notes ?? "")) {
      out.notesOverride = notes || undefined;
    }
    return out;
  }, [
    reason,
    address,
    latitude,
    longitude,
    timeWindowStart,
    timeWindowEnd,
    promisedDate,
    notes,
    prefill,
  ]);

  const canSubmit = reason.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit(diff);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo procesar",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reschedule-reason">
              Motivo <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reschedule-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: cliente coordinó nueva dirección por teléfono"
              required
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reschedule-address">Dirección</Label>
            <Input
              id="reschedule-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-lat">Latitud</Label>
              <Input
                id="reschedule-lat"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-lng">Longitud</Label>
              <Input
                id="reschedule-lng"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                inputMode="decimal"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-tws">Inicio ventana</Label>
              <Input
                id="reschedule-tws"
                type="time"
                value={timeWindowStart}
                onChange={(e) => setTimeWindowStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-twe">Fin ventana</Label>
              <Input
                id="reschedule-twe"
                type="time"
                value={timeWindowEnd}
                onChange={(e) => setTimeWindowEnd(e.target.value)}
              />
            </div>
          </div>

          {mode === "cross-day" && (
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-date">Fecha prometida</Label>
              <Input
                id="reschedule-date"
                type="date"
                value={promisedDate}
                onChange={(e) => setPromisedDate(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reschedule-notes">Notas para el conductor</Label>
            <Textarea
              id="reschedule-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
