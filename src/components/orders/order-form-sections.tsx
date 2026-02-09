"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrderForm } from "./order-form-context";

export function OrderFormBasicInfo() {
  const { state, actions } = useOrderForm();
  const { formData, errors } = state;
  const { handleChange } = actions;

  return (
    <div className="border-b pb-4">
      <h3 className="font-medium mb-3">Información del Pedido</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="trackingId">ID de Seguimiento *</Label>
          <Input
            id="trackingId"
            value={formData.trackingId}
            onChange={(e) => handleChange("trackingId", e.target.value)}
            placeholder="Ej: ORD-001"
          />
          {errors.trackingId && (
            <p className="text-sm text-destructive mt-1">{errors.trackingId}</p>
          )}
        </div>

        <div>
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            value={formData.status}
            onChange={(e) => handleChange("status", e.target.value)}
            className="w-full px-3 py-2 border rounded-md bg-background"
          >
            <option value="PENDING">Pendiente</option>
            <option value="ASSIGNED">Asignado</option>
            <option value="IN_PROGRESS">En Progreso</option>
            <option value="COMPLETED">Completado</option>
            <option value="FAILED">Fallido</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-3">
        <div>
          <Label htmlFor="customerName">Nombre del Cliente</Label>
          <Input
            id="customerName"
            value={formData.customerName}
            onChange={(e) => handleChange("customerName", e.target.value)}
            placeholder="Juan Pérez"
          />
        </div>

        <div>
          <Label htmlFor="customerPhone">Teléfono</Label>
          <Input
            id="customerPhone"
            value={formData.customerPhone}
            onChange={(e) => handleChange("customerPhone", e.target.value)}
            placeholder="+51 999 999 999"
          />
        </div>
      </div>

      <div className="mt-3">
        <Label htmlFor="customerEmail">Email</Label>
        <Input
          id="customerEmail"
          type="email"
          value={formData.customerEmail}
          onChange={(e) => handleChange("customerEmail", e.target.value)}
          placeholder="john@example.com"
          autoComplete="email"
        />
        {errors.customerEmail && (
          <p className="text-sm text-destructive mt-1">{errors.customerEmail}</p>
        )}
      </div>
    </div>
  );
}

