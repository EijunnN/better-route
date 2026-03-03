"use client";

import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";
import type { VehicleSkillInput } from "@/lib/validations/vehicle-skill";

export interface VehicleSkill {
  id: string;
  code: string;
  name: string;
  category: string;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const CATEGORY_BADGE_COLORS: Record<string, string> = {
  EQUIPMENT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  TEMPERATURE: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  CERTIFICATIONS: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  SPECIAL: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

export interface VehicleSkillsState {
  skills: VehicleSkill[];
  isLoading: boolean;
  error: string | null;
  showForm: boolean;
  editingSkill: VehicleSkill | null;
  filterCategory: string;
  filterActive: string;
  searchTerm: string;
  deletingId: string | null;
}

export interface VehicleSkillsActions {
  fetchSkills: () => Promise<void>;
  handleCreate: (data: VehicleSkillInput) => Promise<void>;
  handleUpdate: (data: VehicleSkillInput) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handleToggleActive: (skill: VehicleSkill) => Promise<void>;
  setShowForm: (show: boolean) => void;
  setEditingSkill: (skill: VehicleSkill | null) => void;
  setFilterCategory: (category: string) => void;
  setFilterActive: (active: string) => void;
  setSearchTerm: (term: string) => void;
  cancelForm: () => void;
}

export interface VehicleSkillsMeta {
  companyId: string | null;
  isReady: boolean;
}

interface VehicleSkillsContextValue {
  state: VehicleSkillsState;
  actions: VehicleSkillsActions;
  meta: VehicleSkillsMeta;
}

const VehicleSkillsContext = createContext<VehicleSkillsContextValue | undefined>(undefined);

export function VehicleSkillsProvider({ children }: { children: ReactNode }) {
  const { effectiveCompanyId: companyId, isReady } = useCompanyContext();
  const { toast } = useToast();

  const [skills, setSkills] = useState<VehicleSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSkill, setEditingSkill] = useState<VehicleSkill | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterActive, setFilterActive] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSkills = async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCategory && filterCategory !== "__all__") params.append("category", filterCategory);
      if (filterActive && filterActive !== "__all__") params.append("active", filterActive);
      if (searchTerm) params.append("search", searchTerm);

      const response = await fetch(`/api/vehicle-skills?${params.toString()}`, {
        headers: { "x-company-id": companyId },
      });
      const data = await response.json();
      setSkills(data.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las habilidades");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, [companyId, filterCategory, filterActive, searchTerm]);

  const handleCreate = async (data: VehicleSkillInput) => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/vehicle-skills", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-company-id": companyId },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw error;
      }
      await fetchSkills();
      setShowForm(false);
      toast({ title: "Habilidad creada", description: `La habilidad "${data.name}" ha sido creada exitosamente.` });
    } catch (err) {
      toast({
        title: "Error al crear habilidad",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleUpdate = async (data: VehicleSkillInput) => {
    if (!editingSkill || !companyId) return;
    try {
      const response = await fetch(`/api/vehicle-skills/${editingSkill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-company-id": companyId },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw error;
      }
      await fetchSkills();
      setEditingSkill(null);
      toast({ title: "Habilidad actualizada", description: `La habilidad "${data.name}" ha sido actualizada exitosamente.` });
    } catch (err) {
      toast({
        title: "Error al actualizar habilidad",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    if (!companyId) return;
    setDeletingId(id);
    const skill = skills.find((s) => s.id === id);
    try {
      const response = await fetch(`/api/vehicle-skills/${id}`, {
        method: "DELETE",
        headers: { "x-company-id": companyId },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.details || "Error al eliminar la habilidad");
      }
      await fetchSkills();
      toast({
        title: "Habilidad eliminada",
        description: skill ? `La habilidad "${skill.name}" ha sido eliminada.` : "La habilidad ha sido eliminada.",
      });
    } catch (err) {
      toast({
        title: "Error al eliminar habilidad",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (skill: VehicleSkill) => {
    if (!companyId) return;
    try {
      const response = await fetch(`/api/vehicle-skills/${skill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-company-id": companyId },
        body: JSON.stringify({ active: !skill.active }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al actualizar el estado");
      }
      await fetchSkills();
      toast({
        title: "Estado actualizado",
        description: `La habilidad "${skill.name}" ahora está ${!skill.active ? "activa" : "inactiva"}.`,
      });
    } catch (err) {
      toast({
        title: "Error al actualizar estado",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingSkill(null);
  };

  const state: VehicleSkillsState = {
    skills,
    isLoading,
    error,
    showForm,
    editingSkill,
    filterCategory,
    filterActive,
    searchTerm,
    deletingId,
  };

  const actions: VehicleSkillsActions = {
    fetchSkills,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleToggleActive,
    setShowForm,
    setEditingSkill,
    setFilterCategory,
    setFilterActive,
    setSearchTerm,
    cancelForm,
  };

  const meta: VehicleSkillsMeta = { companyId, isReady };

  return <VehicleSkillsContext value={{ state, actions, meta }}>{children}</VehicleSkillsContext>;
}

export function useVehicleSkills(): VehicleSkillsContextValue {
  const context = use(VehicleSkillsContext);
  if (context === undefined) {
    throw new Error("useVehicleSkills must be used within a VehicleSkillsProvider");
  }
  return context;
}
