"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FleetInput } from "@/lib/validations/fleet";

interface FleetFormProps {
  onSubmit: (data: FleetInput) => Promise<void>;
  initialData?: Partial<FleetInput>;
  submitLabel?: string;
}

const FLEET_TYPES = [
  { value: "HEAVY_LOAD", label: "Carga Pesada" },
  { value: "LIGHT_LOAD", label: "Carga Ligera" },
  { value: "EXPRESS", label: "Express" },
  { value: "REFRIGERATED", label: "Refrigerado" },
  { value: "SPECIAL", label: "Especial" },
];

export function FleetForm({
  onSubmit,
  initialData,
  submitLabel = "Guardar",
}: FleetFormProps) {
  const defaultData: FleetInput = {
    name: initialData?.name ?? "",
    type: initialData?.type ?? "LIGHT_LOAD",
    weightCapacity: initialData?.weightCapacity ?? 0,
    volumeCapacity: initialData?.volumeCapacity ?? 0,
    operationStart: initialData?.operationStart ?? "08:00",
    operationEnd: initialData?.operationEnd ?? "18:00",
    active: initialData?.active ?? true,
  };

  const [formData, setFormData] = useState<FleetInput>(defaultData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    try {
      await onSubmit(formData);
    } catch (error: any) {
      if (error.details) {
        const fieldErrors: Record<string, string> = {};
        error.details.forEach((err: any) => {
          fieldErrors[err.path[0]] = err.message;
        });
        setErrors(fieldErrors);
      } else {
        setErrors({ form: error.error || "Error al guardar la flota" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (field: keyof FleetInput, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.form && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {errors.form}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="name">Nombre de la Flota *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            disabled={isSubmitting}
            className={errors.name ? "border-destructive focus-visible:ring-destructive" : ""}
            placeholder="Ej: Flota Norte - Express"
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">Tipo de Flota *</Label>
          <select
            id="type"
            value={formData.type}
            onChange={(e) => updateField("type", e.target.value)}
            disabled={isSubmitting}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors"
          >
            {FLEET_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          {errors.type && (
            <p className="text-sm text-destructive">{errors.type}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="weightCapacity">Capacidad de Peso (kg) *</Label>
          <Input
            id="weightCapacity"
            type="number"
            min="1"
            step="1"
            value={formData.weightCapacity}
            onChange={(e) => updateField("weightCapacity", parseInt(e.target.value) || 0)}
            disabled={isSubmitting}
            className={errors.weightCapacity ? "border-destructive focus-visible:ring-destructive" : ""}
            placeholder="Ej: 5000"
          />
          {errors.weightCapacity && (
            <p className="text-sm text-destructive">{errors.weightCapacity}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="volumeCapacity">Capacidad de Volumen (m³) *</Label>
          <Input
            id="volumeCapacity"
            type="number"
            min="1"
            step="1"
            value={formData.volumeCapacity}
            onChange={(e) => updateField("volumeCapacity", parseInt(e.target.value) || 0)}
            disabled={isSubmitting}
            className={errors.volumeCapacity ? "border-destructive focus-visible:ring-destructive" : ""}
            placeholder="Ej: 50"
          />
          {errors.volumeCapacity && (
            <p className="text-sm text-destructive">{errors.volumeCapacity}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="operationStart">Hora Inicio de Operación *</Label>
          <Input
            id="operationStart"
            type="time"
            value={formData.operationStart}
            onChange={(e) => updateField("operationStart", e.target.value)}
            disabled={isSubmitting}
            className={errors.operationStart ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {errors.operationStart && (
            <p className="text-sm text-destructive">{errors.operationStart}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="operationEnd">Hora Fin de Operación *</Label>
          <Input
            id="operationEnd"
            type="time"
            value={formData.operationEnd}
            onChange={(e) => updateField("operationEnd", e.target.value)}
            disabled={isSubmitting}
            className={errors.operationEnd ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {errors.operationEnd && (
            <p className="text-sm text-destructive">{errors.operationEnd}</p>
          )}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="active">Estado</Label>
          <div className="flex items-center gap-2">
            <input
              id="active"
              type="checkbox"
              checked={formData.active}
              onChange={(e) => updateField("active", e.target.checked)}
              disabled={isSubmitting}
              className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
            />
            <span className="text-sm text-muted-foreground">
              {formData.active ? "Activa" : "Inactiva"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
