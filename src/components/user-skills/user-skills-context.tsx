"use client";

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useUserList, useVehicleSkillList } from "@/hooks/queries";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";
import type { UserSkillInput } from "@/lib/validations/user-skill";

export interface UserSkill {
  id: string;
  userId: string;
  skillId: string;
  obtainedAt: string;
  expiresAt?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  skill: {
    id: string;
    code: string;
    name: string;
    category: string;
    description?: string;
  };
  user: { id: string; name: string; identification: string | null };
  expiryStatus?: string;
}

export interface User {
  id: string;
  name: string;
  identification: string | null;
  role: string;
}

export interface VehicleSkill {
  id: string;
  code: string;
  name: string;
  category: string;
  description?: string;
  active: boolean;
}

export const VEHICLE_SKILL_CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: "Equipamiento",
  TEMPERATURE: "Temperatura",
  CERTIFICATIONS: "Certificaciones",
  SPECIAL: "Especiales",
};

export const EXPIRY_STATUS_LABELS: Record<string, string> = {
  valid: "Vigente",
  expiring_soon: "Pronto a vencer",
  expired: "Vencida",
};

export const getCategoryColor = (category: string) => {
  switch (category) {
    case "EQUIPMENT":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "TEMPERATURE":
      return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400";
    case "CERTIFICATIONS":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "SPECIAL":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
  }
};

export interface UserSkillsState {
  userSkills: UserSkill[];
  filteredUserSkills: UserSkill[];
  users: User[];
  skills: VehicleSkill[];
  isLoading: boolean;
  showForm: boolean;
  editingUserSkill: UserSkill | null;
  filterUser: string;
  filterStatus: string;
  filterCategory: string;
  filterExpiry: string;
  deletingId: string | null;
}

export interface UserSkillsActions {
  handleCreate: (data: UserSkillInput) => Promise<void>;
  handleUpdate: (data: UserSkillInput) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handleToggleActive: (id: string, currentActive: boolean) => Promise<void>;
  setShowForm: (show: boolean) => void;
  setEditingUserSkill: (skill: UserSkill | null) => void;
  setFilterUser: (user: string) => void;
  setFilterStatus: (status: string) => void;
  setFilterCategory: (category: string) => void;
  setFilterExpiry: (expiry: string) => void;
  cancelForm: () => void;
}

export interface UserSkillsMeta {
  companyId: string | null;
  isReady: boolean;
}

interface UserSkillsContextValue {
  state: UserSkillsState;
  actions: UserSkillsActions;
  meta: UserSkillsMeta;
}

const UserSkillsContext = createContext<UserSkillsContextValue | undefined>(
  undefined,
);

export function UserSkillsProvider({ children }: { children: ReactNode }) {
  const { effectiveCompanyId: companyId, isReady } = useCompanyContext();
  const { toast } = useToast();

  const [userSkills, setUserSkills] = useState<UserSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUserSkill, setEditingUserSkill] = useState<UserSkill | null>(
    null,
  );
  const [filterUser, setFilterUser] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterExpiry, setFilterExpiry] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: rawUsers = [] } = useUserList({ active: true });
  const users: User[] = rawUsers
    .filter((u) => u.role === "CONDUCTOR")
    .map((u) => ({
      id: u.id,
      name: u.name,
      identification: u.identification ?? null,
      role: u.role,
    }));

  const { data: rawSkills = [] } = useVehicleSkillList();
  const skills: VehicleSkill[] = rawSkills.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    category: s.category,
    description: s.description ?? undefined,
    active: true,
  }));

  const fetchUserSkills = useCallback(async () => {
    if (!companyId) return;
    try {
      const params = new URLSearchParams();
      if (filterUser && filterUser !== "__all__")
        params.append("userId", filterUser);
      if (filterStatus && filterStatus !== "__all__")
        params.append("active", filterStatus);
      if (filterExpiry && filterExpiry !== "__all__")
        params.append("status", filterExpiry);

      const response = await fetch(`/api/user-skills?${params.toString()}`, {
        headers: { "x-company-id": companyId },
      });
      const data = await response.json();
      setUserSkills(data.data || []);
    } catch (error) {
      console.error("Error al cargar habilidades:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las habilidades de usuarios",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [companyId, filterUser, filterStatus, filterExpiry, toast]);
  const apiMutate = useApiMutation(fetchUserSkills);

  useEffect(() => {
    fetchUserSkills();
  }, [fetchUserSkills]);

  const handleCreate = async (data: UserSkillInput) => {
    await apiMutate("/api/user-skills", {
      body: data,
      errorTitle: "Error al asignar habilidad",
      success: {
        title: "Habilidad asignada",
        description: "La habilidad ha sido asignada exitosamente al usuario.",
      },
    });
    setShowForm(false);
  };

  const handleUpdate = async (data: UserSkillInput) => {
    if (!editingUserSkill) return;
    await apiMutate(`/api/user-skills/${editingUserSkill.id}`, {
      method: "PATCH",
      body: data,
      errorTitle: "Error al actualizar habilidad",
      success: {
        title: "Habilidad actualizada",
        description:
          "La habilidad del usuario ha sido actualizada exitosamente.",
      },
    });
    setEditingUserSkill(null);
  };

  const handleDelete = async (id: string) => {
    const userSkill = userSkills.find((us) => us.id === id);
    setDeletingId(id);
    await apiMutate(`/api/user-skills/${id}`, {
      method: "DELETE",
      rethrow: false,
      errorTitle: "Error al desactivar habilidad",
      success: {
        title: "Habilidad desactivada",
        description: userSkill
          ? `La habilidad "${userSkill.skill.name}" de ${userSkill.user.name} ha sido desactivada.`
          : "La habilidad ha sido desactivada.",
      },
    });
    setDeletingId(null);
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    await apiMutate(`/api/user-skills/${id}`, {
      method: "PATCH",
      body: { active: !currentActive },
      rethrow: false,
      errorTitle: "Error al actualizar estado",
      success: {
        title: "Estado actualizado",
        description: `La habilidad ahora está ${!currentActive ? "activa" : "inactiva"}.`,
      },
    });
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingUserSkill(null);
  };

  const filteredUserSkills =
    !filterCategory || filterCategory === "__all__"
      ? userSkills
      : userSkills.filter((us) => us.skill.category === filterCategory);

  const state: UserSkillsState = {
    userSkills,
    filteredUserSkills,
    users,
    skills,
    isLoading,
    showForm,
    editingUserSkill,
    filterUser,
    filterStatus,
    filterCategory,
    filterExpiry,
    deletingId,
  };

  const actions: UserSkillsActions = {
    handleCreate,
    handleUpdate,
    handleDelete,
    handleToggleActive,
    setShowForm,
    setEditingUserSkill,
    setFilterUser,
    setFilterStatus,
    setFilterCategory,
    setFilterExpiry,
    cancelForm,
  };

  const meta: UserSkillsMeta = { companyId, isReady };

  return (
    <UserSkillsContext value={{ state, actions, meta }}>
      {children}
    </UserSkillsContext>
  );
}

export function useUserSkills(): UserSkillsContextValue {
  const context = use(UserSkillsContext);
  if (context === undefined) {
    throw new Error("useUserSkills must be used within a UserSkillsProvider");
  }
  return context;
}
