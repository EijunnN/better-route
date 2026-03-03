"use client";

import { createContext, use, useState, type ReactNode } from "react";
import type { VehicleInput } from "@/lib/validations/vehicle";

export interface CompanyProfile {
  enableOrderValue?: boolean;
  enableUnits?: boolean;
  enableWeight?: boolean;
  enableVolume?: boolean;
}

export interface VehicleSkill {
  id: string;
  code: string;
  name: string;
  category: string;
  description?: string | null;
}

export interface VehicleFormState {
  formData: VehicleInput;
  errors: Record<string, string>;
  isSubmitting: boolean;
  selectedFleetIds: string[];
  selectedSkillIds: string[];
  activeTab: string;
}

export interface VehicleFormActions {
  updateField: (field: keyof VehicleInput, value: VehicleInput[keyof VehicleInput]) => void;
  setActiveTab: (tab: string) => void;
  toggleFleetSelection: (fleetId: string) => void;
  toggleSkillSelection: (skillId: string) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}

export interface VehicleFormMeta {
  fleets: Array<{ id: string; name: string }>;
  drivers: Array<{ id: string; name: string }>;
  availableSkills: VehicleSkill[];
  companyProfile?: CompanyProfile;
  submitLabel: string;
  onCancel?: () => void;
}

interface VehicleFormContextValue {
  state: VehicleFormState;
  actions: VehicleFormActions;
  meta: VehicleFormMeta;
}

const VehicleFormContext = createContext<VehicleFormContextValue | undefined>(undefined);

export interface VehicleFormProviderProps {
  children: ReactNode;
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

export function VehicleFormProvider({
  children,
  onSubmit,
  initialData,
  fleets,
  drivers,
  availableSkills = [],
  initialSkillIds = [],
  submitLabel = "Guardar",
  onCancel,
  companyProfile,
}: VehicleFormProviderProps) {
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
    maxValueCapacity: initialData?.maxValueCapacity ?? null,
    maxUnitsCapacity: initialData?.maxUnitsCapacity ?? null,
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
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>(initialSkillIds);
  const [activeTab, setActiveTab] = useState("general");

  const updateField = (field: keyof VehicleInput, value: VehicleInput[keyof VehicleInput]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (prev[field]) {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      }
      return prev;
    });
  };

  const toggleFleetSelection = (fleetId: string) => {
    setSelectedFleetIds((prev) =>
      prev.includes(fleetId)
        ? prev.filter((id) => id !== fleetId)
        : [...prev, fleetId],
    );
  };

  const toggleSkillSelection = (skillId: string) => {
    setSelectedSkillIds((prev) =>
      prev.includes(skillId)
        ? prev.filter((id) => id !== skillId)
        : [...prev, skillId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const validationErrors: Record<string, string> = {};
    if (!formData.name.trim()) validationErrors.name = "Nombre es requerido";
    if (!formData.useNameAsPlate && !formData.plate?.trim()) validationErrors.plate = "Placa es requerida";
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

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
      await onSubmit(submitData, selectedSkillIds);
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

  const state: VehicleFormState = {
    formData,
    errors,
    isSubmitting,
    selectedFleetIds,
    selectedSkillIds,
    activeTab,
  };

  const actions: VehicleFormActions = {
    updateField,
    setActiveTab,
    toggleFleetSelection,
    toggleSkillSelection,
    handleSubmit,
  };

  const meta: VehicleFormMeta = {
    fleets,
    drivers,
    availableSkills,
    companyProfile,
    submitLabel,
    onCancel,
  };

  return (
    <VehicleFormContext value={{ state, actions, meta }}>
      {children}
    </VehicleFormContext>
  );
}

export function useVehicleForm(): VehicleFormContextValue {
  const context = use(VehicleFormContext);
  if (context === undefined) {
    throw new Error("useVehicleForm must be used within a VehicleFormProvider");
  }
  return context;
}
