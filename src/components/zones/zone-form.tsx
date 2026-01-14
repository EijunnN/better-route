"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DAY_OF_WEEK_LABELS,
  DAYS_OF_WEEK,
  ZONE_COLORS,
  ZONE_TYPE_LABELS,
  ZONE_TYPES,
  type ZoneInput,
} from "@/lib/validations/zone";

interface VehicleWithZones {
  id: string;
  name: string;
  plate: string | null;
  zones: Array<{ id: string; name: string }>;
}

interface ZoneFormProps {
  onSubmit: (data: ZoneInput) => Promise<void>;
  initialData?: Partial<ZoneInput> & {
    parsedGeometry?: {
      type: "Polygon";
      coordinates: number[][][];
    } | null;
  };
  vehicles: VehicleWithZones[];
  submitLabel?: string;
  onGeometryEdit?: () => void; // Callback to open map editor
}

export function ZoneForm({
  onSubmit,
  initialData,
  vehicles: _vehicles,
  submitLabel = "Guardar",
  onGeometryEdit,
}: ZoneFormProps) {
  const defaultData: ZoneInput = {
    name: initialData?.name ?? "",
    description: initialData?.description ?? "",
    type: initialData?.type ?? "DELIVERY",
    geometry: initialData?.geometry ?? "",
    color: initialData?.color ?? ZONE_COLORS[0],
    isDefault: initialData?.isDefault ?? false,
    activeDays: initialData?.activeDays ?? null,
    active: initialData?.active ?? true,
  };

  const [formData, setFormData] = useState<ZoneInput>(defaultData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>(
    initialData?.activeDays ?? [],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    const submitData: ZoneInput = {
      ...formData,
      activeDays:
        selectedDays.length > 0
          ? (selectedDays as (typeof DAYS_OF_WEEK)[number][])
          : null,
    };

    try {
      await onSubmit(submitData);
    } catch (error: unknown) {
      const err = error as {
        details?: Array<{ path: string[]; message: string }>;
        error?: string;
      };
      if (err.details) {
        const fieldErrors: Record<string, string> = {};
        err.details.forEach((e) => {
          fieldErrors[e.path[0]] = e.message;
        });
        setErrors(fieldErrors);
      } else {
        setErrors({ form: err.error || "Error al guardar la zona" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (
    field: keyof ZoneInput,
    value: ZoneInput[keyof ZoneInput],
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

  const toggleDay = (day: string) => {
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        return prev.filter((d) => d !== day);
      } else {
        return [...prev, day];
      }
    });
  };

  const selectAllDays = () => {
    setSelectedDays([...DAYS_OF_WEEK]);
  };

  const selectWeekdays = () => {
    setSelectedDays(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]);
  };

  const clearDays = () => {
    setSelectedDays([]);
  };

  // Check if geometry is valid
  const hasValidGeometry = (() => {
    if (!formData.geometry) return false;
    try {
      const parsed = JSON.parse(formData.geometry);
      return (
        parsed.type === "Polygon" &&
        Array.isArray(parsed.coordinates) &&
        parsed.coordinates.length > 0
      );
    } catch {
      return false;
    }
  })();

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.form && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {errors.form}
        </div>
      )}

      {/* Basic Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium border-b pb-2">
          Informacion de la Zona
        </h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nombre de la Zona *</Label>
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
              placeholder="Ej: Zona Norte - Centro"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="type">Tipo de Zona</Label>
            <select
              id="type"
              value={formData.type}
              onChange={(e) => updateField("type", e.target.value)}
              disabled={isSubmitting}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors"
            >
              {ZONE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ZONE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            {errors.type && (
              <p className="text-sm text-destructive">{errors.type}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Descripcion (opcional)</Label>
            <textarea
              id="description"
              value={formData.description ?? ""}
              onChange={(e) =>
                updateField("description", e.target.value || null)
              }
              disabled={isSubmitting}
              rows={2}
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors resize-y"
              placeholder="Descripcion de la zona..."
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Geometry Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium border-b pb-2">Area Geografica</h3>
        <div className="space-y-4">
          {hasValidGeometry ? (
            <div className="flex items-center justify-between p-4 rounded-md border bg-muted/30">
              <div>
                <p className="font-medium text-sm">Poligono definido</p>
                <p className="text-xs text-muted-foreground">
                  La zona tiene un area geografica configurada
                </p>
              </div>
              {onGeometryEdit && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onGeometryEdit}
                  disabled={isSubmitting}
                >
                  Editar en Mapa
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 rounded-md border border-dashed bg-muted/10">
              <div>
                <p className="font-medium text-sm text-muted-foreground">
                  Sin area definida
                </p>
                <p className="text-xs text-muted-foreground">
                  Dibuja el poligono en el mapa para definir el area
                </p>
              </div>
              {onGeometryEdit && (
                <Button
                  type="button"
                  variant="default"
                  onClick={onGeometryEdit}
                  disabled={isSubmitting}
                >
                  Dibujar en Mapa
                </Button>
              )}
            </div>
          )}
          {errors.geometry && (
            <p className="text-sm text-destructive">{errors.geometry}</p>
          )}
        </div>
      </div>

      {/* Color Selection */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium border-b pb-2">Apariencia</h3>
        <div className="space-y-2">
          <Label>Color de la Zona</Label>
          <div className="flex flex-wrap gap-2">
            {ZONE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => updateField("color", color)}
                disabled={isSubmitting}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  formData.color === color
                    ? "border-foreground scale-110"
                    : "border-transparent hover:scale-105"
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Label htmlFor="customColor" className="text-sm">
              O color personalizado:
            </Label>
            <Input
              id="customColor"
              type="color"
              value={formData.color}
              onChange={(e) => updateField("color", e.target.value)}
              disabled={isSubmitting}
              className="w-16 h-8 p-1"
            />
            <span className="text-xs text-muted-foreground">
              {formData.color}
            </span>
          </div>
        </div>
      </div>

      {/* Active Days Selection */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-lg font-medium">Dias Activos</h3>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selectAllDays}
              disabled={isSubmitting}
            >
              Todos
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selectWeekdays}
              disabled={isSubmitting}
            >
              Lun-Vie
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearDays}
              disabled={isSubmitting}
            >
              Ninguno
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Selecciona los dias en que esta zona estara activa. Si no seleccionas
          ninguno, la zona estara activa todos los dias.
        </p>
        <div className="flex flex-wrap gap-2">
          {DAYS_OF_WEEK.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              disabled={isSubmitting}
              className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                selectedDays.includes(day)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted border-input"
              }`}
            >
              {DAY_OF_WEEK_LABELS[day]}
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium border-b pb-2">Opciones</h3>
        <div className="space-y-3">
          {/* Is Default */}
          <div className="flex items-center gap-2">
            <input
              id="isDefault"
              type="checkbox"
              checked={formData.isDefault}
              onChange={(e) => updateField("isDefault", e.target.checked)}
              disabled={isSubmitting}
              className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
            />
            <Label htmlFor="isDefault" className="cursor-pointer">
              Zona por defecto
            </Label>
          </div>
          <p className="text-xs text-muted-foreground ml-6">
            Las visitas que no caigan en ninguna zona seran asignadas a la zona
            por defecto
          </p>

          {/* Active */}
          <div className="flex items-center gap-2 pt-2">
            <input
              id="active"
              type="checkbox"
              checked={formData.active}
              onChange={(e) => updateField("active", e.target.checked)}
              disabled={isSubmitting}
              className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
            />
            <Label htmlFor="active" className="cursor-pointer">
              Zona {formData.active ? "Activa" : "Inactiva"}
            </Label>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
