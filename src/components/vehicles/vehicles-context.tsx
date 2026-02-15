"use client";

import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";
import type { VehicleInput } from "@/lib/validations/vehicle";
import type { VehicleStatusTransitionInput } from "@/lib/validations/vehicle-status";

export interface Vehicle {
  id: string;
  name: string;
  plate: string | null;
  useNameAsPlate: boolean;
  loadType: string | null;
  maxOrders: number;
  originAddress: string | null;
  originLatitude: string | null;
  originLongitude: string | null;
  assignedDriverId: string | null;
  assignedDriver: { id: string; name: string } | null;
  workdayStart: string | null;
  workdayEnd: string | null;
  hasBreakTime: boolean;
  breakDuration: number | null;
  breakTimeStart: string | null;
  breakTimeEnd: string | null;
  fleetIds: string[];
  fleets: Array<{ id: string; name: string }>;
  brand: string | null;
  model: string | null;
  year: number | null;
  type: string | null;
  weightCapacity: number | null;
  volumeCapacity: number | null;
  maxValueCapacity: number | null;
  maxUnitsCapacity: number | null;
  refrigerated: boolean;
  heated: boolean;
  lifting: boolean;
  licenseRequired: string | null;
  insuranceExpiry: string | null;
  inspectionExpiry: string | null;
  status: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyProfile {
  enableOrderValue: boolean;
  enableUnits: boolean;
  enableWeight: boolean;
  enableVolume: boolean;
}

export interface Fleet {
  id: string;
  name: string;
}

export interface Driver {
  id: string;
  name: string;
}

export interface VehicleSkill {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
}

export const VEHICLE_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Disponible",
  IN_MAINTENANCE: "En Mantenimiento",
  ASSIGNED: "Asignado",
  INACTIVE: "Inactivo",
};

export interface VehiclesState {
  vehicles: Vehicle[];
  fleets: Fleet[];
  drivers: Driver[];
  companyProfile: CompanyProfile | null;
  availableSkills: VehicleSkill[];
  isLoading: boolean;
  showForm: boolean;
  editingVehicle: Vehicle | null;
  editingVehicleSkillIds: string[];
  statusModalVehicle: Vehicle | null;
  deletingId: string | null;
}

export interface VehiclesActions {
  fetchVehicles: () => Promise<void>;
  handleCreate: (data: VehicleInput, skillIds?: string[]) => Promise<void>;
  handleUpdate: (data: VehicleInput, skillIds?: string[]) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handleEditVehicle: (vehicle: Vehicle) => Promise<void>;
  handleStatusChange: (vehicleId: string, data: VehicleStatusTransitionInput) => Promise<void>;
  setShowForm: (show: boolean) => void;
  setStatusModalVehicle: (vehicle: Vehicle | null) => void;
  cancelForm: () => void;
}

export interface VehiclesMeta {
  companyId: string | null;
  isReady: boolean;
  isSystemAdmin: boolean;
  companies: Array<{ id: string; commercialName: string }>;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  authCompanyId: string | null;
}

interface VehiclesContextValue {
  state: VehiclesState;
  actions: VehiclesActions;
  meta: VehiclesMeta;
}

const VehiclesContext = createContext<VehiclesContextValue | undefined>(undefined);

