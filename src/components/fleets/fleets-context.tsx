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
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useCompanyContext } from "@/hooks/use-company-context";
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
  const apiMutate = useApiMutation(refetch);

  const [showForm, setShowForm] = useState(false);
  const [editingFleet, setEditingFleet] = useState<Fleet | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async (data: FleetInput) => {
    await apiMutate("/api/fleets", {
      body: data,
      errorTitle: "Error al crear flota",
      success: {
        title: "Flota creada",
        description: `La flota "${data.name}" ha sido creada exitosamente.`,
      },
    });
    setShowForm(false);
  };

  const handleUpdate = async (data: FleetInput) => {
    if (!editingFleet) return;
    await apiMutate(`/api/fleets/${editingFleet.id}`, {
      method: "PATCH",
      body: data,
      errorTitle: "Error al actualizar flota",
      success: {
        title: "Flota actualizada",
        description: `La flota "${data.name}" ha sido actualizada exitosamente.`,
      },
    });
    setEditingFleet(null);
  };

  const handleDelete = async (id: string) => {
    const fleet = fleets.find((f) => f.id === id);
    setDeletingId(id);
    await apiMutate(`/api/fleets/${id}`, {
      method: "DELETE",
      rethrow: false,
      errorTitle: "Error al desactivar flota",
      success: {
        title: "Flota desactivada",
        description: fleet
          ? `La flota "${fleet.name}" ha sido desactivada.`
          : "La flota ha sido desactivada.",
      },
    });
    setDeletingId(null);
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
