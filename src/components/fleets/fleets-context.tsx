"use client";

import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";
import type { FleetInput } from "@/lib/validations/fleet";

export interface Fleet {
  id: string;
  name: string;
  description?: string | null;
  type?: string | null;
  weightCapacity?: number | null;
  volumeCapacity?: number | null;
  operationStart?: string | null;
  operationEnd?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  vehicleIds?: string[];
  userIds?: string[];
}

export interface VehicleWithFleets {
  id: string;
  name: string;
  plate: string | null;
  fleets: Array<{ id: string; name: string }>;
}

export interface UserWithFleets {
  id: string;
  name: string;
  role: string;
  fleets: Array<{ id: string; name: string }>;
}

export interface FleetsState {
  fleets: Fleet[];
  vehicles: VehicleWithFleets[];
  users: UserWithFleets[];
  isLoading: boolean;
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

  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [vehicles, setVehicles] = useState<VehicleWithFleets[]>([]);
  const [users, setUsers] = useState<UserWithFleets[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingFleet, setEditingFleet] = useState<Fleet | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchFleets = useCallback(async (signal?: AbortSignal) => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/fleets", { headers: { "x-company-id": companyId }, signal });
      const data = await response.json();
      setFleets(data.data || []);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Error fetching fleets:", error);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  const fetchVehiclesAndUsers = useCallback(async (signal?: AbortSignal) => {
    if (!companyId) return;
    try {
      const vehiclesRes = await fetch("/api/vehicles", { headers: { "x-company-id": companyId }, signal });
      const vehiclesData = await vehiclesRes.json();
      const vehiclesList = vehiclesData.data || [];
      const vehiclesWithFleets: VehicleWithFleets[] = vehiclesList.map(
        (v: { id: string; name?: string; plate?: string; fleets?: Array<{ id: string; name: string }> }) => ({
          id: v.id,
          name: v.name || v.plate || "Sin nombre",
          plate: v.plate,
          fleets: v.fleets || [],
        })
      );
      setVehicles(vehiclesWithFleets);

      const usersRes = await fetch("/api/users", { headers: { "x-company-id": companyId }, signal });
      const usersData = await usersRes.json();
      const usersList = usersData.data || [];
      const usersWithFleets: UserWithFleets[] = usersList
        .filter((u: { role: string }) => u.role === "ADMIN_FLOTA" || u.role === "PLANIFICADOR" || u.role === "ADMIN_SISTEMA" || u.role === "MONITOR")
        .map((u: { id: string; name: string; role: string; fleetPermissions?: Array<{ id: string; name: string }> }) => ({
          id: u.id,
          name: u.name,
          role: u.role,
          fleets: u.fleetPermissions || [],
        }));
      setUsers(usersWithFleets);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Error fetching vehicles/users:", error);
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;

    const controller = new AbortController();

    Promise.all([
      fetchFleets(controller.signal),
      fetchVehiclesAndUsers(controller.signal),
    ]).catch(() => {
      // Ignore abort errors
    });

    return () => controller.abort();
  }, [fetchFleets, fetchVehiclesAndUsers, companyId]);

  const handleCreate = useCallback(
    async (data: FleetInput) => {
      if (!companyId) return;
      try {
        const response = await fetch("/api/fleets", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-company-id": companyId },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al crear flota");
        }
        await Promise.all([fetchFleets(), fetchVehiclesAndUsers()]);
        setShowForm(false);
        toast({ title: "Flota creada", description: `La flota "${data.name}" ha sido creada exitosamente.` });
      } catch (err) {
        toast({
          title: "Error al crear flota",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
        throw err;
      }
    },
    [companyId, fetchFleets, fetchVehiclesAndUsers, toast]
  );

  const handleUpdate = useCallback(
    async (data: FleetInput) => {
      if (!editingFleet || !companyId) return;
      try {
        const response = await fetch(`/api/fleets/${editingFleet.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-company-id": companyId },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al actualizar flota");
        }
        await Promise.all([fetchFleets(), fetchVehiclesAndUsers()]);
        setEditingFleet(null);
        toast({ title: "Flota actualizada", description: `La flota "${data.name}" ha sido actualizada exitosamente.` });
      } catch (err) {
        toast({
          title: "Error al actualizar flota",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
        throw err;
      }
    },
    [editingFleet, companyId, fetchFleets, fetchVehiclesAndUsers, toast]
  );

  const handleDelete = useCallback(
    async (id: string) => {
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
          throw new Error(error.error || error.details || "Error al desactivar la flota");
        }
        await Promise.all([fetchFleets(), fetchVehiclesAndUsers()]);
        toast({
          title: "Flota desactivada",
          description: fleet ? `La flota "${fleet.name}" ha sido desactivada.` : "La flota ha sido desactivada.",
        });
      } catch (err) {
        toast({
          title: "Error al desactivar flota",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
      } finally {
        setDeletingId(null);
      }
    },
    [companyId, fleets, fetchFleets, fetchVehiclesAndUsers, toast]
  );

  const cancelForm = useCallback(() => {
    setShowForm(false);
    setEditingFleet(null);
  }, []);

  const state: FleetsState = { fleets, vehicles, users, isLoading, showForm, editingFleet, deletingId };
  const actions: FleetsActions = { fetchFleets, handleCreate, handleUpdate, handleDelete, setShowForm, setEditingFleet, cancelForm };
  const meta: FleetsMeta = { companyId, isReady, isSystemAdmin, companies, selectedCompanyId, setSelectedCompanyId, authCompanyId };

  return <FleetsContext value={{ state, actions, meta }}>{children}</FleetsContext>;
}

export function useFleets(): FleetsContextValue {
  const context = use(FleetsContext);
  if (context === undefined) {
    throw new Error("useFleets must be used within a FleetsProvider");
  }
  return context;
}
