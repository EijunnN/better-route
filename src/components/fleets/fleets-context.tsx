"use client";

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useFleetList, useVehicleList } from "@/hooks/queries";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";
import type { FleetInput } from "@/lib/validations/fleet";

export interface Fleet {
  id: string;
  name: string;
  description?: string | null;
  type?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  vehicleIds?: string[];
}

export interface VehicleWithFleets {
  id: string;
  name: string;
  plate: string | null;
  fleets: Array<{ id: string; name: string }>;
}

export interface FleetsState {
  fleets: Fleet[];
  vehicles: VehicleWithFleets[];
  isLoading: boolean;
  error: string | null;
  showForm: boolean;
  editingFleet: Fleet | null;
  deletingId: string | null;
}

export interface FleetsActions {
  fetchFleets: () => Promise<void>;
  handleCreate: (data: FleetInput) => Promise<void>;
  handleUpdate: (data: FleetInput) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  setShowForm: (show: boolean) => void;
  setEditingFleet: (fleet: Fleet | null) => void;
  cancelForm: () => void;
}

export interface FleetsMeta {
  companyId: string | null;
  isReady: boolean;
  isSystemAdmin: boolean;
  companies: Array<{ id: string; commercialName: string }>;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  authCompanyId: string | null;
}

interface FleetsContextValue {
  state: FleetsState;
  actions: FleetsActions;
  meta: FleetsMeta;
}

const FleetsContext = createContext<FleetsContextValue | undefined>(undefined);

export function FleetsProvider({ children }: { children: ReactNode }) {
  const {
    effectiveCompanyId: companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  } = useCompanyContext();
  const { toast } = useToast();

  const {
    data: fleets = [],
    isLoading,
    error: fleetsError,
    mutate: mutateFleets,
  } = useFleetList();
  const { data: rawVehicles = [], mutate: mutateVehicles } = useVehicleList();

  const vehicles = useMemo<VehicleWithFleets[]>(
    () =>
      rawVehicles.map((v) => ({
        id: v.id,
        name: v.name || v.plate || "Sin nombre",
        plate: v.plate,
        fleets: v.fleets ?? [],
      })),
    [rawVehicles],
  );

  const error = fleetsError
    ? fleetsError instanceof Error
      ? fleetsError.message
      : "Error al cargar flotas"
    : null;

  const refetch = useCallback(async () => {
    await Promise.all([mutateFleets(), mutateVehicles()]);
  }, [mutateFleets, mutateVehicles]);

  const [showForm, setShowForm] = useState(false);
  const [editingFleet, setEditingFleet] = useState<Fleet | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async (data: FleetInput) => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/fleets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al crear flota");
      }
      await refetch();
      setShowForm(false);
      toast({
        title: "Flota creada",
        description: `La flota "${data.name}" ha sido creada exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al crear flota",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleUpdate = async (data: FleetInput) => {
    if (!editingFleet || !companyId) return;
    try {
      const response = await fetch(`/api/fleets/${editingFleet.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al actualizar flota");
      }
      await refetch();
      setEditingFleet(null);
      toast({
        title: "Flota actualizada",
        description: `La flota "${data.name}" ha sido actualizada exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al actualizar flota",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    if (!companyId) return;
    setDeletingId(id);
    const fleet = fleets.find((f) => f.id === id);
    try {
      const response = await fetch(`/api/fleets/${id}`, {
        method: "DELETE",
        headers: { "x-company-id": companyId },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || error.details || "Error al desactivar la flota",
        );
      }
      await refetch();
      toast({
        title: "Flota desactivada",
        description: fleet
          ? `La flota "${fleet.name}" ha sido desactivada.`
          : "La flota ha sido desactivada.",
      });
    } catch (err) {
      toast({
        title: "Error al desactivar flota",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingFleet(null);
  };

  const state: FleetsState = {
    fleets,
    vehicles,
    isLoading,
    error,
    showForm,
    editingFleet,
    deletingId,
  };
  const actions: FleetsActions = {
    fetchFleets: refetch,
    handleCreate,
    handleUpdate,
    handleDelete,
    setShowForm,
    setEditingFleet,
    cancelForm,
  };
  const meta: FleetsMeta = {
    companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  };

  return (
    <FleetsContext value={{ state, actions, meta }}>{children}</FleetsContext>
  );
}

export function useFleets(): FleetsContextValue {
  const context = use(FleetsContext);
  if (context === undefined) {
    throw new Error("useFleets must be used within a FleetsProvider");
  }
  return context;
}
