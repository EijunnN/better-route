"use client";

import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";
import type { TimeWindowPresetFormData } from "./time-window-preset-form";
import type { TIME_WINDOW_STRICTNESS, TIME_WINDOW_TYPES } from "@/lib/validations/time-window-preset";

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

const TimeWindowPresetsContext = createContext<TimeWindowPresetsContextValue | undefined>(undefined);

export function TimeWindowPresetsProvider({ children }: { children: ReactNode }) {
  const { effectiveCompanyId: companyId, isReady } = useCompanyContext();
  const { toast } = useToast();

  const [presets, setPresets] = useState<TimeWindowPreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingPreset, setEditingPreset] = useState<TimeWindowPreset | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchPresets = async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/time-window-presets", {
        headers: { "x-company-id": companyId },
      });
      const result = await response.json();
      setPresets(result.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los presets");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPresets();
  }, [companyId]);

  const handleCreate = async (data: TimeWindowPresetFormData) => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/time-window-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-company-id": companyId },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al crear el preset");
      }
      await fetchPresets();
      setShowForm(false);
      toast({ title: "Preset creado", description: `El preset "${data.name}" ha sido creado exitosamente.` });
    } catch (err) {
      toast({
        title: "Error al crear preset",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleUpdate = async (data: TimeWindowPresetFormData) => {
    if (!editingPreset || !companyId) return;
    try {
      const response = await fetch(`/api/time-window-presets/${editingPreset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-company-id": companyId },
        body: JSON.stringify({ ...data, id: editingPreset.id }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al actualizar el preset");
      }
      await fetchPresets();
      setEditingPreset(null);
      setShowForm(false);
      toast({ title: "Preset actualizado", description: `El preset "${data.name}" ha sido actualizado exitosamente.` });
    } catch (err) {
      toast({
        title: "Error al actualizar preset",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleEdit = (preset: TimeWindowPreset) => {
    setEditingPreset(preset);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!companyId) return;
    setDeletingId(id);
    const preset = presets.find((p) => p.id === id);
    try {
      const response = await fetch(`/api/time-window-presets/${id}`, {
        method: "DELETE",
        headers: { "x-company-id": companyId },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al eliminar el preset");
      }
      await fetchPresets();
      toast({
        title: "Preset eliminado",
        description: preset ? `El preset "${preset.name}" ha sido eliminado.` : "El preset ha sido eliminado.",
      });
    } catch (err) {
      toast({
        title: "Error al eliminar preset",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
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

  const state: TimeWindowPresetsState = { presets, isLoading, error, showForm, editingPreset, deletingId };
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

  return <TimeWindowPresetsContext value={{ state, actions, meta }}>{children}</TimeWindowPresetsContext>;
}

export function useTimeWindowPresets(): TimeWindowPresetsContextValue {
  const context = use(TimeWindowPresetsContext);
  if (context === undefined) {
    throw new Error("useTimeWindowPresets must be used within a TimeWindowPresetsProvider");
  }
  return context;
}
