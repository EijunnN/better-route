"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VehicleSkillInput } from "@/lib/validations/vehicle-skill";
import { VEHICLE_SKILL_CATEGORY_LABELS } from "@/lib/validations/vehicle-skill";

interface VehicleSkillFormProps {
  onSubmit: (data: VehicleSkillInput) => Promise<void>;
  initialData?: Partial<VehicleSkillInput>;
  submitLabel?: string;
}

const VEHICLE_SKILL_CATEGORIES_LIST = Object.entries(
  VEHICLE_SKILL_CATEGORY_LABELS,
).map(([value, label]) => ({
  value,
  label,
}));

export function VehicleSkillForm({
  onSubmit,
  initialData,
  submitLabel = "Guardar",
}: VehicleSkillFormProps) {
  const defaultData: VehicleSkillInput = {
    code: initialData?.code ?? "",
    name: initialData?.name ?? "",
    category: initialData?.category ?? "EQUIPMENT",
    description: initialData?.description ?? "",
    active: initialData?.active ?? true,
  };

  const [formData, setFormData] = useState<VehicleSkillInput>(defaultData);
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
        setErrors({ form: error.error || "Error al guardar la habilidad" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (field: keyof VehicleSkillInput, value: any) => {
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
        {/* Code */}
        <div className="space-y-2">
          <Label htmlFor="code">Código *</Label>
          <Input
            id="code"
            value={formData.code}
            onChange={(e) => {
              const upperValue = e.target.value.toUpperCase();
              updateField("code", upperValue);
            }}
            disabled={isSubmitting}
            className={
              errors.code
                ? "border-destructive focus-visible:ring-destructive"
                : ""
            }
            placeholder="Ej: REFRIGERADO"
            autoComplete="off"
          />
          {errors.code && (
            <p className="text-sm text-destructive">{errors.code}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Solo mayúsculas, números, guiones y guiones bajos
          </p>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Nombre *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            disabled={isSubmitting}
            className={
              errors.name
                ? "border-destructive focus-visible:ring-destructive"
                : ""
            }
            placeholder="Ej: Cámara Refrigerada"
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name}</p>
          )}
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label htmlFor="category">Categoría *</Label>
          <select
            id="category"
            value={formData.category}
            onChange={(e) => updateField("category", e.target.value)}
            disabled={isSubmitting}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors"
          >
            {VEHICLE_SKILL_CATEGORIES_LIST.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
          {errors.category && (
            <p className="text-sm text-destructive">{errors.category}</p>
          )}
        </div>

        {/* Active status */}
        <div className="space-y-2">
          <Label htmlFor="active">Estado del Registro</Label>
          <div className="flex items-center gap-2 h-10">
            <input
              id="active"
              type="checkbox"
              checked={formData.active}
              onChange={(e) => updateField("active", e.target.checked)}
              disabled={isSubmitting}
              className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
            />
            <span className="text-sm text-muted-foreground">
              {formData.active ? "Activo" : "Inactivo"}
            </span>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Descripción</Label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => updateField("description", e.target.value)}
            disabled={isSubmitting}
            className={
              errors.description
                ? "flex min-h-[80px] w-full rounded-md border border-destructive bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                : "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            }
            placeholder="Describe brevemente esta habilidad..."
            rows={3}
          />
          {errors.description && (
            <p className="text-sm text-destructive">{errors.description}</p>
          )}
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
