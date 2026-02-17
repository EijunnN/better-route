"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  SkipForward,
  Camera,
  FileSignature,
  NotepadText,
  MessageCircle,
  ArrowLeft,
} from "lucide-react";
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
} from "@/components/ui/dialog";
import { useWorkflow, type WorkflowState, type WorkflowStateInput, type SystemState } from "./workflow-context";

const PRESET_COLORS = [
  "#6B7280", "#3B82F6", "#F59E0B", "#16A34A",
  "#DC4840", "#8B5CF6", "#EC4899", "#F97316",
  "#9CA3AF", "#14B8A6",
];

interface SystemStateOption {
  value: SystemState;
  label: string;
  description: string;
  icon: typeof Clock;
  bgClass: string;
  defaultColor: string;
  defaultRequiresPhoto: boolean;
  defaultRequiresReason: boolean;
  defaultIsTerminal: boolean;
  defaultIsDefault: boolean;
  defaultReasons: string[];
}

const SYSTEM_STATE_OPTIONS: SystemStateOption[] = [
  {
    value: "PENDING",
    label: "Pendiente",
    description: "El pedido aun no se ha iniciado",
    icon: Clock,
    bgClass: "bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800",
    defaultColor: "#6B7280",
    defaultRequiresPhoto: false,
    defaultRequiresReason: false,
    defaultIsTerminal: false,
    defaultIsDefault: true,
    defaultReasons: [],
  },
  {
    value: "IN_PROGRESS",
    label: "En progreso",
    description: "El pedido esta siendo procesado",
    icon: Play,
    bgClass: "bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800",
    defaultColor: "#3B82F6",
    defaultRequiresPhoto: false,
    defaultRequiresReason: false,
    defaultIsTerminal: false,
    defaultIsDefault: false,
    defaultReasons: [],
  },
  {
    value: "COMPLETED",
    label: "Completado",
    description: "El pedido se entrego exitosamente",
    icon: CheckCircle2,
    bgClass: "bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800",
    defaultColor: "#16A34A",
    defaultRequiresPhoto: true,
    defaultRequiresReason: false,
    defaultIsTerminal: true,
    defaultIsDefault: false,
    defaultReasons: [],
  },
  {
    value: "FAILED",
    label: "Fallido",
    description: "El pedido no pudo ser entregado",
    icon: XCircle,
    bgClass: "bg-red-100 dark:bg-red-800/50 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800",
    defaultColor: "#DC4840",
    defaultRequiresPhoto: false,
    defaultRequiresReason: true,
    defaultIsTerminal: true,
    defaultIsDefault: false,
    defaultReasons: ["Cliente ausente", "Direccion incorrecta", "Paquete danado", "Rechazado", "Otro"],
  },
  {
    value: "CANCELLED",
    label: "Cancelado",
    description: "El pedido fue cancelado u omitido",
    icon: SkipForward,
    bgClass: "bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800",
    defaultColor: "#9CA3AF",
    defaultRequiresPhoto: false,
    defaultRequiresReason: false,
    defaultIsTerminal: true,
    defaultIsDefault: false,
    defaultReasons: [],
  },
];

const REQUIREMENT_ICONS = [
  { key: "requiresPhoto" as const, icon: Camera, label: "Foto" },
  { key: "requiresSignature" as const, icon: FileSignature, label: "Firma" },
  { key: "requiresNotes" as const, icon: NotepadText, label: "Notas" },
  { key: "requiresReason" as const, icon: MessageCircle, label: "Motivo" },
];

function labelToCode(label: string): string {
  return label
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

interface WorkflowStateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingState?: WorkflowState | null;
}

