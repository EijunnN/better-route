"use client";

import { Check, Search, Truck } from "lucide-react";
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

interface VehicleOption {
  id: string;
  name: string;
  plate: string | null;
}

interface ZoneFormProps {
  onSubmit: (data: ZoneInput, vehicleIds: string[]) => Promise<void>;
  initialData?: Partial<ZoneInput> & {
    parsedGeometry?: {
      type: "Polygon";
      coordinates: number[][][];
    } | null;
  };
  vehicles: VehicleOption[];
  initialVehicleIds?: string[];
  submitLabel?: string;
  onGeometryEdit?: () => void; // Callback to open map editor
}

export function ZoneForm({
  onSubmit,
  initialData,
  vehicles,
  initialVehicleIds = [],
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
  const [selectedVehicleIds, setSelectedVehicleIds] =
    useState<string[]>(initialVehicleIds);
  const [vehicleSearch, setVehicleSearch] = useState("");

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
      await onSubmit(submitData, selectedVehicleIds);
    } catch (error: unknown) {
      const err = error as {
        details?: Array<{ path?: string[]; field?: string; message: string }>;
        error?: string;
      };
      if (err.details && Array.isArray(err.details)) {
        const fieldErrors: Record<string, string> = {};
        err.details.forEach((e) => {
          const fieldName = e.path?.[0] || e.field || "form";
          fieldErrors[fieldName] = e.message;
        });
        setErrors(fieldErrors);
      } else {
        setErrors({ form: err.error || "Error al guardar la zona" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Vehicle selection helpers
  const toggleVehicle = (vehicleId: string) => {
    setSelectedVehicleIds((prev) =>
      prev.includes(vehicleId)
        ? prev.filter((id) => id !== vehicleId)
        : [...prev, vehicleId],
    );
  };

  const filteredVehicles = vehicles.filter((v) => {
    if (!vehicleSearch) return true;
    const search = vehicleSearch.toLowerCase();
    return (
      v.name.toLowerCase().includes(search) ||
      (v.plate?.toLowerCase().includes(search) ?? false)
    );
  });

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
                className={`w-8 h-8 rounded-full border-2 transition-transform ${
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

      {/* Vehicle Assignment */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-lg font-medium">Vehículos Asignados</h3>
          <span className="text-sm text-muted-foreground">
            {selectedVehicleIds.length} seleccionados
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Selecciona los vehículos que pueden entregar en esta zona. Solo estos
          vehículos recibirán pedidos de esta zona durante la optimización.
        </p>

        {/* Search vehicles */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar vehículo..."
            value={vehicleSearch}
            onChange={(e) => setVehicleSearch(e.target.value)}
            disabled={isSubmitting}
            className="pl-9"
          />
        </div>

        {/* Quick actions */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelectedVehicleIds(vehicles.map((v) => v.id))}
            disabled={isSubmitting}
          >
            Todos
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelectedVehicleIds([])}
            disabled={isSubmitting}
          >
            Ninguno
          </Button>
        </div>

        {/* Vehicle list */}
        <div className="max-h-[250px] overflow-y-auto border rounded-lg">
          {vehicles.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <Truck className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay vehículos disponibles</p>
            </div>
          ) : filteredVehicles.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No se encontraron vehículos
            </div>
          ) : (
            <div className="divide-y">
              {filteredVehicles.map((vehicle) => {
                const isSelected = selectedVehicleIds.includes(vehicle.id);
                return (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => toggleVehicle(vehicle.id)}
                    disabled={isSubmitting}
                    className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
                      isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? "bg-primary border-primary"
                          : "border-input"
                      }`}
                    >
                      {isSelected && (
                        <Check className="w-3 h-3 text-primary-foreground" />
                      )}
                    </div>
                    <Truck className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {vehicle.plate || vehicle.name}
                      </p>
                      {vehicle.plate && vehicle.name !== vehicle.plate && (
                        <p className="text-xs text-muted-foreground truncate">
                          {vehicle.name}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
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
