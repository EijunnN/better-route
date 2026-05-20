"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { VehicleInput } from "@/lib/validations/vehicle";
import { VehicleFormActions } from "./vehicle-form-actions";
import { VehicleFormConfig } from "./vehicle-form-config";
import {
  type CompanyProfile,
  useVehicleForm,
  VehicleFormProvider,
  type VehicleSkill,
} from "./vehicle-form-context";
import { VehicleFormGeneral } from "./vehicle-form-general";
import { VehicleFormOperation } from "./vehicle-form-operation";

// Re-export types for convenience
export type { CompanyProfile, VehicleSkill };

interface VehicleFormProps {
  onSubmit: (data: VehicleInput, skillIds?: string[]) => Promise<void>;
  initialData?: Partial<VehicleInput>;
  fleets: Array<{ id: string; name: string }>;
  drivers: Array<{ id: string; name: string }>;
  availableSkills?: VehicleSkill[];
  initialSkillIds?: string[];
  submitLabel?: string;
  onCancel?: () => void;
  companyProfile?: CompanyProfile;
}

function VehicleFormContent() {
  const { state, actions } = useVehicleForm();
  const { errors, activeTab } = state;
  const { handleSubmit, setActiveTab } = actions;

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

        <TabsContent value="general">
          <VehicleFormGeneral />
        </TabsContent>

        <TabsContent value="operation">
          <VehicleFormOperation />
        </TabsContent>

        <TabsContent value="config">
          <VehicleFormConfig />
        </TabsContent>
      </Tabs>

      <VehicleFormActions />
    </form>
  );
}

/**
 * VehicleForm - Compound Component Pattern
 *
 * Can be used in two ways:
 *
 * 1. Simple usage (default layout):
 * ```tsx
 * <VehicleForm onSubmit={handleSubmit} fleets={fleets} drivers={drivers} />
 * ```
 *
 * 2. Compound usage (custom layout):
 * ```tsx
 * <VehicleForm.Provider onSubmit={handleSubmit} fleets={fleets} drivers={drivers}>
 *   <VehicleForm.GeneralTab />
 *   <VehicleForm.OperationTab />
 *   <VehicleForm.ConfigTab />
 *   <VehicleForm.Actions />
 * </VehicleForm.Provider>
 * ```
 */
export function VehicleForm({
  onSubmit,
  initialData,
  fleets,
  drivers,
  availableSkills = [],
  initialSkillIds = [],
  submitLabel = "Guardar",
  onCancel,
  companyProfile,
}: VehicleFormProps) {
  return (
    <VehicleFormProvider
      onSubmit={onSubmit}
      initialData={initialData}
      fleets={fleets}
      drivers={drivers}
      availableSkills={availableSkills}
      initialSkillIds={initialSkillIds}
      submitLabel={submitLabel}
      onCancel={onCancel}
      companyProfile={companyProfile}
    >
      <VehicleFormContent />
    </VehicleFormProvider>
  );
}

// Compound component exports
VehicleForm.Provider = VehicleFormProvider;
VehicleForm.GeneralTab = VehicleFormGeneral;
VehicleForm.OperationTab = VehicleFormOperation;
VehicleForm.ConfigTab = VehicleFormConfig;
VehicleForm.Actions = VehicleFormActions;

// Hook export for custom implementations
export { useVehicleForm } from "./vehicle-form-context";
