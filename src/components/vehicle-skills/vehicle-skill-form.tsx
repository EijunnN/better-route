"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { VehicleSkillInput } from "@/lib/validations/vehicle-skill";
import { VEHICLE_SKILL_CATEGORY_LABELS } from "@/lib/validations/vehicle-skill";

interface VehicleSkillFormProps {
  onSubmit: (data: VehicleSkillInput) => Promise<void>;
  initialData?: Partial<VehicleSkillInput>;
  submitLabel?: string;
  onCancel?: () => void;
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
  onCancel,
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
    } catch (error: unknown) {
      const err = error as {
        details?: Array<{ path?: string[]; field?: string; message: string }>;
        error?: string;
      };
      if (err.details && Array.isArray(err.details)) {
        const fieldErrors: Record<string, string> = {};
        err.details.forEach((detail) => {
          const fieldName = detail.path?.[0] || detail.field || "form";
          fieldErrors[fieldName] = detail.message;
        });
        setErrors(fieldErrors);
      } else {
        setErrors({ form: err.error || "Error al guardar la habilidad" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (
    field: keyof VehicleSkillInput,
    value: VehicleSkillInput[keyof VehicleSkillInput],
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
          <Select
            value={formData.category}
            onValueChange={(value) => updateField("category", value)}
            disabled={isSubmitting}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar categoría" />
            </SelectTrigger>
            <SelectContent>
              {VEHICLE_SKILL_CATEGORIES_LIST.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category && (
            <p className="text-sm text-destructive">{errors.category}</p>
          )}
        </div>

        {/* Active status */}
        <div className="space-y-2">
          <Label>Estado del Registro</Label>
          <div className="flex items-center gap-2 h-10">
            <Checkbox
              id="active"
              checked={formData.active}
              onCheckedChange={(checked) =>
                updateField("active", checked === true)
              }
              disabled={isSubmitting}
            />
            <Label htmlFor="active" className="text-sm cursor-pointer">
              {formData.active ? "Activo" : "Inactivo"}
            </Label>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => updateField("description", e.target.value)}
            disabled={isSubmitting}
            className={
              errors.description
                ? "border-destructive focus-visible:ring-destructive"
                : ""
            }
            placeholder="Describe brevemente esta habilidad..."
            rows={3}
          />
          {errors.description && (
            <p className="text-sm text-destructive">{errors.description}</p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t">
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
  );
}