export function OrderFormLocation() {
  const { state, actions } = useOrderForm();
  const { formData, errors } = state;
  const { handleChange } = actions;

  return (
    <div className="border-b pb-4">
      <h3 className="font-medium mb-3">Ubicación</h3>

      <div>
        <Label htmlFor="address">Dirección *</Label>
        <Input
          id="address"
          value={formData.address}
          onChange={(e) => handleChange("address", e.target.value)}
          placeholder="Av. Principal 123, Lima, Perú"
        />
        {errors.address && (
          <p className="text-sm text-destructive mt-1">{errors.address}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mt-3">
        <div>
          <Label htmlFor="latitude">Latitud *</Label>
          <Input
            id="latitude"
            value={formData.latitude}
            onChange={(e) => handleChange("latitude", e.target.value)}
            placeholder="Ej: -12.0464"
            step="any"
          />
          {errors.latitude && (
            <p className="text-sm text-destructive mt-1">{errors.latitude}</p>
          )}
        </div>

        <div>
          <Label htmlFor="longitude">Longitud *</Label>
          <Input
            id="longitude"
            value={formData.longitude}
            onChange={(e) => handleChange("longitude", e.target.value)}
            placeholder="Ej: -77.0428"
            step="any"
          />
          {errors.longitude && (
            <p className="text-sm text-destructive mt-1">{errors.longitude}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function OrderFormTimeWindow() {
  const { state, actions, derived } = useOrderForm();
  const { formData, timeWindowPresets, selectedPreset, isLoadingPresets } = state;
  const { handleChange, handlePresetChange, handleStrictnessChange } = actions;
  const { effectiveStrictness, isOverridden } = derived;

  return (
    <div className="border-b pb-4">
      <h3 className="font-medium mb-3">Configuración de Ventana de Tiempo</h3>

      <div>
        <Label htmlFor="timeWindowPresetId">Preset de Ventana de Tiempo</Label>
        {isLoadingPresets ? (
          <p className="text-sm text-muted-foreground">Cargando presets...</p>
        ) : (
          <select
            id="timeWindowPresetId"
            value={formData.timeWindowPresetId}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="w-full px-3 py-2 border rounded-md bg-background"
          >
            <option value="">Sin preset</option>
            {timeWindowPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} ({preset.type}, {preset.strictness})
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedPreset && (
        <div className="mt-3 p-3 bg-muted/50 rounded-md">
          <p className="text-sm font-medium">Detalles del Preset:</p>
          <p className="text-sm text-muted-foreground">
            Tipo: {selectedPreset.type}
            {selectedPreset.type === "EXACT"
              ? ` - ${selectedPreset.exactTime} ±${selectedPreset.toleranceMinutes}min`
              : ` - ${selectedPreset.startTime} - ${selectedPreset.endTime}`}
          </p>
          <p className="text-sm text-muted-foreground">
            Exigencia del Preset:{" "}
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                selectedPreset.strictness === "HARD"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-yellow-500/10 text-yellow-600"
              }`}
            >
              {selectedPreset.strictness}
            </span>
          </p>
        </div>
      )}

      <div className="mt-3">
        <Label htmlFor="strictness">Nivel de Exigencia</Label>
        <select
          id="strictness"
          value={formData.strictness || "INHERIT"}
          onChange={(e) => handleStrictnessChange(e.target.value)}
          disabled={!selectedPreset}
          className="w-full px-3 py-2 border rounded-md bg-background disabled:opacity-50"
        >
          <option value="INHERIT">
            {selectedPreset
              ? `Heredar del preset (${selectedPreset.strictness})`
              : "Seleccione un preset primero"}
          </option>
          <option value="HARD">Estricto (rechazar violaciones)</option>
          <option value="SOFT">Flexible (minimizar retrasos)</option>
        </select>
        {isOverridden && selectedPreset && (
          <p className="text-sm text-amber-600 mt-1 flex items-center gap-1">
            <span className="font-medium">Sobreescrito:</span> Este pedido usará{" "}
            <span className="font-medium">{effectiveStrictness === "HARD" ? "Estricto" : "Flexible"}</span> en
            vez del preset ({selectedPreset.strictness})
          </p>
        )}
      </div>

      <div className="mt-3">
        <Label htmlFor="promisedDate">Fecha Prometida</Label>
        <Input
          id="promisedDate"
          type="date"
          value={formData.promisedDate}
          onChange={(e) => handleChange("promisedDate", e.target.value)}
        />
      </div>
    </div>
  );
}

export function OrderFormCapacity() {
  const { state, actions } = useOrderForm();
  const { formData, companyProfile } = state;
  const { handleChange } = actions;

  return (
    <div className="border-b pb-4">
      <h3 className="font-medium mb-3">Requisitos de Capacidad</h3>

      <div className="grid grid-cols-2 gap-4">
        {companyProfile.enableWeight && (
          <div>
            <Label htmlFor="weightRequired">Peso (gramos)</Label>
            <Input
              id="weightRequired"
              type="number"
              min="0"
              value={formData.weightRequired || ""}
              onChange={(e) =>
                handleChange("weightRequired", parseInt(e.target.value, 10) || 0)
              }
              placeholder="Ej: 500"
            />
          </div>
        )}

        {companyProfile.enableVolume && (
          <div>
            <Label htmlFor="volumeRequired">Volumen (litros)</Label>
            <Input
              id="volumeRequired"
              type="number"
              min="0"
              value={formData.volumeRequired || ""}
              onChange={(e) =>
                handleChange("volumeRequired", parseInt(e.target.value, 10) || 0)
              }
              placeholder="Ej: 10"
            />
          </div>
        )}

        {companyProfile.enableOrderValue && (
          <div>
            <Label htmlFor="orderValue">Valorizado</Label>
            <Input
              id="orderValue"
              type="number"
              min="0"
              value={formData.orderValue || ""}
              onChange={(e) =>
                handleChange("orderValue", parseInt(e.target.value, 10) || 0)
              }
              placeholder="Ej: 15000 = $150.00"
            />
          </div>
        )}

        {companyProfile.enableUnits && (
          <div>
            <Label htmlFor="unitsRequired">Unidades</Label>
            <Input
              id="unitsRequired"
              type="number"
              min="1"
              value={formData.unitsRequired || ""}
              onChange={(e) =>
                handleChange("unitsRequired", parseInt(e.target.value, 10) || 1)
              }
              placeholder="Ej: 3"
            />
          </div>
        )}
      </div>

      {companyProfile.enableOrderType && (
        <div className="grid grid-cols-2 gap-4 mt-3">
          <div>
            <Label htmlFor="orderType">Tipo de Pedido</Label>
            <select
              id="orderType"
              value={formData.orderType || ""}
              onChange={(e) => handleChange("orderType", e.target.value || null)}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="">Sin tipo</option>
              <option value="NEW">Nuevo</option>
              <option value="RESCHEDULED">Reprogramado</option>
              <option value="URGENT">Urgente</option>
            </select>
          </div>
          <div>
            <Label htmlFor="priority">Prioridad (0-100)</Label>
            <Input
              id="priority"
              type="number"
              min="0"
              max="100"
              value={formData.priority || ""}
              onChange={(e) =>
                handleChange("priority", parseInt(e.target.value, 10) || 50)
              }
              placeholder="50"
            />
          </div>
        </div>
      )}

      <div className="mt-3">
        <Label htmlFor="requiredSkills">
          Habilidades Requeridas (separadas por coma)
        </Label>
        <Input
          id="requiredSkills"
          value={formData.requiredSkills}
          onChange={(e) => handleChange("requiredSkills", e.target.value)}
          placeholder="Ej: REFRIGERADO, FRAGIL"
        />
      </div>
    </div>
  );
}

export function OrderFormNotes() {
  const { state, actions, derived } = useOrderForm();
  const { formData } = state;
  const { handleChange } = actions;
  const { isEditing } = derived;

  return (
    <>
      <div>
        <Label htmlFor="notes">Notas</Label>
        <textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => handleChange("notes", e.target.value)}
          placeholder="Instrucciones adicionales de entrega..."
          rows={3}
          className="w-full px-3 py-2 border rounded-md bg-background resize-none"
        />
      </div>

      {isEditing && (
        <div className="flex items-center gap-2">
          <input
            id="active"
            type="checkbox"
            checked={formData.active ?? true}
            onChange={(e) => handleChange("active", e.target.checked)}
          />
          <Label htmlFor="active" className="cursor-pointer">
            Activo
          </Label>
        </div>
      )}
    </>
  );
}

export function OrderFormActions() {
  const { state, meta } = useOrderForm();
  const { errors, isSubmitting } = state;
  const { submitLabel, onCancel } = meta;

  return (
    <>
      {errors.form && (
        <p className="text-sm text-destructive">{errors.form}</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : submitLabel}
        </Button>
      </div>
    </>
  );
}
