"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";
import type { ZoneInput } from "@/lib/validations/zone";

// Types
export interface Zone {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  geometry: string;
  parsedGeometry?: {
    type: "Polygon";
    coordinates: number[][][];
  } | null;
  color: string;
  isDefault: boolean;
  activeDays?: string[] | null;
  active: boolean;
  vehicleCount: number;
  vehicles?: Array<{ id: string; name: string; plate: string | null }>;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleOption {
  id: string;
  name: string;
  plate: string | null;
}

export type ViewMode = "list" | "form" | "map-editor";

export const DAY_LABELS: Record<string, string> = {
  MONDAY: "Lun",
  TUESDAY: "Mar",
  WEDNESDAY: "Mié",
  THURSDAY: "Jue",
  FRIDAY: "Vie",
  SATURDAY: "Sáb",
  SUNDAY: "Dom",
};

// State
export interface ZonesState {
  zones: Zone[];
  vehicles: VehicleOption[];
  isLoading: boolean;
  isSubmitting: boolean;
  viewMode: ViewMode;
  editingZone: Zone | null;
  editingZoneVehicleIds: string[];
  pendingFormData: Partial<ZoneInput> | null;
  selectedZoneId: string | null;
  searchQuery: string;
  deletingId: string | null;
}

// Actions
export interface ZonesActions {
  fetchZones: () => Promise<void>;
  handleCreate: (data: ZoneInput, vehicleIds: string[]) => Promise<void>;
  handleUpdate: (data: ZoneInput, vehicleIds: string[]) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handleStartNew: () => void;
  handleEdit: (zone: Zone) => Promise<void>;
  handleMapSave: (geometry: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedZoneId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setPendingFormData: (data: Partial<ZoneInput> | null) => void;
  setEditingZoneVehicleIds: (ids: string[]) => void;
  cancelForm: () => void;
}

// Meta
export interface ZonesMeta {
  companyId: string | null;
  isReady: boolean;
  isSystemAdmin: boolean;
  companies: Array<{ id: string; commercialName: string }>;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  authCompanyId: string | null;
}

// Derived
export interface ZonesDerived {
  filteredZones: Zone[];
  selectedZone: Zone | undefined;
  activeZonesCount: number;
  currentFormGeometry: string | undefined;
  currentFormColor: string;
}

interface ZonesContextValue {
  state: ZonesState;
  actions: ZonesActions;
  meta: ZonesMeta;
  derived: ZonesDerived;
}

const ZonesContext = createContext<ZonesContextValue | undefined>(undefined);

export function ZonesProvider({ children }: { children: ReactNode }) {
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

  const [zones, setZones] = useState<Zone[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [editingZoneVehicleIds, setEditingZoneVehicleIds] = useState<string[]>([]);
  const [pendingFormData, setPendingFormData] = useState<Partial<ZoneInput> | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchZones = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/zones", {
        headers: { "x-company-id": companyId },
      });
      const data = await response.json();
      setZones(data.data || []);
    } catch (error) {
      console.error("Error fetching zones:", error);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  const fetchVehicles = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/vehicles?limit=100", {
        headers: { "x-company-id": companyId },
      });
      const data = await response.json();
      setVehicles(
        (data.data || []).map(
          (v: { id: string; name?: string; plate?: string | null }) => ({
            id: v.id,
            name: v.name || v.plate || "Sin nombre",
            plate: v.plate ?? null,
          })
        )
      );
    } catch (error) {
      console.error("Error fetching vehicles:", error);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      fetchZones();
      fetchVehicles();
    }
  }, [companyId, fetchZones, fetchVehicles]);

  const handleCreate = useCallback(
    async (data: ZoneInput, vehicleIds: string[]) => {
      if (!companyId || isSubmitting) return;
      setIsSubmitting(true);
      try {
        const response = await fetch("/api/zones", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": companyId,
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al crear zona");
        }

        const createdZone = await response.json();
        if (vehicleIds.length > 0 && createdZone.id) {
          await fetch(`/api/zones/${createdZone.id}/vehicles`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-company-id": companyId,
            },
            body: JSON.stringify({
              vehicleIds,
              assignedDays: data.activeDays || null,
            }),
          });
        }

        await fetchZones();
        setViewMode("list");
        setPendingFormData(null);
        toast({
          title: "Zona creada",
          description: `La zona "${data.name}" ha sido creada exitosamente.`,
        });
      } catch (err) {
        toast({
          title: "Error al crear zona",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [companyId, isSubmitting, fetchZones, toast]
  );

  const handleUpdate = useCallback(
    async (data: ZoneInput, vehicleIds: string[]) => {
      if (!editingZone || !companyId || isSubmitting) return;
      setIsSubmitting(true);
      try {
        const response = await fetch(`/api/zones/${editingZone.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": companyId,
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al actualizar zona");
        }

        await fetch(`/api/zones/${editingZone.id}/vehicles`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": companyId,
          },
          body: JSON.stringify({
            vehicleIds,
            assignedDays: data.activeDays || null,
          }),
        });

        await fetchZones();
        setEditingZone(null);
        setEditingZoneVehicleIds([]);
        setViewMode("list");
        setPendingFormData(null);
        toast({
          title: "Zona actualizada",
          description: `La zona "${data.name}" ha sido actualizada exitosamente.`,
        });
      } catch (err) {
        toast({
          title: "Error al actualizar zona",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingZone, companyId, isSubmitting, fetchZones, toast]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!companyId) return;
      setDeletingId(id);
      const zone = zones.find((z) => z.id === id);

      try {
        const response = await fetch(`/api/zones/${id}`, {
          method: "DELETE",
          headers: { "x-company-id": companyId },
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al desactivar la zona");
        }

        if (selectedZoneId === id) setSelectedZoneId(null);
        await fetchZones();
        toast({
          title: "Zona desactivada",
          description: zone
            ? `La zona "${zone.name}" ha sido desactivada.`
            : "La zona ha sido desactivada.",
        });
      } catch (err) {
        toast({
          title: "Error al desactivar zona",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
      } finally {
        setDeletingId(null);
      }
    },
    [zones, companyId, selectedZoneId, fetchZones, toast]
  );

  const handleStartNew = useCallback(() => {
    setEditingZone(null);
    setEditingZoneVehicleIds([]);
    setPendingFormData(null);
    setViewMode("form");
  }, []);

  const handleEdit = useCallback(
    async (zone: Zone) => {
      setEditingZone(zone);
      setPendingFormData({
        name: zone.name,
        description: zone.description,
        type: zone.type as ZoneInput["type"],
        geometry: zone.geometry,
        color: zone.color,
        isDefault: zone.isDefault,
        activeDays: zone.activeDays as ZoneInput["activeDays"],
        active: zone.active,
      });

      if (companyId) {
        try {
          const response = await fetch(`/api/zones/${zone.id}/vehicles`, {
            headers: { "x-company-id": companyId },
          });
          if (response.ok) {
            const data = await response.json();
            setEditingZoneVehicleIds((data.vehicles || []).map((v: { id: string }) => v.id));
          }
        } catch {
          setEditingZoneVehicleIds([]);
        }
      }

      setViewMode("form");
    },
    [companyId]
  );

  const handleMapSave = useCallback((geometry: string) => {
    setPendingFormData((prev) => ({ ...prev, geometry }));
    setViewMode("form");
  }, []);

  const cancelForm = useCallback(() => {
    setViewMode("list");
    setEditingZone(null);
    setEditingZoneVehicleIds([]);
    setPendingFormData(null);
  }, []);

  // Derived values
  const filteredZones = zones.filter((zone) => {
    if (!searchQuery) return true;
    return zone.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const selectedZone = zones.find((z) => z.id === selectedZoneId);
  const activeZonesCount = zones.filter((z) => z.active).length;
  const currentFormGeometry = pendingFormData?.geometry || editingZone?.geometry;
  const currentFormColor = pendingFormData?.color || editingZone?.color || "#3B82F6";

  const state: ZonesState = {
    zones,
    vehicles,
    isLoading,
    isSubmitting,
    viewMode,
    editingZone,
    editingZoneVehicleIds,
    pendingFormData,
    selectedZoneId,
    searchQuery,
    deletingId,
  };

  const actions: ZonesActions = {
    fetchZones,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleStartNew,
    handleEdit,
    handleMapSave,
    setViewMode,
    setSelectedZoneId,
    setSearchQuery,
    setPendingFormData,
    setEditingZoneVehicleIds,
    cancelForm,
  };

  const meta: ZonesMeta = {
    companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  };

  const derived: ZonesDerived = {
    filteredZones,
    selectedZone,
    activeZonesCount,
    currentFormGeometry,
    currentFormColor,
  };

  return (
    <ZonesContext value={{ state, actions, meta, derived }}>
      {children}
    </ZonesContext>
  );
}

export function useZones(): ZonesContextValue {
  const context = use(ZonesContext);
  if (context === undefined) {
    throw new Error("useZones must be used within a ZonesProvider");
  }
  return context;
}
