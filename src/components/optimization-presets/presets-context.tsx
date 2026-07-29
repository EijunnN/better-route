"use client";

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useState,
} from "react";
import { useOptimizationPresetList } from "@/hooks/queries";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useCompanyContext } from "@/hooks/use-company-context";

export interface OptimizationPreset {
  id: string;
  name: string;
  description: string | null;
  balanceVisits: boolean;
  minimizeVehicles: boolean;
  openStart: boolean;
  oneRoutePerVehicle: boolean;
  flexibleTimeWindows: boolean;
  groupSameLocation: boolean;
  maxDistanceKm: number | null;
  trafficFactor: number | null;
  routeEndMode: "DRIVER_ORIGIN" | "SPECIFIC_DEPOT" | "OPEN_END";
  endDepotLatitude: string | null;
  endDepotLongitude: string | null;
  endDepotAddress: string | null;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const ROUTE_END_MODES = [
  {
    value: "DRIVER_ORIGIN",
    label: "Origen del conductor",
    description: "Cada ruta termina donde inició el conductor",
  },
  {
    value: "SPECIFIC_DEPOT",
    label: "Depot específico",
    description: "Todas las rutas terminan en un punto fijo",
  },
  {
    value: "OPEN_END",
    label: "Fin abierto",
    description: "Las rutas terminan en la última parada",
  },
] as const;

export const DEFAULT_PRESET: Partial<OptimizationPreset> = {
  name: "",
  description: "",
  balanceVisits: false,
  minimizeVehicles: false,
  openStart: false,
  oneRoutePerVehicle: true,
  flexibleTimeWindows: false,
  groupSameLocation: true,
  maxDistanceKm: 200,
  trafficFactor: 50,
  routeEndMode: "DRIVER_ORIGIN",
  endDepotLatitude: null,
  endDepotLongitude: null,
  endDepotAddress: null,
  isDefault: false,
};

export interface PresetsState {
  presets: OptimizationPreset[];
  isLoading: boolean;
  error: string | null;
  dialogOpen: boolean;
  editingPreset: Partial<OptimizationPreset> | null;
  isSaving: boolean;
}

export interface PresetsActions {
  fetchPresets: () => Promise<void>;
  handleCreate: () => void;
  handleEdit: (preset: OptimizationPreset) => void;
  handleSave: () => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handleSetDefault: (preset: OptimizationPreset) => Promise<void>;
  setDialogOpen: (open: boolean) => void;
  setEditingPreset: (preset: Partial<OptimizationPreset> | null) => void;
  updateEditingPreset: (updates: Partial<OptimizationPreset>) => void;
}

export interface PresetsMeta {
  companyId: string | null;
  isReady: boolean;
  isSystemAdmin: boolean;
  companies: Array<{ id: string; commercialName: string }>;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  authCompanyId: string | null;
}

interface PresetsContextValue {
  state: PresetsState;
  actions: PresetsActions;
  meta: PresetsMeta;
}

const PresetsContext = createContext<PresetsContextValue | undefined>(
  undefined,
);

export function PresetsProvider({ children }: { children: ReactNode }) {
  const {
    effectiveCompanyId: companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  } = useCompanyContext();

  const {
    data: presets = [],
    isLoading,
    error: presetsError,
    mutate: mutatePresets,
  } = useOptimizationPresetList();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] =
    useState<Partial<OptimizationPreset> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchPresets = useCallback(async () => {
    await mutatePresets();
  }, [mutatePresets]);
  const apiMutate = useApiMutation(fetchPresets);

  const handleCreate = () => {
    setEditingPreset({ ...DEFAULT_PRESET });
    setDialogOpen(true);
  };

  const handleEdit = (preset: OptimizationPreset) => {
    setEditingPreset({ ...preset });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingPreset) return;
    const isEditing = !!editingPreset.id;
    setIsSaving(true);
    try {
      await apiMutate(
        isEditing
          ? `/api/optimization-presets/${editingPreset.id}`
          : "/api/optimization-presets",
        {
          method: isEditing ? "PUT" : "POST",
          body: editingPreset,
          errorTitle: "Error al guardar preset",
        },
      );
      setDialogOpen(false);
      setEditingPreset(null);
    } catch {
      // apiMutate ya reportó el fallo por toast; el diálogo queda abierto.
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este preset?")) return;
    await apiMutate(`/api/optimization-presets/${id}`, {
      method: "DELETE",
      rethrow: false,
      errorTitle: "Error al eliminar preset",
    });
  };

  const handleSetDefault = async (preset: OptimizationPreset) => {
    await apiMutate(`/api/optimization-presets/${preset.id}`, {
      method: "PUT",
      body: { isDefault: true },
      rethrow: false,
      errorTitle: "Error al establecer preset predeterminado",
    });
  };

  const updateEditingPreset = (updates: Partial<OptimizationPreset>) => {
    setEditingPreset((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const error = presetsError
    ? presetsError instanceof Error
      ? presetsError.message
      : "Error al cargar presets de optimización"
    : null;

  const state: PresetsState = {
    presets,
    isLoading,
    error,
    dialogOpen,
    editingPreset,
    isSaving,
  };

  const actions: PresetsActions = {
    fetchPresets,
    handleCreate,
    handleEdit,
    handleSave,
    handleDelete,
    handleSetDefault,
    setDialogOpen,
    setEditingPreset,
    updateEditingPreset,
  };

  const meta: PresetsMeta = {
    companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  };

  return (
    <PresetsContext value={{ state, actions, meta }}>{children}</PresetsContext>
  );
}

export function usePresets(): PresetsContextValue {
  const context = use(PresetsContext);
  if (context === undefined) {
    throw new Error("usePresets must be used within a PresetsProvider");
  }
  return context;
}
