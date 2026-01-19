"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationPicker } from "@/components/ui/location-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TimePicker } from "@/components/ui/time-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VehicleInput } from "@/lib/validations/vehicle";

interface VehicleFormProps {
  onSubmit: (data: VehicleInput) => Promise<void>;
  initialData?: Partial<VehicleInput>;
  fleets: Array<{ id: string; name: string }>;
  drivers: Array<{ id: string; name: string }>;
  submitLabel?: string;
  onCancel?: () => void;
}

const LOAD_TYPES = [
  { value: "LIGHT", label: "Liviano" },
  { value: "HEAVY", label: "Pesado" },
];

const VEHICLE_STATUS = [
  { value: "AVAILABLE", label: "Disponible" },
  { value: "IN_MAINTENANCE", label: "En Mantenimiento" },
  { value: "ASSIGNED", label: "Asignado" },
  { value: "INACTIVE", label: "Inactivo" },
];

export function VehicleForm({
  onSubmit,
  initialData,
  fleets,
  drivers,
  submitLabel = "Guardar",
  onCancel,
}: VehicleFormProps) {
  const defaultData: VehicleInput = {
    name: initialData?.name ?? "",
    useNameAsPlate: initialData?.useNameAsPlate ?? false,
    plate: initialData?.plate ?? "",
    loadType: initialData?.loadType ?? null,
    maxOrders: initialData?.maxOrders ?? 20,
    originAddress: initialData?.originAddress ?? "",
    originLatitude: initialData?.originLatitude ?? "",
    originLongitude: initialData?.originLongitude ?? "",
    assignedDriverId: initialData?.assignedDriverId ?? null,
    workdayStart: initialData?.workdayStart ?? "",
    workdayEnd: initialData?.workdayEnd ?? "",
    hasBreakTime: initialData?.hasBreakTime ?? false,
    breakDuration: initialData?.breakDuration ?? null,
    breakTimeStart: initialData?.breakTimeStart ?? "",
    breakTimeEnd: initialData?.breakTimeEnd ?? "",
    fleetIds: initialData?.fleetIds ?? [],
    brand: initialData?.brand ?? "",
    model: initialData?.model ?? "",
    year: initialData?.year ?? null,
    type: initialData?.type ?? null,
    weightCapacity: initialData?.weightCapacity ?? null,
    volumeCapacity: initialData?.volumeCapacity ?? null,
    refrigerated: initialData?.refrigerated ?? false,
    heated: initialData?.heated ?? false,
    lifting: initialData?.lifting ?? false,
    licenseRequired: initialData?.licenseRequired ?? null,
    insuranceExpiry: initialData?.insuranceExpiry ?? null,
    inspectionExpiry: initialData?.inspectionExpiry ?? null,
    status: initialData?.status ?? "AVAILABLE",
    active: initialData?.active ?? true,
  };

  const [formData, setFormData] = useState<VehicleInput>(defaultData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFleetIds, setSelectedFleetIds] = useState<string[]>(
    initialData?.fleetIds ?? [],
  );
  const [activeTab, setActiveTab] = useState("general");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    const emptyToNull = <T,>(val: T): T | null => (val === "" ? null : val);

    const submitData: VehicleInput = {
      ...formData,
      fleetIds: selectedFleetIds,
      plate: formData.useNameAsPlate ? formData.name : formData.plate,
      originAddress: emptyToNull(formData.originAddress),
      originLatitude: emptyToNull(formData.originLatitude),
      originLongitude: emptyToNull(formData.originLongitude),
      workdayStart: emptyToNull(formData.workdayStart),
      workdayEnd: emptyToNull(formData.workdayEnd),
      breakTimeStart: emptyToNull(formData.breakTimeStart),
      breakTimeEnd: emptyToNull(formData.breakTimeEnd),
      brand: emptyToNull(formData.brand),
      model: emptyToNull(formData.model),
      insuranceExpiry: emptyToNull(formData.insuranceExpiry),
      inspectionExpiry: emptyToNull(formData.inspectionExpiry),
      loadType: emptyToNull(formData.loadType) as VehicleInput["loadType"],
      type: emptyToNull(formData.type) as VehicleInput["type"],
      licenseRequired: emptyToNull(
        formData.licenseRequired,
      ) as VehicleInput["licenseRequired"],
      assignedDriverId: emptyToNull(formData.assignedDriverId),
    };

    try {
      await onSubmit(submitData);
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
        setErrors({ form: err.error || "Error al guardar el vehículo" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (
    field: keyof VehicleInput,
    value: VehicleInput[keyof VehicleInput],
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

  const toggleFleetSelection = (fleetId: string) => {
    setSelectedFleetIds((prev) => {
      if (prev.includes(fleetId)) {
        return prev.filter((id) => id !== fleetId);
      } else {
        return [...prev, fleetId];
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.form && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errors.form}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="operation">Operación</TabsTrigger>
          <TabsTrigger value="config">Configuración</TabsTrigger>
        </TabsList>

        {/* Tab 1: General - Identificación y Carga */}
        <TabsContent value="general" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Name */}
                <div className="space-y-2">
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

                {/* Load Type */}
                <div className="space-y-2">
                  <Label htmlFor="loadType">Tipo de Carga</Label>
                  <Select
                    value={formData.loadType ?? ""}
                    onValueChange={(value) =>
                      updateField("loadType", value || null)
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="loadType">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {LOAD_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Label
                    htmlFor="useNameAsPlate"
                    className="text-sm cursor-pointer"
                  >
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

                {/* Max Orders */}
                <div className="space-y-2">
                  <Label
                    htmlFor="maxOrders"
                    className="flex items-center gap-1"
                  >
                    Capacidad Máx. Pedidos *
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </Label>
                  <Input
                    id="maxOrders"
                    type="number"
                    min="1"
                    value={formData.maxOrders}
                    onChange={(e) =>
                      updateField(
                        "maxOrders",
                        parseInt(e.target.value, 10) || 20,
                      )
                    }
                    disabled={isSubmitting}
                    placeholder="20"
                  />
                </div>

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
        </TabsContent>

        {/* Tab 2: Operación - Origen y Jornada */}
        <TabsContent value="operation" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-4 space-y-4">
              <h4 className="font-medium text-sm">Punto de Origen</h4>

              {/* Campos manuales */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="originAddress">Dirección</Label>
                  <Input
                    id="originAddress"
                    value={formData.originAddress ?? ""}
                    onChange={(e) =>
                      updateField("originAddress", e.target.value)
                    }
                    disabled={isSubmitting}
                    placeholder="Av. Principal 123, Lima"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="originLatitude">Latitud</Label>
                  <Input
                    id="originLatitude"
                    value={formData.originLatitude ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Detectar si se pegó "lat, lng" o "lat,lng"
                      const coordsMatch = value.match(
                        /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/,
                      );
                      if (coordsMatch) {
                        updateField("originLatitude", coordsMatch[1]);
                        updateField("originLongitude", coordsMatch[2]);
                      } else {
                        updateField("originLatitude", value);
                      }
                    }}
                    disabled={isSubmitting}
                    placeholder="-12.0464 o pega lat, lng"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="originLongitude">Longitud</Label>
                  <Input
                    id="originLongitude"
                    value={formData.originLongitude ?? ""}
                    onChange={(e) =>
                      updateField("originLongitude", e.target.value)
                    }
                    disabled={isSubmitting}
                    placeholder="-77.0428"
                  />
                </div>
              </div>

              {/* Mapa interactivo */}
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">
                  O selecciona en el mapa:
                </p>
                <LocationPicker
                  value={{
                    lat: formData.originLatitude ?? "",
                    lng: formData.originLongitude ?? "",
                    address: formData.originAddress ?? "",
                  }}
                  onChange={(location) => {
                    updateField("originLatitude", location.lat);
                    updateField("originLongitude", location.lng);
                    if (location.address) {
                      updateField("originAddress", location.address);
                    }
                  }}
                  height="250px"
                  disabled={isSubmitting}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-4">
              <h4 className="font-medium text-sm">Jornada Laboral</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="workdayStart">Inicio</Label>
                  <TimePicker
                    id="workdayStart"
                    value={formData.workdayStart}
                    onChange={(time) => updateField("workdayStart", time)}
                    placeholder="Hora inicio"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workdayEnd">Fin</Label>
                  <TimePicker
                    id="workdayEnd"
                    value={formData.workdayEnd}
                    onChange={(time) => updateField("workdayEnd", time)}
                    placeholder="Hora fin"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="pt-2 border-t">
                <div className="flex items-center gap-2 mb-3">
                  <Checkbox
                    id="hasBreakTime"
                    checked={formData.hasBreakTime}
                    onCheckedChange={(checked) =>
                      updateField("hasBreakTime", checked === true)
                    }
                    disabled={isSubmitting}
                  />
                  <Label
                    htmlFor="hasBreakTime"
                    className="text-sm cursor-pointer"
                  >
                    Tiempo de descanso
                  </Label>
                </div>

                {formData.hasBreakTime && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="breakDuration" className="text-xs">
                        Duración (min)
                      </Label>
                      <Input
                        id="breakDuration"
                        type="number"
                        min="1"
                        value={formData.breakDuration ?? ""}
                        onChange={(e) =>
                          updateField(
                            "breakDuration",
                            parseInt(e.target.value, 10) || null,
                          )
                        }
                        disabled={isSubmitting}
                        placeholder="60"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="breakTimeStart" className="text-xs">
                        Inicio
                      </Label>
                      <TimePicker
                        id="breakTimeStart"
                        value={formData.breakTimeStart}
                        onChange={(time) => updateField("breakTimeStart", time)}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="breakTimeEnd" className="text-xs">
                        Fin
                      </Label>
                      <TimePicker
                        id="breakTimeEnd"
                        value={formData.breakTimeEnd}
                        onChange={(time) => updateField("breakTimeEnd", time)}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Configuración - Conductor y Documentos */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-4 space-y-4">
              <h4 className="font-medium text-sm">Conductor Asignado</h4>
              <Select
                value={formData.assignedDriverId ?? "__none__"}
                onValueChange={(value) =>
                  updateField(
                    "assignedDriverId",
                    value === "__none__" ? null : value,
                  )
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin conductor asignado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin conductor</SelectItem>
                  {drivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-4">
              <h4 className="font-medium text-sm">Vencimientos</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="insuranceExpiry" className="text-xs">
                    Seguro
                  </Label>
                  <DatePicker
                    id="insuranceExpiry"
                    value={
                      formData.insuranceExpiry
                        ? new Date(formData.insuranceExpiry)
                        : null
                    }
                    onChange={(date) =>
                      updateField(
                        "insuranceExpiry",
                        date ? date.toISOString().split("T")[0] : null,
                      )
                    }
                    placeholder="Fecha"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inspectionExpiry" className="text-xs">
                    Inspección
                  </Label>
                  <DatePicker
                    id="inspectionExpiry"
                    value={
                      formData.inspectionExpiry
                        ? new Date(formData.inspectionExpiry)
                        : null
                    }
                    onChange={(date) =>
                      updateField(
                        "inspectionExpiry",
                        date ? date.toISOString().split("T")[0] : null,
                      )
                    }
                    placeholder="Fecha"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-3 pt-4 border-t">
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
