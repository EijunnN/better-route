"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FleetInput } from "@/lib/validations/fleet";

interface VehicleWithFleets {
  id: string;
  name: string;
  plate: string | null;
  fleets: Array<{ id: string; name: string }>;
}

interface UserWithFleets {
  id: string;
  name: string;
  role: string;
  fleets: Array<{ id: string; name: string }>;
}

interface FleetFormProps {
  onSubmit: (data: FleetInput) => Promise<void>;
  initialData?: Partial<FleetInput>;
  vehicles: VehicleWithFleets[];
  users: UserWithFleets[];
  submitLabel?: string;
}

export function FleetForm({
  onSubmit,
  initialData,
  vehicles,
  users,
  submitLabel = "Guardar",
}: FleetFormProps) {
  const defaultData: FleetInput = {
    name: initialData?.name ?? "",
    description: initialData?.description ?? "",
    vehicleIds: initialData?.vehicleIds ?? [],
    userIds: initialData?.userIds ?? [],
    // Legacy fields (optional)
    type: initialData?.type ?? null,
    weightCapacity: initialData?.weightCapacity ?? null,
    volumeCapacity: initialData?.volumeCapacity ?? null,
    operationStart: initialData?.operationStart ?? null,
    operationEnd: initialData?.operationEnd ?? null,
    active: initialData?.active ?? true,
  };

  const [formData, setFormData] = useState<FleetInput>(defaultData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>(
    initialData?.vehicleIds ?? [],
  );
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    initialData?.userIds ?? [],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    const submitData: FleetInput = {
      ...formData,
      vehicleIds: selectedVehicleIds,
      userIds: selectedUserIds,
    };

    try {
      await onSubmit(submitData);
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

  const toggleVehicleSelection = (vehicleId: string) => {
    setSelectedVehicleIds((prev) => {
      if (prev.includes(vehicleId)) {
        return prev.filter((id) => id !== vehicleId);
      } else {
        return [...prev, vehicleId];
      }
    });
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const selectAllVehicles = () => {
    setSelectedVehicleIds(vehicles.map((v) => v.id));
  };

  const deselectAllVehicles = () => {
    setSelectedVehicleIds([]);
  };

  const selectAllUsers = () => {
    setSelectedUserIds(users.map((u) => u.id));
  };

  const deselectAllUsers = () => {
    setSelectedUserIds([]);
  };

  // Role labels for display
  const roleLabels: Record<string, string> = {
    ADMIN: "Administrador",
    CONDUCTOR: "Conductor",
    AGENTE_SEGUIMIENTO: "Agente de Seguimiento",
    PLANIFICADOR: "Planificador",
  };

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
          Información de la Flota
        </h3>
        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre de la Flota *</Label>
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
              placeholder="Ej: Flota Norte - Express"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <textarea
              id="description"
              value={formData.description ?? ""}
              onChange={(e) =>
                updateField("description", e.target.value || null)
              }
              disabled={isSubmitting}
              rows={2}
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors resize-y"
              placeholder="Descripción de la flota..."
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Vehicle Selection */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-lg font-medium">Vehículos</h3>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selectAllVehicles}
              disabled={isSubmitting}
            >
              Seleccionar todos
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={deselectAllVehicles}
              disabled={isSubmitting}
            >
              Deseleccionar todos
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Selecciona los vehículos que pertenecerán a esta flota. Un vehículo
          puede estar en múltiples flotas.
        </p>
        <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-2">
          {vehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">
              No hay vehículos disponibles
            </p>
          ) : (
            vehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                className={`flex items-center justify-between p-3 rounded-md border transition-colors ${
                  selectedVehicleIds.includes(vehicle.id)
                    ? "bg-primary/10 border-primary"
                    : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    id={`vehicle-${vehicle.id}`}
                    type="checkbox"
                    checked={selectedVehicleIds.includes(vehicle.id)}
                    onChange={() => toggleVehicleSelection(vehicle.id)}
                    disabled={isSubmitting}
                    className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
                  />
                  <div>
                    <Label
                      htmlFor={`vehicle-${vehicle.id}`}
                      className="cursor-pointer font-medium"
                    >
                      {vehicle.name}
                    </Label>
                    {vehicle.plate && (
                      <p className="text-xs text-muted-foreground">
                        Placa: {vehicle.plate}
                      </p>
                    )}
                  </div>
                </div>
                {vehicle.fleets.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {vehicle.fleets.map((fleet) => (
                      <span
                        key={fleet.id}
                        className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                      >
                        {fleet.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {selectedVehicleIds.length} vehículo(s) seleccionado(s)
        </p>
        {errors.vehicleIds && (
          <p className="text-sm text-destructive">{errors.vehicleIds}</p>
        )}
      </div>

      {/* User Selection */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-lg font-medium">Usuarios con Acceso</h3>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selectAllUsers}
              disabled={isSubmitting}
            >
              Seleccionar todos
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={deselectAllUsers}
              disabled={isSubmitting}
            >
              Deseleccionar todos
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Selecciona los usuarios que podrán ver esta flota en el monitoreo.
          Solo se mostrarán los vehículos de las flotas asignadas.
        </p>
        <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-2">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">
              No hay usuarios disponibles
            </p>
          ) : (
            users.map((user) => (
              <div
                key={user.id}
                className={`flex items-center justify-between p-3 rounded-md border transition-colors ${
                  selectedUserIds.includes(user.id)
                    ? "bg-primary/10 border-primary"
                    : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    id={`user-${user.id}`}
                    type="checkbox"
                    checked={selectedUserIds.includes(user.id)}
                    onChange={() => toggleUserSelection(user.id)}
                    disabled={isSubmitting}
                    className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
                  />
                  <div>
                    <Label
                      htmlFor={`user-${user.id}`}
                      className="cursor-pointer font-medium"
                    >
                      {user.name}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {roleLabels[user.role] || user.role}
                    </p>
                  </div>
                </div>
                {user.fleets.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {user.fleets.map((fleet) => (
                      <span
                        key={fleet.id}
                        className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                      >
                        {fleet.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {selectedUserIds.length} usuario(s) seleccionado(s)
        </p>
        {errors.userIds && (
          <p className="text-sm text-destructive">{errors.userIds}</p>
        )}
      </div>

      {/* Status */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium border-b pb-2">Estado</h3>
        <div className="flex items-center gap-2">
          <input
            id="active"
            type="checkbox"
            checked={formData.active}
            onChange={(e) => updateField("active", e.target.checked)}
            disabled={isSubmitting}
            className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
          />
          <Label htmlFor="active" className="cursor-pointer">
            Flota {formData.active ? "Activa" : "Inactiva"}
          </Label>
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
