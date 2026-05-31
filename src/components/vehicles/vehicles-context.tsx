"use client";

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  useCompanyProfile,
  useDrivers,
  useFleetList,
  useVehicleList,
  useVehicleSkillList,
} from "@/hooks/queries";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";
import type { VehicleInput } from "@/lib/validations/vehicle";
import type { VehicleStatusTransitionInput } from "@/lib/validations/vehicle-status";

export interface Vehicle {
  id: string;
  name: string;
  plate: string | null;
  useNameAsPlate: boolean;
  brand: string | null;
  model: string | null;
  maxOrders: number;
  weightCapacity: number | null;
  volumeCapacity: number | null;
  maxValueCapacity: number | null;
  maxUnitsCapacity: number | null;
  originAddress: string | null;
  originLatitude: string | null;
  originLongitude: string | null;
  assignedDriverId: string | null;
  assignedDriver: { id: string; name: string } | null;
  licenseRequired: string | null;
  workdayStart: string | null;
  workdayEnd: string | null;
  hasBreakTime: boolean;
  breakDuration: number | null;
  breakTimeStart: string | null;
  breakTimeEnd: string | null;
  insuranceExpiry: string | null;
  inspectionExpiry: string | null;
  fleetIds: string[];
  fleets: Array<{ id: string; name: string }>;
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
  error: string | null;
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
  handleStatusChange: (
    vehicleId: string,
    data: VehicleStatusTransitionInput,
  ) => Promise<void>;
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

const VehiclesContext = createContext<VehiclesContextValue | undefined>(
  undefined,
);

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
  const { drivers } = useDrivers();
  const {
    data: rawVehicles = [],
    isLoading,
    error: vehiclesError,
    mutate: mutateVehicles,
  } = useVehicleList();
  const { data: fleets = [] } = useFleetList();
  const { data: availableSkills = [] } = useVehicleSkillList();
  const { profile } = useCompanyProfile();

  const vehicles = useMemo<Vehicle[]>(
    () =>
      rawVehicles.map((v) => ({
        ...v,
        fleetIds: v.fleets?.map((f) => f.id) ?? [],
      })),
    [rawVehicles],
  );
  const companyProfile = useMemo<CompanyProfile>(
    () => ({
      enableOrderValue: profile?.enableOrderValue ?? false,
      enableUnits: profile?.enableUnits ?? false,
      enableWeight: profile?.enableWeight ?? true,
      enableVolume: profile?.enableVolume ?? true,
    }),
    [profile],
  );
  const error = vehiclesError
    ? vehiclesError instanceof Error
      ? vehiclesError.message
      : "Error al cargar vehículos"
    : null;
  const refetchVehicles = useCallback(async () => {
    await mutateVehicles();
  }, [mutateVehicles]);

  const [showForm, setShowForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [editingVehicleSkillIds, setEditingVehicleSkillIds] = useState<
    string[]
  >([]);
  const [statusModalVehicle, setStatusModalVehicle] = useState<Vehicle | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchVehicleSkills = async (vehicleId: string) => {
    if (!companyId) return [];
    try {
      const response = await fetch(`/api/vehicles/${vehicleId}/skills`, {
        headers: { "x-company-id": companyId },
      });
      const data = await response.json();
      return data.skillIds || [];
    } catch (error) {
      console.error("Error fetching vehicle skills:", error);
      return [];
    }
  };

  const saveVehicleSkills = async (vehicleId: string, skillIds: string[]) => {
    if (!companyId) return;
    try {
      await fetch(`/api/vehicles/${vehicleId}/skills`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify({ skillIds }),
      });
    } catch (error) {
      console.error("Error saving vehicle skills:", error);
    }
  };

  const handleCreate = async (data: VehicleInput, skillIds?: string[]) => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/vehicles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
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
      await mutateVehicles();
      setShowForm(false);
      toast({
        title: "Vehículo creado",
        description: `El vehículo "${data.name}" ha sido creado exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al crear vehículo",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleUpdate = async (data: VehicleInput, skillIds?: string[]) => {
    if (!editingVehicle || !companyId) return;
    try {
      const response = await fetch(`/api/vehicles/${editingVehicle.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al actualizar vehículo");
      }
      if (skillIds !== undefined) {
        await saveVehicleSkills(editingVehicle.id, skillIds);
      }
      await mutateVehicles();
      setEditingVehicle(null);
      setEditingVehicleSkillIds([]);
      toast({
        title: "Vehículo actualizado",
        description: `El vehículo "${data.name}" ha sido actualizado exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al actualizar vehículo",
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
    const vehicle = vehicles.find((v) => v.id === id);
    try {
      const response = await fetch(`/api/vehicles/${id}`, {
        method: "DELETE",
        headers: { "x-company-id": companyId },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || error.details || "Error al desactivar el vehículo",
        );
      }
      await mutateVehicles();
      toast({
        title: "Vehículo desactivado",
        description: vehicle
          ? `El vehículo "${vehicle.name}" ha sido desactivado.`
          : "El vehículo ha sido desactivado.",
      });
    } catch (err) {
      toast({
        title: "Error al desactivar vehículo",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditVehicle = async (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    const skillIds = await fetchVehicleSkills(vehicle.id);
    setEditingVehicleSkillIds(skillIds);
  };

  const handleStatusChange = async (
    vehicleId: string,
    data: VehicleStatusTransitionInput,
  ) => {
    if (!companyId) return;
    const response = await fetch(
      `/api/vehicles/${vehicleId}/status-transition`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId,
        },
        body: JSON.stringify(data),
      },
    );
    if (!response.ok) throw response;
    await mutateVehicles();
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingVehicle(null);
    setEditingVehicleSkillIds([]);
  };

  const state: VehiclesState = {
    vehicles,
    fleets,
    drivers,
    companyProfile,
    availableSkills,
    isLoading,
    error,
    showForm,
    editingVehicle,
    editingVehicleSkillIds,
    statusModalVehicle,
    deletingId,
  };

  const actions: VehiclesActions = {
    fetchVehicles: refetchVehicles,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleEditVehicle,
    handleStatusChange,
    setShowForm,
    setStatusModalVehicle,
    cancelForm,
  };

  const meta: VehiclesMeta = {
    companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  };

  return (
    <VehiclesContext value={{ state, actions, meta }}>
      {children}
    </VehiclesContext>
  );
}

export function useVehicles(): VehiclesContextValue {
  const context = use(VehiclesContext);
  if (context === undefined) {
    throw new Error("useVehicles must be used within a VehiclesProvider");
  }
  return context;
}
