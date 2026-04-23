"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Truck } from "lucide-react";
import type { FleetInput } from "@/lib/validations/fleet";

interface VehicleWithFleets {
  id: string;
  name: string;
  plate: string | null;
  fleets: Array<{ id: string; name: string }>;
}

interface FleetFormProps {
  onSubmit: (data: FleetInput) => Promise<void>;
  initialData?: Partial<FleetInput>;
  vehicles: VehicleWithFleets[];
  submitLabel?: string;
  onCancel?: () => void;
}

export function FleetForm({
  onSubmit,
  initialData,
  vehicles,
  submitLabel = "Guardar",
  onCancel,
}: FleetFormProps) {
  const defaultData: FleetInput = {
    name: initialData?.name ?? "",
    description: initialData?.description ?? "",
    vehicleIds: initialData?.vehicleIds ?? [],
    userIds: initialData?.userIds ?? [],
    type: initialData?.type ?? null,
    active: initialData?.active ?? true,
  };

  const [formData, setFormData] = useState<FleetInput>(defaultData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>(
    initialData?.vehicleIds ?? [],
  );
  const [vehicleSearch, setVehicleSearch] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const validationErrors: Record<string, string> = {};
    if (!formData.name.trim()) validationErrors.name = "Nombre es requerido";
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);

    const submitData: FleetInput = {
      ...formData,
      vehicleIds: selectedVehicleIds,
      userIds: [],
    };

    try {
      await onSubmit(submitData);
    } catch (error) {
      const err = error as {
        details?: Array<{ path: string[]; message: string }>;
        error?: string;
      };
      if (err.details) {
        const fieldErrors: Record<string, string> = {};
        for (const detail of err.details) {
          fieldErrors[detail.path[0]] = detail.message;
        }
        setErrors(fieldErrors);
      } else {
        setErrors({ form: err.error || "Error al guardar la flota" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (
    field: keyof FleetInput,
    value: FleetInput[keyof FleetInput],
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

  const toggleVehicleSelection = (vehicleId: string) => {
    setSelectedVehicleIds((prev) =>
      prev.includes(vehicleId)
        ? prev.filter((id) => id !== vehicleId)
        : [...prev, vehicleId],
    );
  };

  const filteredVehicles = vehicles.filter(
    (v) =>
      v.name.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
      v.plate?.toLowerCase().includes(vehicleSearch.toLowerCase()),
  );

  return (
    <form onSubmit={handleSubmit} className="h-full flex flex-col min-h-0 gap-3">
      {errors.form && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errors.form}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div className="flex-1 min-w-[200px] space-y-1">
          <Label htmlFor="name" className="text-xs">Nombre *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            disabled={isSubmitting}
            className={errors.name ? "border-destructive h-8 text-sm" : "h-8 text-sm"}
            placeholder="Ej: Flota Norte - Express"
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name}</p>
          )}
        </div>
        <div className="flex-1 min-w-[200px] space-y-1">
          <Label htmlFor="description" className="text-xs">Descripción</Label>
          <Input
            id="description"
            value={formData.description ?? ""}
            onChange={(e) => updateField("description", e.target.value || null)}
            disabled={isSubmitting}
            className="h-8 text-sm"
            placeholder="Descripción de la flota..."
          />
        </div>
        <div className="flex items-center gap-2 h-8">
          <Checkbox
            id="active"
            checked={formData.active}
            onCheckedChange={(checked) => updateField("active", checked === true)}
            disabled={isSubmitting}
          />
          <Label htmlFor="active" className="cursor-pointer text-xs whitespace-nowrap">
            Activa
          </Label>
        </div>
      </div>

      <div className="flex flex-col min-h-0 rounded-lg border bg-card flex-1">
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Truck className="h-4 w-4 text-muted-foreground" />
            Vehículos
          </div>
          <Badge variant="secondary" className="text-xs">
            {selectedVehicleIds.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2 px-3 pb-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={vehicleSearch}
              onChange={(e) => setVehicleSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setSelectedVehicleIds(vehicles.map((v) => v.id))}
            disabled={isSubmitting}
          >
            Todos
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setSelectedVehicleIds([])}
            disabled={isSubmitting}
          >
            Ninguno
          </Button>
        </div>
        <ScrollArea className="flex-1 min-h-0 border-t">
          <div className="p-1">
            {filteredVehicles.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">
                {vehicleSearch ? "Sin resultados" : "No hay vehículos"}
              </p>
            ) : (
              filteredVehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded cursor-pointer transition-colors ${
                    selectedVehicleIds.includes(vehicle.id)
                      ? "bg-primary/10"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={(e) => {
                    if (!e.nativeEvent.isTrusted) return;
                    toggleVehicleSelection(vehicle.id);
                  }}
                >
                  <Checkbox
                    checked={selectedVehicleIds.includes(vehicle.id)}
                    onCheckedChange={() => toggleVehicleSelection(vehicle.id)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={isSubmitting}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {vehicle.name}
                    </p>
                    {vehicle.plate && (
                      <p className="text-xs text-muted-foreground">
                        {vehicle.plate}
                      </p>
                    )}
                  </div>
                  {vehicle.fleets.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {vehicle.fleets.slice(0, 2).map((fleet) => (
                        <Badge
                          key={fleet.id}
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {fleet.name}
                        </Badge>
                      ))}
                      {vehicle.fleets.length > 2 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          +{vehicle.fleets.length - 2}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
        )}
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isSubmitting ? "Guardando" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
