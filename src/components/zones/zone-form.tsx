"use client";

import type { ZoneInput } from "@/lib/validations/zone";
import {
  ZoneFormProvider,
  useZoneForm,
  type VehicleOption,
} from "./zone-form-context";
import {
  ZoneFormActions,
  ZoneFormAppearance,
  ZoneFormBasicInfo,
  ZoneFormGeometry,
  ZoneFormOptions,
  ZoneFormSchedule,
  ZoneFormVehicles,
} from "./zone-form-sections";

// Re-export types for convenience
export type { VehicleOption };

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
  onGeometryEdit?: (snapshot: { formData: ZoneInput; vehicleIds: string[] }) => void;
  onFormDataChange?: (data: ZoneInput) => void;
}

function ZoneFormContent() {
  const { state, actions } = useZoneForm();
  const { errors } = state;
  const { handleSubmit } = actions;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.form && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {errors.form}
        </div>
      )}

      <ZoneFormBasicInfo />
      <ZoneFormGeometry />
      <ZoneFormAppearance />
      <ZoneFormSchedule />
      <ZoneFormVehicles />
      <ZoneFormOptions />
      <ZoneFormActions />
    </form>
  );
}

/**
 * ZoneForm - Compound Component Pattern
 *
 * Can be used in two ways:
 *
 * 1. Simple usage (default layout):
 * ```tsx
 * <ZoneForm onSubmit={handleSubmit} vehicles={vehicles} />
 * ```
 *
 * 2. Compound usage (custom layout):
 * ```tsx
 * <ZoneForm.Provider onSubmit={handleSubmit} vehicles={vehicles}>
 *   <ZoneForm.BasicInfo />
 *   <ZoneForm.Geometry />
 *   <ZoneForm.Appearance />
 *   <ZoneForm.Schedule />
 *   <ZoneForm.Vehicles />
 *   <ZoneForm.Options />
 *   <ZoneForm.Actions />
 * </ZoneForm.Provider>
 * ```
 */
export function ZoneForm({
  onSubmit,
  initialData,
  vehicles,
  initialVehicleIds = [],
  submitLabel = "Guardar",
  onGeometryEdit,
  onFormDataChange,
}: ZoneFormProps) {
  return (
    <ZoneFormProvider
      onSubmit={onSubmit}
      initialData={initialData}
      vehicles={vehicles}
      initialVehicleIds={initialVehicleIds}
      submitLabel={submitLabel}
      onGeometryEdit={onGeometryEdit}
      onFormDataChange={onFormDataChange}
    >
      <ZoneFormContent />
    </ZoneFormProvider>
  );
}

// Compound component exports
ZoneForm.Provider = ZoneFormProvider;
ZoneForm.BasicInfo = ZoneFormBasicInfo;
ZoneForm.Geometry = ZoneFormGeometry;
ZoneForm.Appearance = ZoneFormAppearance;
ZoneForm.Schedule = ZoneFormSchedule;
ZoneForm.Vehicles = ZoneFormVehicles;
ZoneForm.Options = ZoneFormOptions;
ZoneForm.Actions = ZoneFormActions;

// Hook export for custom implementations
export { useZoneForm } from "./zone-form-context";
