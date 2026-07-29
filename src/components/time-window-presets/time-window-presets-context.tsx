"use client";

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useState,
} from "react";
import { useTimeWindowPresetList } from "@/hooks/queries";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useCompanyContext } from "@/hooks/use-company-context";
import type {
  TIME_WINDOW_STRICTNESS,
  TIME_WINDOW_TYPES,
} from "@/lib/validations/time-window-preset";
import type { TimeWindowPresetFormData } from "./time-window-preset-form";

export interface TimeWindowPreset {
  id: string;
  name: string;
  type: (typeof TIME_WINDOW_TYPES)[number];
  startTime: string | null;
  endTime: string | null;
  exactTime: string | null;
  toleranceMinutes: number | null;
  strictness: (typeof TIME_WINDOW_STRICTNESS)[number];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const TYPE_LABELS: Record<string, string> = {
  SHIFT: "Turno",
  RANGE: "Rango",
  EXACT: "Exacto",
};

export const STRICTNESS_LABELS: Record<string, string> = {
  HARD: "Estricto",
  SOFT: "Flexible",
};

export interface TimeWindowPresetsState {
  presets: TimeWindowPreset[];
  isLoading: boolean;
  error: string | null;
  showForm: boolean;
  editingPreset: TimeWindowPreset | null;
  deletingId: string | null;
}

export interface TimeWindowPresetsActions {
  fetchPresets: () => Promise<void>;
  handleCreate: (data: TimeWindowPresetFormData) => Promise<void>;
  handleUpdate: (data: TimeWindowPresetFormData) => Promise<void>;
  handleEdit: (preset: TimeWindowPreset) => void;
  handleDelete: (id: string) => Promise<void>;
  setShowForm: (show: boolean) => void;
  cancelForm: () => void;
  formatTimeDisplay: (preset: TimeWindowPreset) => string;
}

export interface TimeWindowPresetsMeta {
  companyId: string | null;
  isReady: boolean;
}

interface TimeWindowPresetsContextValue {
  state: TimeWindowPresetsState;
  actions: TimeWindowPresetsActions;
  meta: TimeWindowPresetsMeta;
}

const TimeWindowPresetsContext = createContext<
  TimeWindowPresetsContextValue | undefined
>(undefined);

export function TimeWindowPresetsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { effectiveCompanyId: companyId, isReady } = useCompanyContext();

  const {
    data: presets = [],
    isLoading,
    error: presetsError,
    mutate: mutatePresets,
  } = useTimeWindowPresetList();

  const [showForm, setShowForm] = useState(false);
  const [editingPreset, setEditingPreset] = useState<TimeWindowPreset | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchPresets = useCallback(async () => {
    await mutatePresets();
  }, [mutatePresets]);
  const apiMutate = useApiMutation(fetchPresets);

  const handleCreate = async (data: TimeWindowPresetFormData) => {
    await apiMutate("/api/time-window-presets", {
      body: data,
      errorTitle: "Error al crear preset",
      success: {
        title: "Preset creado",
        description: `El preset "${data.name}" ha sido creado exitosamente.`,
      },
    });
    setShowForm(false);
  };

  const handleUpdate = async (data: TimeWindowPresetFormData) => {
    if (!editingPreset) return;
    await apiMutate(`/api/time-window-presets/${editingPreset.id}`, {
      method: "PATCH",
      body: { ...data, id: editingPreset.id },
      errorTitle: "Error al actualizar preset",
      success: {
        title: "Preset actualizado",
        description: `El preset "${data.name}" ha sido actualizado exitosamente.`,
      },
    });
    setEditingPreset(null);
    setShowForm(false);
  };

  const handleEdit = (preset: TimeWindowPreset) => {
    setEditingPreset(preset);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const preset = presets.find((p) => p.id === id);
    setDeletingId(id);
    await apiMutate(`/api/time-window-presets/${id}`, {
      method: "DELETE",
      rethrow: false,
      errorTitle: "Error al eliminar preset",
      success: {
        title: "Preset eliminado",
        description: preset
          ? `El preset "${preset.name}" ha sido eliminado.`
          : "El preset ha sido eliminado.",
      },
    });
    setDeletingId(null);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingPreset(null);
  };

  const formatTimeDisplay = (preset: TimeWindowPreset) => {
    if (preset.type === "EXACT") {
      return `${preset.exactTime} ±${preset.toleranceMinutes}min`;
    }
    return `${preset.startTime} - ${preset.endTime}`;
  };

  const error = presetsError
    ? presetsError instanceof Error
      ? presetsError.message
      : "No se pudieron cargar los presets"
    : null;

  const state: TimeWindowPresetsState = {
    presets,
    isLoading,
    error,
    showForm,
    editingPreset,
    deletingId,
  };
  const actions: TimeWindowPresetsActions = {
    fetchPresets,
    handleCreate,
    handleUpdate,
    handleEdit,
    handleDelete,
    setShowForm,
    cancelForm,
    formatTimeDisplay,
  };
  const meta: TimeWindowPresetsMeta = { companyId, isReady };

  return (
    <TimeWindowPresetsContext value={{ state, actions, meta }}>
      {children}
    </TimeWindowPresetsContext>
  );
}

export function useTimeWindowPresets(): TimeWindowPresetsContextValue {
  const context = use(TimeWindowPresetsContext);
  if (context === undefined) {
    throw new Error(
      "useTimeWindowPresets must be used within a TimeWindowPresetsProvider",
    );
  }
  return context;
}
