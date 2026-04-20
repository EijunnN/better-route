"use client";

import {
  createContext,
  use,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import type {
  ORDER_STATUS,
  TIME_WINDOW_STRICTNESS,
} from "@/lib/validations/order";
import type { TIME_WINDOW_TYPES } from "@/lib/validations/time-window-preset";
import type { FieldDefinition } from "@/components/custom-fields";

export interface OrderFormData {
  trackingId: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  address: string;
  latitude: string;
  longitude: string;
  timeWindowPresetId?: string;
  strictness?: (typeof TIME_WINDOW_STRICTNESS)[number] | null;
  promisedDate?: string;
  weightRequired?: number;
  volumeRequired?: number;
  orderValue?: number;
  unitsRequired?: number;
  orderType?: "NEW" | "RESCHEDULED" | "URGENT";
  priority?: number;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  requiredSkills?: string;
  notes?: string;
  status?: (typeof ORDER_STATUS)[number];
  active?: boolean;
  customFields?: Record<string, unknown>;
}

export interface CompanyProfile {
  enableWeight: boolean;
  enableVolume: boolean;
  enableOrderValue: boolean;
  enableUnits: boolean;
  enableOrderType: boolean;
}

export interface TimeWindowPreset {
  id: string;
  name: string;
  type: (typeof TIME_WINDOW_TYPES)[number];
  startTime: string | null;
  endTime: string | null;
  exactTime: string | null;
  toleranceMinutes: number | null;
  strictness: (typeof TIME_WINDOW_STRICTNESS)[number];
}

/**
 * Project a preset onto the concrete (start, end) the form stores. "HH:mm"
 * inputs mirror the `time` input element's value shape; trimming the seconds
 * from a Postgres "HH:MM:SS" value keeps that consistent.
 */
function derivePresetWindow(
  preset: TimeWindowPreset,
): { start: string | null; end: string | null } {
  const toHHmm = (v: string | null) => (v ? v.slice(0, 5) : null);

  switch (preset.type) {
    case "RANGE":
    case "SHIFT":
      return { start: toHHmm(preset.startTime), end: toHHmm(preset.endTime) };
    case "EXACT": {
      if (!preset.exactTime || preset.toleranceMinutes == null) {
        return { start: null, end: null };
      }
      const hhmm = toHHmm(preset.exactTime)!;
      const [h, m] = hhmm.split(":").map(Number);
      const total = h * 60 + m;
      const startMin = Math.max(0, total - preset.toleranceMinutes);
      const endMin = Math.min(24 * 60 - 1, total + preset.toleranceMinutes);
      const fmt = (mins: number) =>
        `${Math.floor(mins / 60).toString().padStart(2, "0")}:${(mins % 60)
          .toString()
          .padStart(2, "0")}`;
      return { start: fmt(startMin), end: fmt(endMin) };
    }
    default:
      return { start: null, end: null };
  }
}

export interface Order {
  id: string;
  trackingId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  address: string;
  latitude: string;
  longitude: string;
  timeWindowPresetId: string | null;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  strictness: (typeof TIME_WINDOW_STRICTNESS)[number] | null;
  promisedDate: string | null;
  weightRequired: number | null;
  volumeRequired: number | null;
  orderValue: number | null;
  unitsRequired: number | null;
  orderType: string | null;
  priority: number | null;
  requiredSkills: string | null;
  notes: string | null;
  status: (typeof ORDER_STATUS)[number];
  active: boolean;
  customFields?: Record<string, unknown> | null;
}

export interface OrderFormState {
  formData: OrderFormData;
  errors: Record<string, string>;
  isSubmitting: boolean;
  timeWindowPresets: TimeWindowPreset[];
  selectedPreset: TimeWindowPreset | null;
  isLoadingPresets: boolean;
  companyProfile: CompanyProfile;
  fieldDefinitions: FieldDefinition[];
}

export interface OrderFormActions {
  handleChange: (
    field: keyof OrderFormData,
    value: string | number | boolean | Record<string, unknown> | null,
  ) => void;
  handlePresetChange: (presetId: string) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}

export interface OrderFormMeta {
  initialData?: Order;
  submitLabel: string;
  onCancel?: () => void;
}

export interface OrderFormDerived {
  isEditing: boolean;
}

interface OrderFormContextValue {
  state: OrderFormState;
  actions: OrderFormActions;
  meta: OrderFormMeta;
  derived: OrderFormDerived;
}

const OrderFormContext = createContext<OrderFormContextValue | undefined>(
  undefined,
);

const defaultFormData: OrderFormData = {
  trackingId: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  address: "",
  latitude: "",
  longitude: "",
  timeWindowPresetId: "",
  strictness: null,
  promisedDate: "",
  weightRequired: undefined,
  volumeRequired: undefined,
  requiredSkills: "",
  notes: "",
  status: "PENDING",
  active: true,
  customFields: {},
};

export interface OrderFormProviderProps {
  children: ReactNode;
  onSubmit: (data: OrderFormData) => Promise<void>;
  initialData?: Order;
  submitLabel?: string;
  onCancel?: () => void;
}

export function OrderFormProvider({
  children,
  onSubmit,
  initialData,
  submitLabel = "Crear Pedido",
  onCancel,
}: OrderFormProviderProps) {
  const { effectiveCompanyId: companyId } = useCompanyContext();
  const [formData, setFormData] = useState<OrderFormData>(defaultFormData);
  const [timeWindowPresets, setTimeWindowPresets] = useState<TimeWindowPreset[]>(
    [],
  );
  const [selectedPreset, setSelectedPreset] = useState<TimeWindowPreset | null>(
    null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingPresets, setIsLoadingPresets] = useState(true);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>({
    enableWeight: false,
    enableVolume: false,
    enableOrderValue: false,
    enableUnits: false,
    enableOrderType: false,
  });
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) {
        setIsLoadingPresets(false);
        return;
      }
      try {
        const presetsResponse = await fetch("/api/time-window-presets", {
          headers: { "x-company-id": companyId },
        });
        const presetsResult = await presetsResponse.json();
        setTimeWindowPresets(presetsResult.data || []);

        const profileResponse = await fetch("/api/company-profiles", {
          headers: { "x-company-id": companyId },
        });
        const profileResult = await profileResponse.json();
        if (profileResult.data?.profile) {
          setCompanyProfile(profileResult.data.profile);
        } else if (profileResult.data?.defaults) {
          setCompanyProfile(profileResult.data.defaults);
        }

        const fieldsResponse = await fetch(`/api/companies/${companyId}/field-definitions`, {
          headers: { "x-company-id": companyId },
        });
        const fieldsResult = await fieldsResponse.json();
        const defs = (fieldsResult.data ?? fieldsResult) as FieldDefinition[];
        setFieldDefinitions(
          Array.isArray(defs)
            ? defs.filter((d) => d.entity === "orders" && d.active).sort((a, b) => a.position - b.position)
            : []
        );
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setIsLoadingPresets(false);
      }
    };
    fetchData();
  }, [companyId]);

  useEffect(() => {
    if (initialData) {
      const initialFormData: OrderFormData = {
        trackingId: initialData.trackingId,
        customerName: initialData.customerName || "",
        customerPhone: initialData.customerPhone || "",
        customerEmail: initialData.customerEmail || "",
        address: initialData.address,
        latitude: initialData.latitude,
        longitude: initialData.longitude,
        timeWindowPresetId: initialData.timeWindowPresetId || "",
        timeWindowStart: initialData.timeWindowStart || "",
        timeWindowEnd: initialData.timeWindowEnd || "",
        strictness: initialData.strictness || null,
        promisedDate: initialData.promisedDate
          ? initialData.promisedDate.slice(0, 10)
          : "",
        weightRequired: initialData.weightRequired || undefined,
        volumeRequired: initialData.volumeRequired || undefined,
        orderValue: initialData.orderValue || undefined,
        unitsRequired: initialData.unitsRequired || undefined,
        orderType: (initialData.orderType as OrderFormData["orderType"]) || undefined,
        priority: initialData.priority || undefined,
        requiredSkills: initialData.requiredSkills || "",
        notes: initialData.notes || "",
        customFields: (initialData.customFields as Record<string, unknown>) || {},
        status: initialData.status,
        active: initialData.active,
      };
      setFormData(initialFormData);

      if (initialData.timeWindowPresetId) {
        const preset = timeWindowPresets.find(
          (p) => p.id === initialData.timeWindowPresetId,
        );
        if (preset) setSelectedPreset(preset);
      }
    }
  }, [initialData, timeWindowPresets]);

  const handleChange = (field: keyof OrderFormData, value: string | number | boolean | Record<string, unknown> | null) => {
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

  const handlePresetChange = (presetId: string) => {
    handleChange("timeWindowPresetId", presetId);
    const preset = timeWindowPresets.find((p) => p.id === presetId);
    setSelectedPreset(preset || null);
    if (preset) {
      // Copy the preset's effective window into the form so the user sees
      // what will actually be saved. Without this, start/end stayed empty
      // and the order landed in DB with only a preset id — the runner would
      // then have to resolve it. We still resolve there as defense-in-depth,
      // but showing the values in the UI avoids silent behavior.
      const { start, end } = derivePresetWindow(preset);
      if (start) handleChange("timeWindowStart", start);
      if (end) handleChange("timeWindowEnd", end);
      handleChange("strictness", null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const validationErrors: Record<string, string> = {};
    if (!formData.trackingId.trim()) validationErrors.trackingId = "Tracking ID es requerido";
    if (!formData.address.trim()) validationErrors.address = "Dirección es requerida";
    if (!formData.latitude.trim()) validationErrors.latitude = "Latitud es requerida";
    if (!formData.longitude.trim()) validationErrors.longitude = "Longitud es requerida";
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit(formData);
    } catch (error: unknown) {
      const err = error as {
        details?: Array<{ path?: string[]; field?: string; message: string }>;
        message?: string;
      };
      if (err.details && Array.isArray(err.details)) {
        const fieldErrors: Record<string, string> = {};
        err.details.forEach((detail) => {
          const fieldName = detail.path?.[0] || detail.field || "form";
          fieldErrors[fieldName] = detail.message;
        });
        setErrors(fieldErrors);
      } else {
        setErrors({ form: err.message || "Failed to save order" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const state: OrderFormState = {
    formData,
    errors,
    isSubmitting,
    timeWindowPresets,
    selectedPreset,
    isLoadingPresets,
    companyProfile,
    fieldDefinitions,
  };

  const actions: OrderFormActions = {
    handleChange,
    handlePresetChange,
    handleSubmit,
  };

  const meta: OrderFormMeta = {
    initialData,
    submitLabel,
    onCancel,
  };

  const derived: OrderFormDerived = {
    isEditing: !!initialData,
  };

  return (
    <OrderFormContext value={{ state, actions, meta, derived }}>
      {children}
    </OrderFormContext>
  );
}

export function useOrderForm(): OrderFormContextValue {
  const context = use(OrderFormContext);
  if (context === undefined) {
    throw new Error("useOrderForm must be used within an OrderFormProvider");
  }
  return context;
}
