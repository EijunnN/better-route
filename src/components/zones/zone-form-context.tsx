"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DAYS_OF_WEEK,
  type ZoneInput,
} from "@/lib/validations/zone";

export interface VehicleOption {
  id: string;
  name: string;
  plate: string | null;
}

export interface ZoneFormState {
  formData: ZoneInput;
  errors: Record<string, string>;
  isSubmitting: boolean;
  selectedDays: string[];
  selectedVehicleIds: string[];
  vehicleSearch: string;
}

export interface ZoneFormActions {
  updateField: (field: keyof ZoneInput, value: ZoneInput[keyof ZoneInput]) => void;
  toggleDay: (day: string) => void;
  selectAllDays: () => void;
  selectWeekdays: () => void;
  clearDays: () => void;
  toggleVehicle: (vehicleId: string) => void;
  selectAllVehicles: () => void;
  clearVehicles: () => void;
  setVehicleSearch: (search: string) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}

export interface ZoneFormMeta {
  vehicles: VehicleOption[];
  submitLabel: string;
  onGeometryEdit?: (snapshot: { formData: ZoneInput; vehicleIds: string[] }) => void;
}

export interface ZoneFormDerived {
  hasValidGeometry: boolean;
  filteredVehicles: VehicleOption[];
}

interface ZoneFormContextValue {
  state: ZoneFormState;
  actions: ZoneFormActions;
  meta: ZoneFormMeta;
  derived: ZoneFormDerived;
}

const ZoneFormContext = createContext<ZoneFormContextValue | undefined>(
  undefined,
);

export interface ZoneFormProviderProps {
  children: ReactNode;
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

export function ZoneFormProvider({
  children,
  onSubmit,
  initialData,
  vehicles,
  initialVehicleIds = [],
  submitLabel = "Guardar",
  onGeometryEdit,
  onFormDataChange,
}: ZoneFormProviderProps) {
  const defaultData: ZoneInput = {
    name: initialData?.name ?? "",
    description: initialData?.description ?? "",
    type: initialData?.type ?? "DELIVERY",
    geometry: initialData?.geometry ?? "",
    color: initialData?.color ?? "#3B82F6",
    isDefault: initialData?.isDefault ?? false,
    activeDays: initialData?.activeDays ?? null,
    active: initialData?.active ?? true,
  };

  const [formData, setFormData] = useState<ZoneInput>(defaultData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>(
    initialData?.activeDays ?? [],
  );
  const [selectedVehicleIds, setSelectedVehicleIds] =
    useState<string[]>(initialVehicleIds);
  const [vehicleSearch, setVehicleSearch] = useState("");

  const updateField = useCallback(
    (field: keyof ZoneInput, value: ZoneInput[keyof ZoneInput]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => {
        if (prev[field]) {
          const newErrors = { ...prev };
          delete newErrors[field];
          return newErrors;
        }
        return prev;
      });
    },
    [],
  );

  const toggleDay = useCallback((day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }, []);

  const selectAllDays = useCallback(() => {
    setSelectedDays([...DAYS_OF_WEEK]);
  }, []);

  const selectWeekdays = useCallback(() => {
    setSelectedDays(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]);
  }, []);

  const clearDays = useCallback(() => {
    setSelectedDays([]);
  }, []);

  const toggleVehicle = useCallback((vehicleId: string) => {
    setSelectedVehicleIds((prev) =>
      prev.includes(vehicleId)
        ? prev.filter((id) => id !== vehicleId)
        : [...prev, vehicleId],
    );
  }, []);

  const selectAllVehicles = useCallback(() => {
    setSelectedVehicleIds(vehicles.map((v) => v.id));
  }, [vehicles]);

  const clearVehicles = useCallback(() => {
    setSelectedVehicleIds([]);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setErrors({});

      const validationErrors: Record<string, string> = {};
      if (!formData.name.trim()) validationErrors.name = "Nombre es requerido";
      if (!formData.geometry) validationErrors.geometry = "Geometría es requerida";
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }

      setIsSubmitting(true);

      const submitData: ZoneInput = {
        ...formData,
        activeDays:
          selectedDays.length > 0
            ? (selectedDays as (typeof DAYS_OF_WEEK)[number][])
            : null,
      };

      try {
        await onSubmit(submitData, selectedVehicleIds);
      } catch (error: unknown) {
        const err = error as {
          details?: Array<{ path?: string[]; field?: string; message: string }>;
          error?: string;
        };
        if (err.details && Array.isArray(err.details)) {
          const fieldErrors: Record<string, string> = {};
          err.details.forEach((e) => {
            const fieldName = e.path?.[0] || e.field || "form";
            fieldErrors[fieldName] = e.message;
          });
          setErrors(fieldErrors);
        } else {
          setErrors({ form: err.error || "Error al guardar la zona" });
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, selectedDays, selectedVehicleIds, onSubmit],
  );

  // Sync form data changes to parent (for preview map and state persistence)
  const onFormDataChangeRef = useRef(onFormDataChange);
  onFormDataChangeRef.current = onFormDataChange;
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip initial mount to avoid overwriting parent state with defaults
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onFormDataChangeRef.current?.(formData);
  }, [formData]);

  const hasValidGeometry = (() => {
    if (!formData.geometry) return false;
    try {
      const parsed = JSON.parse(formData.geometry);
      return (
        parsed.type === "Polygon" &&
        Array.isArray(parsed.coordinates) &&
        parsed.coordinates.length > 0
      );
    } catch {
      return false;
    }
  })();

  const filteredVehicles = vehicles.filter((v) => {
    if (!vehicleSearch) return true;
    const search = vehicleSearch.toLowerCase();
    return (
      v.name.toLowerCase().includes(search) ||
      (v.plate?.toLowerCase().includes(search) ?? false)
    );
  });

  const state: ZoneFormState = {
    formData,
    errors,
    isSubmitting,
    selectedDays,
    selectedVehicleIds,
    vehicleSearch,
  };

  const actions: ZoneFormActions = {
    updateField,
    toggleDay,
    selectAllDays,
    selectWeekdays,
    clearDays,
    toggleVehicle,
    selectAllVehicles,
    clearVehicles,
    setVehicleSearch,
    handleSubmit,
  };

  const meta: ZoneFormMeta = {
    vehicles,
    submitLabel,
    onGeometryEdit,
  };

  const derived: ZoneFormDerived = {
    hasValidGeometry,
    filteredVehicles,
  };

  return (
    <ZoneFormContext value={{ state, actions, meta, derived }}>
      {children}
    </ZoneFormContext>
  );
}

export function useZoneForm(): ZoneFormContextValue {
  const context = use(ZoneFormContext);
  if (context === undefined) {
    throw new Error("useZoneForm must be used within a ZoneFormProvider");
  }
  return context;
}
