"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import type {
  TIME_WINDOW_STRICTNESS,
  TIME_WINDOW_TYPES,
} from "@/lib/validations/time-window-preset";

export interface TimeWindowPresetFormData {
  name: string;
  type: (typeof TIME_WINDOW_TYPES)[number];
  startTime?: string;
  endTime?: string;
  exactTime?: string;
  toleranceMinutes?: number;
  strictness: (typeof TIME_WINDOW_STRICTNESS)[number];
  active?: boolean;
}

interface TimeWindowPreset {
  id: string;
  name: string;
  type: (typeof TIME_WINDOW_TYPES)[number];
  startTime: string | null;
  endTime: string | null;
  exactTime: string | null;
  toleranceMinutes: number | null;
  strictness: (typeof TIME_WINDOW_STRICTNESS)[number];
  active: boolean;
}

interface FormProps {
  onSubmit: (data: TimeWindowPresetFormData) => Promise<void>;
  initialData?: TimeWindowPreset;
  submitLabel?: string;
  onCancel?: () => void;
}

const TYPE_OPTIONS = [
  { value: "SHIFT", label: "Turno (rango horario recurrente)" },
  { value: "RANGE", label: "Rango (rango de tiempo único)" },
  { value: "EXACT", label: "Exacto (hora específica con tolerancia)" },
];

const STRICTNESS_OPTIONS = [
  { value: "HARD", label: "Estricto (rechazar violaciones)" },
  { value: "SOFT", label: "Flexible (minimizar retrasos)" },
];

const defaultData: TimeWindowPresetFormData = {
  name: "",
  type: "SHIFT",
  startTime: "",
  endTime: "",
  exactTime: "",
  toleranceMinutes: undefined,
  strictness: "HARD",
  active: true,
};

export function TimeWindowPresetForm({
  onSubmit,
  initialData,
  submitLabel = "Crear Preset",
  onCancel,
}: FormProps) {
  const [formData, setFormData] = useState<TimeWindowPresetFormData>(
    initialData
      ? {
          name: initialData.name,
          type: initialData.type,
          startTime: initialData.startTime || undefined,
          endTime: initialData.endTime || undefined,
          exactTime: initialData.exactTime || undefined,
          toleranceMinutes: initialData.toleranceMinutes || undefined,
          strictness: initialData.strictness,
          active: initialData.active,
        }
      : defaultData,
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        type: initialData.type,
        startTime: initialData.startTime || undefined,
        endTime: initialData.endTime || undefined,
        exactTime: initialData.exactTime || undefined,
        toleranceMinutes: initialData.toleranceMinutes || undefined,
        strictness: initialData.strictness,
        active: initialData.active,
      });
    }
  }, [initialData]);

  const handleChange = (
    field: keyof TimeWindowPresetFormData,
    value: string | number | boolean | undefined,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    try {
      await onSubmit(formData);
    } catch (error: unknown) {
      const err = error as {
        details?: Array<{ path?: string[]; field?: string; message: string }>;
        message?: string;
      };
      if (err.details && Array.isArray(err.details)) {
        const fieldErrors: Record<string, string> = {};
        err.details.forEach((detail) => {
          const fieldName = detail.path?.[0] || detail.field || "form";
          fieldErrors[fieldName] = detail.message;
        });
        setErrors(fieldErrors);
      } else {
        setErrors({ form: err.message || "Error al guardar el preset" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isShiftOrRange = formData.type === "SHIFT" || formData.type === "RANGE";
  const isExact = formData.type === "EXACT";

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel?.()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initialData
              ? "Editar Preset de Ventana de Tiempo"
              : "Crear Preset de Ventana de Tiempo"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="Ej: Entrega Mañana, Recogida Tarde"
              disabled={isSubmitting}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="type">Tipo *</Label>
            <Select
              value={formData.type}
              onValueChange={(value) =>
                handleChange(
                  "type",
                  value as (typeof TIME_WINDOW_TYPES)[number],
                )
              }
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && (
              <p className="text-sm text-destructive">{errors.type}</p>
            )}
          </div>

          {/* SHIFT and RANGE fields */}
          {isShiftOrRange && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">Hora Inicio *</Label>
                <TimePicker
                  id="startTime"
                  value={formData.startTime || null}
                  onChange={(time) =>
                    handleChange("startTime", time || undefined)
                  }
                  placeholder="Seleccionar"
                  disabled={isSubmitting}
                />
                {errors.startTime && (
                  <p className="text-sm text-destructive">{errors.startTime}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="endTime">Hora Fin *</Label>
                <TimePicker
                  id="endTime"
                  value={formData.endTime || null}
                  onChange={(time) =>
                    handleChange("endTime", time || undefined)
                  }
                  placeholder="Seleccionar"
                  disabled={isSubmitting}
                />
                {errors.endTime && (
                  <p className="text-sm text-destructive">{errors.endTime}</p>
                )}
              </div>
            </div>
          )}

          {/* EXACT fields */}
          {isExact && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="exactTime">Hora Exacta *</Label>
                <TimePicker
                  id="exactTime"
                  value={formData.exactTime || null}
                  onChange={(time) =>
                    handleChange("exactTime", time || undefined)
                  }
                  placeholder="Seleccionar"
                  disabled={isSubmitting}
                />
                {errors.exactTime && (
                  <p className="text-sm text-destructive">{errors.exactTime}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="toleranceMinutes">Tolerancia (min) *</Label>
                <Input
                  id="toleranceMinutes"
                  type="number"
                  min="0"
                  value={formData.toleranceMinutes || ""}
                  onChange={(e) =>
                    handleChange(
                      "toleranceMinutes",
                      parseInt(e.target.value, 10) || undefined,
                    )
                  }
                  disabled={isSubmitting}
                />
                {errors.toleranceMinutes && (
                  <p className="text-sm text-destructive">
                    {errors.toleranceMinutes}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Strictness */}
          <div className="space-y-2">
            <Label htmlFor="strictness">Rigurosidad *</Label>
            <Select
              value={formData.strictness}
              onValueChange={(value) =>
                handleChange(
                  "strictness",
                  value as (typeof TIME_WINDOW_STRICTNESS)[number],
                )
              }
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar rigurosidad" />
              </SelectTrigger>
              <SelectContent>
                {STRICTNESS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.strictness && (
              <p className="text-sm text-destructive">{errors.strictness}</p>
            )}
          </div>

          {/* Active (only for edit) */}
          {initialData && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="active"
                checked={formData.active ?? true}
                onCheckedChange={(checked) =>
                  handleChange("active", checked === true)
                }
                disabled={isSubmitting}
              />
              <Label htmlFor="active" className="cursor-pointer">
                Activo
              </Label>
            </div>
          )}

          {errors.form && (
            <p className="text-sm text-destructive">{errors.form}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
