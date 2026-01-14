"use client";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type DRIVER_STATUS, DRIVER_STATUS_TRANSITIONS } from "@/db/schema";
import type { DriverStatusTransitionInput } from "@/lib/validations/driver-status";
import { STATUS_DISPLAY_NAMES } from "@/lib/validations/driver-status";

const STATUS_LABELS = STATUS_DISPLAY_NAMES;

interface DriverStatusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  currentStatus: keyof typeof DRIVER_STATUS;
  driverName: string;
  onStatusChange: (
    driverId: string,
    data: DriverStatusTransitionInput,
  ) => Promise<void>;
}

export function DriverStatusModal({
  open,
  onOpenChange,
  driverId,
  currentStatus,
  driverName,
  onStatusChange,
}: DriverStatusModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [context, setContext] = useState<string>("");
  const [force, setForce] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [warning, setWarning] = useState<string>("");

  const allowedTransitions = DRIVER_STATUS_TRANSITIONS[currentStatus] || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setWarning("");
    setIsSubmitting(true);

    try {
      const data: DriverStatusTransitionInput = {
        newStatus: selectedStatus as DriverStatusTransitionInput["newStatus"],
        reason: reason || undefined,
        context: context || undefined,
        force,
      };

      await onStatusChange(driverId, data);

      // Reset form
      setSelectedStatus("");
      setReason("");
      setContext("");
      setForce(false);
      onOpenChange(false);
    } catch (err: any) {
      const response = err as Response;
      const errorData = await response.json();

      if (response.status === 409) {
        // Conflict - has active routes
        setError(errorData.reason || "No se puede cambiar el estado");
        setWarning(
          "El conductor tiene rutas activas. Marque 'Forzar cambio' para continuar después de reasignar las rutas.",
        );
      } else if (errorData.error) {
        setError(errorData.error);
      } else {
        setError("Error al cambiar el estado del conductor");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedStatus("");
    setReason("");
    setContext("");
    setForce(false);
    setError("");
    setWarning("");
    onOpenChange(false);
  };

  const selectedStatusRequiresForce =
    selectedStatus === "UNAVAILABLE" ||
    selectedStatus === "ABSENT" ||
    (currentStatus === "ASSIGNED" && selectedStatus !== "ASSIGNED") ||
    (currentStatus === "IN_ROUTE" &&
      selectedStatus !== "IN_ROUTE" &&
      selectedStatus !== "ON_PAUSE" &&
      selectedStatus !== "COMPLETED");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Cambiar Estado del Conductor</DialogTitle>
          <DialogDescription>
            Cambie el estado operativo del conductor{" "}
            <strong>{driverName}</strong>. Estado actual:{" "}
            <strong>{STATUS_LABELS[currentStatus]}</strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="status">Nuevo Estado *</Label>
              <select
                id="status"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Seleccione un estado...</option>
                {allowedTransitions.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reason">Motivo (opcional)</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: Licencia vencida, enfermedad, etc."
                maxLength={500}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="context">Contexto adicional (opcional)</Label>
              <Textarea
                id="context"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Información adicional sobre el cambio de estado..."
                maxLength={1000}
                rows={3}
                className="resize-none"
              />
            </div>

            {selectedStatusRequiresForce && (
              <div className="flex items-center space-x-2 rounded-md border border-orange-200 bg-orange-50 p-3 dark:border-orange-900 dark:bg-orange-950">
                <input
                  id="force"
                  type="checkbox"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
                <Label
                  htmlFor="force"
                  className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Forzar cambio (ignorar rutas activas)
                </Label>
              </div>
            )}

            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {warning && (
              <div className="rounded-md border border-orange-500/50 bg-orange-500/10 p-3 text-sm text-orange-600 dark:text-orange-400">
                {warning}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!selectedStatus || isSubmitting}>
              {isSubmitting ? "Cambiando..." : "Cambiar Estado"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
