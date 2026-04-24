"use client";

import { Box, DollarSign, Info, Package, Scale } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { useVehicleForm } from "./vehicle-form-context";

const VEHICLE_STATUS = [
  { value: "AVAILABLE", label: "Disponible" },
  { value: "IN_MAINTENANCE", label: "En Mantenimiento" },
  { value: "ASSIGNED", label: "Asignado" },
  { value: "INACTIVE", label: "Inactivo" },
];

export function VehicleFormGeneral() {
  const { state, actions, meta } = useVehicleForm();
  const { formData, errors, isSubmitting, selectedFleetIds } = state;
  const { updateField, toggleFleetSelection } = actions;
  const { fleets, companyProfile } = meta;

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Name */}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Nombre del Vehículo *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                disabled={isSubmitting}
                className={errors.name ? "border-destructive" : ""}
                placeholder="Ej: Camión Principal 01"
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>

            {/* Use Name As Plate */}
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox
                id="useNameAsPlate"
                checked={formData.useNameAsPlate}
                onCheckedChange={(checked) =>
                  updateField("useNameAsPlate", checked === true)
                }
                disabled={isSubmitting}
              />
              <Label htmlFor="useNameAsPlate" className="text-sm cursor-pointer">
                El nombre es la placa patente
              </Label>
            </div>

            {/* Plate */}
            {!formData.useNameAsPlate && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="plate">Placa Patente *</Label>
                <Input
                  id="plate"
                  value={formData.plate ?? ""}
                  onChange={(e) => updateField("plate", e.target.value)}
                  disabled={isSubmitting}
                  className={errors.plate ? "border-destructive" : ""}
                  placeholder="Ej: ABC-1234"
                />
                {errors.plate && (
                  <p className="text-xs text-destructive">{errors.plate}</p>
                )}
              </div>
            )}

            {/* Brand */}
            <div className="space-y-2">
              <Label htmlFor="brand">Marca</Label>
              <Input
                id="brand"
                value={formData.brand ?? ""}
                onChange={(e) => updateField("brand", e.target.value)}
                disabled={isSubmitting}
                placeholder="Ej: Volvo"
              />
            </div>

            {/* Model */}
            <div className="space-y-2">
              <Label htmlFor="model">Modelo</Label>
              <Input
                id="model"
                value={formData.model ?? ""}
                onChange={(e) => updateField("model", e.target.value)}
                disabled={isSubmitting}
                placeholder="Ej: FH16"
              />
            </div>

            {/* Max Orders */}
            <div className="space-y-2">
              <Label htmlFor="maxOrders" className="flex items-center gap-1">
                Capacidad Máx. Pedidos *
                <Info className="h-3 w-3 text-muted-foreground" />
              </Label>
              <Input
                id="maxOrders"
                type="number"
                min="1"
                value={formData.maxOrders}
                onChange={(e) =>
                  updateField("maxOrders", parseInt(e.target.value, 10) || 20)
                }
                disabled={isSubmitting}
                placeholder="20"
              />
            </div>

            {/* Max Value Capacity */}
            {companyProfile?.enableOrderValue && (
              <div className="space-y-2">
                <Label
                  htmlFor="maxValueCapacity"
                  className="flex items-center gap-1"
                >
                  <DollarSign className="h-3 w-3 text-amber-500" />
                  Capacidad Máx. Valorizado
                </Label>
                <Input
                  id="maxValueCapacity"
                  type="number"
                  min="1"
                  value={formData.maxValueCapacity ?? ""}
                  onChange={(e) =>
                    updateField(
                      "maxValueCapacity",
                      e.target.value ? parseInt(e.target.value, 10) : null,
                    )
                  }
                  disabled={isSubmitting}
                  placeholder="Ej: 50000"
                />
                <p className="text-xs text-muted-foreground">
                  Valor máximo en moneda local que puede transportar
                </p>
              </div>
            )}

            {/* Max Units Capacity */}
            {companyProfile?.enableUnits && (
              <div className="space-y-2">
                <Label
                  htmlFor="maxUnitsCapacity"
                  className="flex items-center gap-1"
                >
                  <Package className="h-3 w-3 text-purple-500" />
                  Capacidad Máx. Unidades
                </Label>
                <Input
                  id="maxUnitsCapacity"
                  type="number"
                  min="1"
                  value={formData.maxUnitsCapacity ?? ""}
                  onChange={(e) =>
                    updateField(
                      "maxUnitsCapacity",
                      e.target.value ? parseInt(e.target.value, 10) : null,
                    )
                  }
                  disabled={isSubmitting}
                  placeholder="Ej: 100"
                />
                <p className="text-xs text-muted-foreground">
                  Cantidad máxima de unidades/items que puede transportar
                </p>
              </div>
            )}

            {/* Weight Capacity */}
            {companyProfile?.enableWeight && (
              <div className="space-y-2">
                <Label
                  htmlFor="weightCapacity"
                  className="flex items-center gap-1"
                >
                  <Scale className="h-3 w-3 text-blue-500" />
                  Capacidad Máx. Peso (kg)
                </Label>
                <Input
                  id="weightCapacity"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.weightCapacity ?? ""}
                  onChange={(e) =>
                    updateField(
                      "weightCapacity",
                      e.target.value ? parseFloat(e.target.value) : null,
                    )
                  }
                  disabled={isSubmitting}
                  placeholder="Ej: 1000"
                />
                <p className="text-xs text-muted-foreground">
                  Peso máximo en kilogramos que puede transportar
                </p>
              </div>
            )}

            {/* Volume Capacity */}
            {companyProfile?.enableVolume && (
              <div className="space-y-2">
                <Label
                  htmlFor="volumeCapacity"
                  className="flex items-center gap-1"
                >
                  <Box className="h-3 w-3 text-green-500" />
                  Capacidad Máx. Volumen (m³)
                </Label>
                <Input
                  id="volumeCapacity"
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.volumeCapacity ?? ""}
                  onChange={(e) =>
                    updateField(
                      "volumeCapacity",
                      e.target.value ? parseFloat(e.target.value) : null,
                    )
                  }
                  disabled={isSubmitting}
                  placeholder="Ej: 10"
                />
                <p className="text-xs text-muted-foreground">
                  Volumen máximo en metros cúbicos que puede transportar
                </p>
              </div>
            )}

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => updateField("status", value)}
                disabled={isSubmitting}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_STATUS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Active */}
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox
                id="active"
                checked={formData.active}
                onCheckedChange={(checked) =>
                  updateField("active", checked === true)
                }
                disabled={isSubmitting}
              />
              <Label htmlFor="active" className="text-sm cursor-pointer">
                Registro Activo
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flotas */}
      <Card>
        <CardContent className="pt-4">
          <Label className="text-sm font-medium">Flotas</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Selecciona las flotas a las que pertenece
          </p>
          <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
            {fleets.length === 0 ? (
              <p className="text-xs text-muted-foreground col-span-2">
                No hay flotas disponibles
              </p>
            ) : (
              fleets.map((fleet) => (
                <div
                  key={fleet.id}
                  className="flex items-center gap-2 p-2 rounded border text-sm"
                >
                  <Checkbox
                    id={`fleet-${fleet.id}`}
                    checked={selectedFleetIds.includes(fleet.id)}
                    onCheckedChange={() => toggleFleetSelection(fleet.id)}
                    disabled={isSubmitting}
                  />
                  <Label
                    htmlFor={`fleet-${fleet.id}`}
                    className="text-sm cursor-pointer"
                  >
                    {fleet.name}
                  </Label>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