export function WorkflowStateDialog({ open, onOpenChange, editingState }: WorkflowStateDialogProps) {
  const { actions, state: ctxState } = useWorkflow();
  const isEdit = !!editingState;

  const [step, setStep] = useState<1 | 2>(isEdit ? 2 : 1);
  const [formData, setFormData] = useState<WorkflowStateInput>({
    code: "",
    label: "",
    systemState: "PENDING",
    color: "#3B82F6",
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
        setStep(2);
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
        setStep(1);
        setFormData({
          code: "",
          label: "",
          systemState: "PENDING",
          color: "#3B82F6",
          position: 0,
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
  }, [open, editingState]);

  const handlePickSystemState = (option: SystemStateOption) => {
    const nextPosition = ctxState.states.length > 0
      ? Math.max(...ctxState.states.map((s) => s.position)) + 1
      : 0;

    setFormData({
      code: "",
      label: option.label,
      systemState: option.value,
      color: option.defaultColor,
      position: nextPosition,
      isDefault: option.defaultIsDefault,
      isTerminal: option.defaultIsTerminal,
      requiresReason: option.defaultRequiresReason,
      reasonOptions: option.defaultReasons,
      requiresPhoto: option.defaultRequiresPhoto,
      requiresSignature: false,
      requiresNotes: false,
    });
    setReasonText(option.defaultReasons.join("\n"));
    setStep(2);
  };

  const handleSubmit = async () => {
    setError(null);

    if (!formData.label.trim()) {
      setError("El nombre es requerido");
      return;
    }

    const code = formData.code.trim() || labelToCode(formData.label);

    const data: WorkflowStateInput = {
      ...formData,
      code: code.toUpperCase(),
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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        {step === 1 && !isEdit ? (
          <>
            <DialogHeader>
              <DialogTitle>Nuevo estado</DialogTitle>
              <DialogDescription>
                Que tipo de estado quieres crear?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-2">
              {SYSTEM_STATE_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handlePickSystemState(option)}
                    className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${option.bgClass}`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{option.label}</div>
                      <div className="text-xs opacity-75">{option.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {isEdit ? "Editar estado" : "Personaliza tu estado"}
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? "Modifica los campos del estado."
                  : "Ajusta los valores preconfigurados o dejalo como esta."}
              </DialogDescription>
            </DialogHeader>

            {!isEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="w-fit -mt-2"
                onClick={() => setStep(1)}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Cambiar tipo
              </Button>
            )}

            <div className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* Label */}
              <div className="space-y-1">
                <Label className="text-xs">Nombre *</Label>
                <Input
                  value={formData.label}
                  onChange={(e) => setFormData((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Ej: En camino"
                  disabled={isSubmitting}
                  className="h-8 text-sm"
                />
              </div>

              {/* Code (auto-generated hint) */}
              <div className="space-y-1">
                <Label className="text-xs">
                  Codigo{" "}
                  <span className="text-muted-foreground font-normal">
                    (auto-generado si se deja vacio)
                  </span>
                </Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                  placeholder={labelToCode(formData.label) || "EN_CAMINO"}
                  disabled={isSubmitting}
                  className="h-8 text-sm font-mono"
                />
              </div>

              {/* Color */}
              <div className="space-y-1">
                <Label className="text-xs">Color</Label>
                <div className="flex items-center gap-1.5">
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
                      disabled={isSubmitting}
                    />
                  ))}
                </div>
              </div>

              {/* Requirements */}
              <div className="space-y-1">
                <Label className="text-xs">Requerimientos</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  {REQUIREMENT_ICONS.map((r) => {
                    const isActive = formData[r.key];
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, [r.key]: !p[r.key] }))}
                        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                          isActive
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                        disabled={isSubmitting}
                      >
                        <r.icon className="h-3.5 w-3.5" />
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reason options */}
              {formData.requiresReason && (
                <div className="space-y-1">
                  <Label className="text-xs">Opciones de motivo (una por linea)</Label>
                  <textarea
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    rows={3}
                    disabled={isSubmitting}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder={"Cliente ausente\nDireccion incorrecta\nOtro"}
                  />
                </div>
              )}

              {/* Terminal + Default */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isTerminal}
                    onCheckedChange={(v) => setFormData((p) => ({ ...p, isTerminal: v }))}
                    disabled={isSubmitting}
                  />
                  <Label className="text-sm cursor-pointer">Terminal</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isDefault}
                    onCheckedChange={(v) => setFormData((p) => ({ ...p, isDefault: v }))}
                    disabled={isSubmitting}
                  />
                  <Label className="text-sm cursor-pointer">Por defecto</Label>
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {isSubmitting ? "Guardando..." : isEdit ? "Actualizar" : "Crear estado"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
