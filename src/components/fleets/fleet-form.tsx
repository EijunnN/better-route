"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Truck, Users, Building2 } from "lucide-react";
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
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");

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
        : [...prev, vehicleId]
    );
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const roleLabels: Record<string, string> = {
    ADMIN: "Admin",
    CONDUCTOR: "Conductor",
    AGENTE_SEGUIMIENTO: "Agente",
    PLANIFICADOR: "Planificador",
  };

  const filteredVehicles = vehicles.filter(
    (v) =>
      v.name.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
      v.plate?.toLowerCase().includes(vehicleSearch.toLowerCase())
  );

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.form && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {errors.form}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Fleet Info & Vehicles */}
        <div className="space-y-6">
          {/* Fleet Information */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Información de la Flota
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  disabled={isSubmitting}
                  className={errors.name ? "border-destructive" : ""}
                  placeholder="Ej: Flota Norte - Express"
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <textarea
                  id="description"
                  value={formData.description ?? ""}
                  onChange={(e) =>
                    updateField("description", e.target.value || null)
                  }
                  disabled={isSubmitting}
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  placeholder="Descripción de la flota..."
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Checkbox
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) =>
                    updateField("active", checked === true)
                  }
                  disabled={isSubmitting}
                />
                <Label htmlFor="active" className="cursor-pointer text-sm">
                  Flota activa
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Vehicles */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Vehículos
                </CardTitle>
                <Badge variant="secondary">
                  {selectedVehicleIds.length} seleccionados
                </Badge>
              </div>
              <CardDescription>
                Vehículos asignados a esta flota
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar vehículo..."
                  value={vehicleSearch}
                  onChange={(e) => setVehicleSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
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
              <ScrollArea className="h-[280px] rounded-md border">
                <div className="p-2 space-y-1">
                  {filteredVehicles.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">
                      {vehicleSearch ? "Sin resultados" : "No hay vehículos"}
                    </p>
                  ) : (
                    filteredVehicles.map((vehicle) => (
                      <div
                        key={vehicle.id}
                        className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                          selectedVehicleIds.includes(vehicle.id)
                            ? "bg-primary/10 border border-primary/30"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => toggleVehicleSelection(vehicle.id)}
                      >
                        <Checkbox
                          checked={selectedVehicleIds.includes(vehicle.id)}
                          onCheckedChange={() => toggleVehicleSelection(vehicle.id)}
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
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Users with Access */}
        <div className="space-y-6">
          <Card className="h-full">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Usuarios con Acceso
                </CardTitle>
                <Badge variant="secondary">
                  {selectedUserIds.length} seleccionados
                </Badge>
              </div>
              <CardDescription>
                Usuarios que pueden ver esta flota en monitoreo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuario..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedUserIds(users.map((u) => u.id))}
                  disabled={isSubmitting}
                >
                  Todos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedUserIds([])}
                  disabled={isSubmitting}
                >
                  Ninguno
                </Button>
              </div>
              <ScrollArea className="h-[500px] rounded-md border">
                <div className="p-2 space-y-1">
                  {filteredUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">
                      {userSearch ? "Sin resultados" : "No hay usuarios"}
                    </p>
                  ) : (
                    filteredUsers.map((user) => (
                      <div
                        key={user.id}
                        className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                          selectedUserIds.includes(user.id)
                            ? "bg-primary/10 border border-primary/30"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => toggleUserSelection(user.id)}
                      >
                        <Checkbox
                          checked={selectedUserIds.includes(user.id)}
                          onCheckedChange={() => toggleUserSelection(user.id)}
                          disabled={isSubmitting}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {user.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {roleLabels[user.role] || user.role}
                          </p>
                        </div>
                        {user.fleets.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {user.fleets.slice(0, 2).map((fleet) => (
                              <Badge
                                key={fleet.id}
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {fleet.name}
                              </Badge>
                            ))}
                            {user.fleets.length > 2 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                +{user.fleets.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end gap-4 pt-4">
        <Button type="submit" disabled={isSubmitting} size="lg">
          {isSubmitting ? "Guardando..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
