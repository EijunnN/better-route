"use client";

import { Info } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  { value: "PACKAGES", label: "Paquetes" },
  { value: "PALLETS", label: "Pallets" },
  { value: "BULK", label: "Granel" },
  { value: "REFRIGERATED", label: "Refrigerado" },
  { value: "DANGEROUS", label: "Peligroso" },
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
    // New fields
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
    // Legacy fields (optional)
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
  const [showMap, setShowMap] = useState(false);
  const [selectedFleetIds, setSelectedFleetIds] = useState<string[]>(
    initialData?.fleetIds ?? [],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    // Helper to convert empty strings to null
    const emptyToNull = <T,>(val: T): T | null =>
      val === "" ? null : val;

    const submitData: VehicleInput = {
      ...formData,
      fleetIds: selectedFleetIds,
      plate: formData.useNameAsPlate ? formData.name : formData.plate,
      // Clean up optional fields - convert empty strings to null
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
      // Enum fields - ensure null instead of empty string
      loadType: emptyToNull(formData.loadType) as VehicleInput["loadType"],
      type: emptyToNull(formData.type) as VehicleInput["type"],
      licenseRequired: emptyToNull(formData.licenseRequired) as VehicleInput["licenseRequired"],
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.form && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {errors.form}
        </div>
      )}

      {/* Identification Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium border-b pb-2">Identificación</h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del Vehículo *</Label>
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
              placeholder="Ej: Camión Principal 01"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Use Name As Plate Checkbox */}
          <div className="space-y-2 flex items-end">
            <div className="flex items-center gap-2 pb-2">
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
          </div>

          {/* Plate - only show if useNameAsPlate is false */}
          {!formData.useNameAsPlate && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="plate">Placa Patente *</Label>
              <Input
                id="plate"
                value={formData.plate ?? ""}
                onChange={(e) => updateField("plate", e.target.value)}
                disabled={isSubmitting}
                className={
                  errors.plate
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }
                placeholder="Ej: ABC-1234"
              />
              {errors.plate && (
                <p className="text-sm text-destructive">{errors.plate}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Capacity Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium border-b pb-2">Carga</h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Load Type */}
          <div className="space-y-2">
            <Label htmlFor="loadType">Tipo de Carga</Label>
            <Select
              value={formData.loadType ?? ""}
              onValueChange={(value) => updateField("loadType", value || null)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="loadType">
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                {LOAD_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.loadType && (
              <p className="text-sm text-destructive">{errors.loadType}</p>
            )}
          </div>

          {/* Max Orders (Tracks) */}
          <div className="space-y-2">
            <Label htmlFor="maxOrders" className="flex items-center gap-2">
              Capacidad Máxima de Pedidos *
              <span
                className="text-muted-foreground cursor-help"
                title="Cantidad máxima de visitas/entregas que puede realizar este vehículo"
              >
                <Info className="h-4 w-4" />
              </span>
            </Label>
            <Input
              id="maxOrders"
              type="number"
              min="1"
              step="1"
              value={formData.maxOrders}
              onChange={(e) =>
                updateField("maxOrders", parseInt(e.target.value, 10) || 20)
              }
              disabled={isSubmitting}
              className={
                errors.maxOrders
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
              placeholder="Ej: 20"
            />
            <p className="text-xs text-muted-foreground">
              Cantidad máxima de visitas/entregas por ruta
            </p>
            {errors.maxOrders && (
              <p className="text-sm text-destructive">{errors.maxOrders}</p>
            )}
          </div>
        </div>
      </div>

      {/* Origin Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium border-b pb-2">Origen</h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Origin Address */}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="originAddress">Dirección de Origen</Label>
            <Input
              id="originAddress"
              value={formData.originAddress ?? ""}
              onChange={(e) => updateField("originAddress", e.target.value)}
              disabled={isSubmitting}
              className={
                errors.originAddress
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
              placeholder="Ej: Av. Principal 123, Lima"
            />
            {errors.originAddress && (
              <p className="text-sm text-destructive">{errors.originAddress}</p>
            )}
          </div>

          {/* Origin Latitude */}
          <div className="space-y-2">
            <Label htmlFor="originLatitude">Latitud Origen</Label>
            <Input
              id="originLatitude"
              value={formData.originLatitude ?? ""}
              onChange={(e) => updateField("originLatitude", e.target.value)}
              disabled={isSubmitting}
              className={
                errors.originLatitude
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
              placeholder="Ej: -12.0464"
            />
            {errors.originLatitude && (
              <p className="text-sm text-destructive">
                {errors.originLatitude}
              </p>
            )}
          </div>

          {/* Origin Longitude */}
          <div className="space-y-2">
            <Label htmlFor="originLongitude">Longitud Origen</Label>
            <Input
              id="originLongitude"
              value={formData.originLongitude ?? ""}
              onChange={(e) => updateField("originLongitude", e.target.value)}
              disabled={isSubmitting}
              className={
                errors.originLongitude
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
              placeholder="Ej: -77.0428"
            />
            {errors.originLongitude && (
              <p className="text-sm text-destructive">
                {errors.originLongitude}
              </p>
            )}
          </div>

          {/* Show Map Toggle */}
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="showMap"
                checked={showMap}
                onCheckedChange={(checked) => setShowMap(checked === true)}
                disabled={isSubmitting}
              />
              <Label htmlFor="showMap" className="text-sm cursor-pointer">
                Mostrar mapa para seleccionar ubicación
              </Label>
            </div>
            {showMap && (
              <div className="mt-4 h-64 rounded-md border border-input bg-muted flex items-center justify-center">
                <p className="text-muted-foreground">
                  Mapa interactivo (implementar con MapLibre)
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fleet Selection Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium border-b pb-2">Flotas</h3>
        <div className="space-y-2">
          <Label>Seleccionar Flotas</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Un vehículo puede pertenecer a múltiples flotas
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fleets.length === 0 ? (
              <p className="text-sm text-muted-foreground col-span-full">
                No hay flotas disponibles
              </p>
            ) : (
              fleets.map((fleet) => (
                <div
                  key={fleet.id}
                  className="flex items-center gap-2 p-2 rounded-md border hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    id={`fleet-${fleet.id}`}
                    checked={selectedFleetIds.includes(fleet.id)}
                    onCheckedChange={() => toggleFleetSelection(fleet.id)}
                    disabled={isSubmitting}
                  />
                  <Label
                    htmlFor={`fleet-${fleet.id}`}
                    className="text-sm cursor-pointer flex-1"
                  >
                    {fleet.name}
                  </Label>
                </div>
              ))
            )}
          </div>
          {errors.fleetIds && (
            <p className="text-sm text-destructive">{errors.fleetIds}</p>
          )}
        </div>
      </div>

      {/* Optional Information Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium border-b pb-2">
          Información Opcional
        </h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Assigned Driver */}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="assignedDriverId">Conductor Asignado</Label>
            <Select
              value={formData.assignedDriverId ?? "__none__"}
              onValueChange={(value) =>
                updateField("assignedDriverId", value === "__none__" ? null : value)
              }
              disabled={isSubmitting}
            >
              <SelectTrigger id="assignedDriverId">
                <SelectValue placeholder="Sin conductor asignado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin conductor asignado</SelectItem>
                {drivers.map((driver) => (
                  <SelectItem key={driver.id} value={driver.id}>
                    {driver.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Selecciona un conductor que usará este vehículo
            </p>
            {errors.assignedDriverId && (
              <p className="text-sm text-destructive">
                {errors.assignedDriverId}
              </p>
            )}
          </div>

          {/* Workday Section */}
          <div className="space-y-4 sm:col-span-2 border rounded-md p-4">
            <h4 className="font-medium">Jornada Laboral</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Workday Start */}
              <div className="space-y-2">
                <Label htmlFor="workdayStart">Horario de Inicio</Label>
                <TimePicker
                  id="workdayStart"
                  value={formData.workdayStart}
                  onChange={(time) => updateField("workdayStart", time)}
                  placeholder="Seleccionar hora"
                  disabled={isSubmitting}
                />
                {errors.workdayStart && (
                  <p className="text-sm text-destructive">
                    {errors.workdayStart}
                  </p>
                )}
              </div>

              {/* Workday End */}
              <div className="space-y-2">
                <Label htmlFor="workdayEnd">Horario de Fin</Label>
                <TimePicker
                  id="workdayEnd"
                  value={formData.workdayEnd}
                  onChange={(time) => updateField("workdayEnd", time)}
                  placeholder="Seleccionar hora"
                  disabled={isSubmitting}
                />
                {errors.workdayEnd && (
                  <p className="text-sm text-destructive">
                    {errors.workdayEnd}
                  </p>
                )}
              </div>
            </div>

            {/* Break Time Toggle */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2">
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
                  Aplica tiempo de descanso
                </Label>
              </div>

              {/* Break Time Fields - only show if hasBreakTime is true */}
              {formData.hasBreakTime && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mt-4">
                  {/* Break Duration */}
                  <div className="space-y-2">
                    <Label htmlFor="breakDuration">Duración (minutos) *</Label>
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
                      className={
                        errors.breakDuration
                          ? "border-destructive focus-visible:ring-destructive"
                          : ""
                      }
                      placeholder="Ej: 60"
                    />
                    {errors.breakDuration && (
                      <p className="text-sm text-destructive">
                        {errors.breakDuration}
                      </p>
                    )}
                  </div>

                  {/* Break Time Start */}
                  <div className="space-y-2">
                    <Label htmlFor="breakTimeStart">Inicio Descanso</Label>
                    <TimePicker
                      id="breakTimeStart"
                      value={formData.breakTimeStart}
                      onChange={(time) => updateField("breakTimeStart", time)}
                      placeholder="Seleccionar hora"
                      disabled={isSubmitting}
                    />
                    {errors.breakTimeStart && (
                      <p className="text-sm text-destructive">
                        {errors.breakTimeStart}
                      </p>
                    )}
                  </div>

                  {/* Break Time End */}
                  <div className="space-y-2">
                    <Label htmlFor="breakTimeEnd">Fin Descanso</Label>
                    <TimePicker
                      id="breakTimeEnd"
                      value={formData.breakTimeEnd}
                      onChange={(time) => updateField("breakTimeEnd", time)}
                      placeholder="Seleccionar hora"
                      disabled={isSubmitting}
                    />
                    {errors.breakTimeEnd && (
                      <p className="text-sm text-destructive">
                        {errors.breakTimeEnd}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Documentation Expiry Section */}
          <div className="space-y-4 sm:col-span-2 border rounded-md p-4">
            <h4 className="font-medium">Vencimientos de Documentación</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Insurance Expiry */}
              <div className="space-y-2">
                <Label htmlFor="insuranceExpiry">Vencimiento del Seguro</Label>
                <DatePicker
                  id="insuranceExpiry"
                  value={formData.insuranceExpiry ? new Date(formData.insuranceExpiry) : null}
                  onChange={(date) =>
                    updateField("insuranceExpiry", date ? date.toISOString().split("T")[0] : null)
                  }
                  placeholder="Seleccionar fecha"
                  disabled={isSubmitting}
                />
                {errors.insuranceExpiry && (
                  <p className="text-sm text-destructive">
                    {errors.insuranceExpiry}
                  </p>
                )}
              </div>

              {/* Inspection Expiry */}
              <div className="space-y-2">
                <Label htmlFor="inspectionExpiry">Vencimiento de Inspección</Label>
                <DatePicker
                  id="inspectionExpiry"
                  value={formData.inspectionExpiry ? new Date(formData.inspectionExpiry) : null}
                  onChange={(date) =>
                    updateField("inspectionExpiry", date ? date.toISOString().split("T")[0] : null)
                  }
                  placeholder="Seleccionar fecha"
                  disabled={isSubmitting}
                />
                {errors.inspectionExpiry && (
                  <p className="text-sm text-destructive">
                    {errors.inspectionExpiry}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium border-b pb-2">Estado</h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status">Estado del Vehículo</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => updateField("status", value)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="status">
                <SelectValue placeholder="Seleccionar estado" />
              </SelectTrigger>
              <SelectContent>
                {VEHICLE_STATUS.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.status && (
              <p className="text-sm text-destructive">{errors.status}</p>
            )}
          </div>

          {/* Active status */}
          <div className="space-y-2 flex items-end">
            <div className="flex items-center gap-2 pb-2">
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
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t mt-6">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
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