export function VehiclesProvider({ children }: { children: ReactNode }) {
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

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [availableSkills, setAvailableSkills] = useState<VehicleSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [editingVehicleSkillIds, setEditingVehicleSkillIds] = useState<string[]>([]);
  const [statusModalVehicle, setStatusModalVehicle] = useState<Vehicle | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchVehicles = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/vehicles", { headers: { "x-company-id": companyId } });
      const data = await response.json();
      const vehiclesData = (data.data || []).map((v: Vehicle & { fleets?: Array<{ id: string; name: string }> }) => ({
        ...v,
        fleetIds: v.fleets?.map((f) => f.id) || [],
      }));
      setVehicles(vehiclesData);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  const fetchFleets = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/fleets", { headers: { "x-company-id": companyId } });
      const data = await response.json();
      setFleets(data.data || []);
    } catch (error) {
      console.error("Error fetching fleets:", error);
    }
  }, [companyId]);

  const fetchDrivers = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/users?role=CONDUCTOR", { headers: { "x-company-id": companyId } });
      const data = await response.json();
      setDrivers((data.data || []).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })));
    } catch (error) {
      console.error("Error fetching drivers:", error);
    }
  }, [companyId]);

  const fetchCompanyProfile = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/company-profiles", { headers: { "x-company-id": companyId } });
      const data = await response.json();
      if (data.data?.profile) {
        setCompanyProfile({
          enableOrderValue: data.data.profile.enableOrderValue ?? false,
          enableUnits: data.data.profile.enableUnits ?? false,
          enableWeight: data.data.profile.enableWeight ?? true,
          enableVolume: data.data.profile.enableVolume ?? true,
        });
      } else {
        setCompanyProfile({ enableOrderValue: false, enableUnits: false, enableWeight: true, enableVolume: true });
      }
    } catch (error) {
      console.error("Error fetching company profile:", error);
      setCompanyProfile({ enableOrderValue: false, enableUnits: false, enableWeight: true, enableVolume: true });
    }
  }, [companyId]);

  const fetchAvailableSkills = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/vehicle-skills?active=true", { headers: { "x-company-id": companyId } });
      const data = await response.json();
      setAvailableSkills(data.data || []);
    } catch (error) {
      console.error("Error fetching vehicle skills:", error);
    }
  }, [companyId]);

  const fetchVehicleSkills = useCallback(
    async (vehicleId: string) => {
      if (!companyId) return [];
      try {
        const response = await fetch(`/api/vehicles/${vehicleId}/skills`, { headers: { "x-company-id": companyId } });
        const data = await response.json();
        return data.skillIds || [];
      } catch (error) {
        console.error("Error fetching vehicle skills:", error);
        return [];
      }
    },
    [companyId]
  );

  const saveVehicleSkills = useCallback(
    async (vehicleId: string, skillIds: string[]) => {
      if (!companyId) return;
      try {
        await fetch(`/api/vehicles/${vehicleId}/skills`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-company-id": companyId },
          body: JSON.stringify({ skillIds }),
        });
      } catch (error) {
        console.error("Error saving vehicle skills:", error);
      }
    },
    [companyId]
  );

  useEffect(() => {
    fetchVehicles();
    fetchFleets();
    fetchDrivers();
    fetchCompanyProfile();
    fetchAvailableSkills();
  }, [companyId, fetchDrivers, fetchFleets, fetchVehicles, fetchCompanyProfile, fetchAvailableSkills]);

  const handleCreate = useCallback(
    async (data: VehicleInput, skillIds?: string[]) => {
      try {
        const response = await fetch("/api/vehicles", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-company-id": companyId ?? "" },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al crear vehículo");
        }
        const result = await response.json();
        if (skillIds && skillIds.length > 0 && result.id) {
          await saveVehicleSkills(result.id, skillIds);
        }
        await fetchVehicles();
        setShowForm(false);
        toast({ title: "Vehículo creado", description: `El vehículo "${data.name}" ha sido creado exitosamente.` });
      } catch (err) {
        toast({
          title: "Error al crear vehículo",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
        throw err;
      }
    },
    [companyId, saveVehicleSkills, fetchVehicles, toast]
  );

  const handleUpdate = useCallback(
    async (data: VehicleInput, skillIds?: string[]) => {
      if (!editingVehicle) return;
      try {
        const response = await fetch(`/api/vehicles/${editingVehicle.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-company-id": companyId ?? "" },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al actualizar vehículo");
        }
        if (skillIds !== undefined) {
          await saveVehicleSkills(editingVehicle.id, skillIds);
        }
        await fetchVehicles();
        setEditingVehicle(null);
        setEditingVehicleSkillIds([]);
        toast({ title: "Vehículo actualizado", description: `El vehículo "${data.name}" ha sido actualizado exitosamente.` });
      } catch (err) {
        toast({
          title: "Error al actualizar vehículo",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
        throw err;
      }
    },
    [editingVehicle, companyId, saveVehicleSkills, fetchVehicles, toast]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      const vehicle = vehicles.find((v) => v.id === id);
      try {
        const response = await fetch(`/api/vehicles/${id}`, {
          method: "DELETE",
          headers: { "x-company-id": companyId ?? "" },
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || error.details || "Error al desactivar el vehículo");
        }
        await fetchVehicles();
        toast({
          title: "Vehículo desactivado",
          description: vehicle ? `El vehículo "${vehicle.name}" ha sido desactivado.` : "El vehículo ha sido desactivado.",
        });
      } catch (err) {
        toast({
          title: "Error al desactivar vehículo",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
      } finally {
        setDeletingId(null);
      }
    },
    [vehicles, companyId, fetchVehicles, toast]
  );

  const handleEditVehicle = useCallback(
    async (vehicle: Vehicle) => {
      setEditingVehicle(vehicle);
      const skillIds = await fetchVehicleSkills(vehicle.id);
      setEditingVehicleSkillIds(skillIds);
    },
    [fetchVehicleSkills]
  );

  const handleStatusChange = useCallback(
    async (vehicleId: string, data: VehicleStatusTransitionInput) => {
      const response = await fetch(`/api/vehicles/${vehicleId}/status-transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-company-id": companyId ?? "" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw response;
      await fetchVehicles();
    },
    [companyId, fetchVehicles]
  );

  const cancelForm = useCallback(() => {
    setShowForm(false);
    setEditingVehicle(null);
    setEditingVehicleSkillIds([]);
  }, []);

  const state: VehiclesState = {
    vehicles,
    fleets,
    drivers,
    companyProfile,
    availableSkills,
    isLoading,
    showForm,
    editingVehicle,
    editingVehicleSkillIds,
    statusModalVehicle,
    deletingId,
  };

  const actions: VehiclesActions = {
    fetchVehicles,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleEditVehicle,
    handleStatusChange,
    setShowForm,
    setStatusModalVehicle,
    cancelForm,
  };

  const meta: VehiclesMeta = { companyId, isReady, isSystemAdmin, companies, selectedCompanyId, setSelectedCompanyId, authCompanyId };

  return <VehiclesContext value={{ state, actions, meta }}>{children}</VehiclesContext>;
}

export function useVehicles(): VehiclesContextValue {
  const context = use(VehiclesContext);
  if (context === undefined) {
    throw new Error("useVehicles must be used within a VehiclesProvider");
  }
  return context;
}
