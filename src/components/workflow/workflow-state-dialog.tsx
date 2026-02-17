"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkflow, type WorkflowState, type WorkflowStateInput, type SystemState } from "./workflow-context";

const SYSTEM_STATE_OPTIONS: { value: SystemState; label: string }[] = [
  { value: "PENDING", label: "Pendiente" },
  { value: "IN_PROGRESS", label: "En progreso" },
  { value: "COMPLETED", label: "Completado" },
  { value: "FAILED", label: "Fallido" },
  { value: "CANCELLED", label: "Cancelado" },
];

const PRESET_COLORS = [
  "#6b7280", // gray
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f97316", // orange
];

interface WorkflowStateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingState?: WorkflowState | null;
}

export function WorkflowStateDialog({ open, onOpenChange, editingState }: WorkflowStateDialogProps) {
  const { actions, state: ctxState } = useWorkflow();
  const isEdit = !!editingState;

  const [formData, setFormData] = useState<WorkflowStateInput>({
    code: "",
    label: "",
    systemState: "PENDING",
    color: "#3b82f6",
    position: 0,
    isDefault: false,
    isTerminal: false,
    requiresReason: false,
    reasonOptions: [],
    requiresPhoto: false,
    requiresSignature: false,
    requiresNotes: false,
  });
  const [reasonText, setReasonText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (editingState) {
        setFormData({
          code: editingState.code,
          label: editingState.label,
          systemState: editingState.systemState,
          color: editingState.color,
          position: editingState.position,
          isDefault: editingState.isDefault,
          isTerminal: editingState.isTerminal,
          requiresReason: editingState.requiresReason,
          reasonOptions: editingState.reasonOptions || [],
          requiresPhoto: editingState.requiresPhoto,
          requiresSignature: editingState.requiresSignature,
          requiresNotes: editingState.requiresNotes,
        });
        setReasonText((editingState.reasonOptions || []).join("\n"));
      } else {
        const nextPosition = ctxState.states.length > 0
          ? Math.max(...ctxState.states.map((s) => s.position)) + 1
          : 0;
        setFormData({
          code: "",
          label: "",
          systemState: "PENDING",
          color: "#3b82f6",
          position: nextPosition,
          isDefault: false,
          isTerminal: false,
          requiresReason: false,
          reasonOptions: [],
          requiresPhoto: false,
          requiresSignature: false,
          requiresNotes: false,
        });
        setReasonText("");
      }
      setError(null);
    }
  }, [open, editingState, ctxState.states]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.label.trim()) {
      setError("El nombre es requerido");
      return;
    }
    if (!formData.code.trim()) {
      setError("El codigo es requerido");
      return;
    }

    const data: WorkflowStateInput = {
      ...formData,
      code: formData.code.toUpperCase().trim(),
      label: formData.label.trim(),
      reasonOptions: formData.requiresReason
        ? reasonText.split("\n").map((s) => s.trim()).filter(Boolean)
        : [],
    };

    setIsSubmitting(true);
    try {
      if (isEdit && editingState) {
        await actions.updateState(editingState.id, data);
      } else {
        await actions.createState(data);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar estado" : "Nuevo estado"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Modifique los campos del estado de entrega." : "Configure un nuevo estado de entrega para su workflow."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ws-label" className="text-xs">Nombre *</Label>
              <Input
                id="ws-label"
                value={formData.label}
                onChange={(e) => setFormData((p) => ({ ...p, label: e.target.value }))}
                placeholder="Ej: En camino"
                disabled={isSubmitting}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-code" className="text-xs">Codigo *</Label>
              <Input
                id="ws-code"
                value={formData.code}
                onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="Ej: EN_CAMINO"
                disabled={isSubmitting}
                className="h-8 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Estado del sistema</Label>
              <Select
                value={formData.systemState}
                onValueChange={(v) => setFormData((p) => ({ ...p, systemState: v as SystemState }))}
                disabled={isSubmitting}
              >
                <SelectTrigger className="h-8 text-sm w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SYSTEM_STATE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-position" className="text-xs">Posicion</Label>
              <Input
                id="ws-position"
                type="number"
                value={formData.position}
                onChange={(e) => setFormData((p) => ({ ...p, position: parseInt(e.target.value) || 0 }))}
                disabled={isSubmitting}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Color</Label>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData((p) => ({ ...p, color }))}
                  className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor: formData.color === color ? "var(--foreground)" : "transparent",
                  }}
                />
              ))}
              <Input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData((p) => ({ ...p, color: e.target.value }))}
                className="h-6 w-8 cursor-pointer rounded border-0 p-0"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Requerimientos</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="ws-photo"
                  checked={formData.requiresPhoto}
                  onCheckedChange={(v) => setFormData((p) => ({ ...p, requiresPhoto: v }))}
                  disabled={isSubmitting}
                />
                <Label htmlFor="ws-photo" className="text-sm cursor-pointer">Foto</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="ws-signature"
                  checked={formData.requiresSignature}
                  onCheckedChange={(v) => setFormData((p) => ({ ...p, requiresSignature: v }))}
                  disabled={isSubmitting}
                />
                <Label htmlFor="ws-signature" className="text-sm cursor-pointer">Firma</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="ws-notes"
                  checked={formData.requiresNotes}
                  onCheckedChange={(v) => setFormData((p) => ({ ...p, requiresNotes: v }))}
                  disabled={isSubmitting}
                />
                <Label htmlFor="ws-notes" className="text-sm cursor-pointer">Notas</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="ws-reason"
                  checked={formData.requiresReason}
                  onCheckedChange={(v) => setFormData((p) => ({ ...p, requiresReason: v }))}
                  disabled={isSubmitting}
                />
                <Label htmlFor="ws-reason" className="text-sm cursor-pointer">Motivo</Label>
              </div>
            </div>

            {formData.requiresReason && (
              <div className="space-y-1.5">
                <Label htmlFor="ws-reasons" className="text-xs">Opciones de motivo (una por linea)</Label>
                <textarea
                  id="ws-reasons"
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  rows={3}
                  disabled={isSubmitting}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder={"Cliente ausente\nDireccion incorrecta\nProducto danado"}
                />
              </div>
            )}
          </div>

          <div className="flex gap-4 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Switch
                id="ws-terminal"
                checked={formData.isTerminal}
                onCheckedChange={(v) => setFormData((p) => ({ ...p, isTerminal: v }))}
                disabled={isSubmitting}
              />
              <Label htmlFor="ws-terminal" className="text-sm cursor-pointer">Terminal</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="ws-default"
                checked={formData.isDefault}
                onCheckedChange={(v) => setFormData((p) => ({ ...p, isDefault: v }))}
                disabled={isSubmitting}
              />
              <Label htmlFor="ws-default" className="text-sm cursor-pointer">Por defecto</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isSubmitting ? "Guardando..." : isEdit ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
