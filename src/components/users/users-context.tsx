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
import type { CreateUserInput } from "@/lib/validations/user";

// Types
export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  phone?: string | null;
  identification?: string | null;
  birthDate?: string | null;
  photo?: string | null;
  licenseNumber?: string | null;
  licenseExpiry?: string | null;
  licenseCategories?: string | null;
  certifications?: string | null;
  driverStatus?: string | null;
  primaryFleetId?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Fleet {
  id: string;
  name: string;
}

export interface CustomRole {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  isSystem: boolean;
}

export const ROLE_TABS = [
  { key: "all", label: "Todos" },
  { key: "ADMIN_SISTEMA", label: "Admin Sistema" },
  { key: "ADMIN_FLOTA", label: "Admin Flota" },
  { key: "PLANIFICADOR", label: "Planificadores" },
  { key: "MONITOR", label: "Monitores" },
  { key: "CONDUCTOR", label: "Conductores" },
] as const;

export const STATUS_COLOR_CLASSES: Record<string, string> = {
  AVAILABLE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  ASSIGNED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  IN_ROUTE: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  ON_PAUSE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  COMPLETED: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  UNAVAILABLE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  ABSENT: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

// State
export interface UsersState {
  users: User[];
  fleets: Fleet[];
  roles: CustomRole[];
  isLoading: boolean;
  showForm: boolean;
  showImportDialog: boolean;
  editingUser: User | null;
  editingUserRoleIds: string[];
  activeTab: string;
  deletingId: string | null;
}

// Actions
export interface UsersActions {
  fetchUsers: () => Promise<void>;
  handleCreate: (data: CreateUserInput, selectedRoleIds: string[]) => Promise<void>;
  handleUpdate: (data: CreateUserInput, selectedRoleIds: string[]) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handleEditUser: (user: User) => Promise<void>;
  setShowForm: (show: boolean) => void;
  setShowImportDialog: (show: boolean) => void;
  setActiveTab: (tab: string) => void;
  cancelForm: () => void;
}

// Meta
export interface UsersMeta {
  authUser: { role: string } | null;
  authCompanyId: string | null;
  isAuthLoading: boolean;
  isSystemAdmin: boolean;
  effectiveCompanyId: string | null;
}

// Derived
export interface UsersDerived {
  filteredUsers: User[];
  fleetMap: Map<string, string>;
}

interface UsersContextValue {
  state: UsersState;
  actions: UsersActions;
  meta: UsersMeta;
  derived: UsersDerived;
}

const UsersContext = createContext<UsersContextValue | undefined>(undefined);

export function UsersProvider({ children }: { children: ReactNode }) {
  const {
    effectiveCompanyId,
    isSystemAdmin,
    isReady,
  } = useCompanyContext();
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingUserRoleIds, setEditingUserRoleIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!effectiveCompanyId) return;
    try {
      const url = activeTab === "all" ? "/api/users" : `/api/users?role=${activeTab}`;
      const response = await fetch(url, {
        headers: { "x-company-id": effectiveCompanyId },
      });
      const data = await response.json();
      setUsers(data.data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, effectiveCompanyId]);

  const fetchFleets = useCallback(async () => {
    if (!effectiveCompanyId) return;
    try {
      const response = await fetch("/api/fleets", {
        headers: { "x-company-id": effectiveCompanyId },
      });
      const data = await response.json();
      setFleets(data.data || []);
    } catch (error) {
      console.error("Error fetching fleets:", error);
    }
  }, [effectiveCompanyId]);

  const fetchRoles = useCallback(async () => {
    if (!effectiveCompanyId) return;
    try {
      const response = await fetch("/api/roles", {
        headers: { "x-company-id": effectiveCompanyId },
      });
      const data = await response.json();
      setRoles(data.data || []);
    } catch (error) {
      console.error("Error fetching roles:", error);
    }
  }, [effectiveCompanyId]);

  const fetchUserRoles = useCallback(
    async (userId: string) => {
      if (!effectiveCompanyId) return [];
      try {
        const response = await fetch(`/api/users/${userId}/roles`, {
          headers: { "x-company-id": effectiveCompanyId },
        });
        const data = await response.json();
        return (data.data || []).map((ur: { roleId: string }) => ur.roleId);
      } catch (error) {
        console.error("Error fetching user roles:", error);
        return [];
      }
    },
    [effectiveCompanyId]
  );

  // Fetch fleets and roles when company changes
  useEffect(() => {
    if (effectiveCompanyId) {
      fetchFleets();
      fetchRoles();
    }
  }, [effectiveCompanyId, fetchFleets, fetchRoles]);

  // Fetch users when company or tab changes
  useEffect(() => {
    if (effectiveCompanyId) {
      setIsLoading(true);
      fetchUsers();
    }
  }, [effectiveCompanyId, fetchUsers]);

  const assignRolesToUser = useCallback(
    async (userId: string, roleIds: string[], currentRoleIds: string[] = []) => {
      if (!effectiveCompanyId) return;
      const rolesToAdd = roleIds.filter((id) => !currentRoleIds.includes(id));
      const rolesToRemove = currentRoleIds.filter((id) => !roleIds.includes(id));

      for (const roleId of rolesToAdd) {
        await fetch(`/api/users/${userId}/roles`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": effectiveCompanyId,
          },
          body: JSON.stringify({
            roleId,
            isPrimary: rolesToAdd.indexOf(roleId) === 0,
          }),
        });
      }

      for (const roleId of rolesToRemove) {
        await fetch(`/api/users/${userId}/roles?roleId=${roleId}`, {
          method: "DELETE",
          headers: { "x-company-id": effectiveCompanyId },
        });
      }
    },
    [effectiveCompanyId]
  );

  const handleCreate = useCallback(
    async (data: CreateUserInput, selectedRoleIds: string[]) => {
      if (!effectiveCompanyId) return;
      try {
        const response = await fetch("/api/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": effectiveCompanyId,
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al crear usuario");
        }

        const result = await response.json();
        const userId = result.data?.id;

        if (userId && selectedRoleIds.length > 0) {
          await assignRolesToUser(userId, selectedRoleIds);
        }

        await fetchUsers();
        setShowForm(false);
        toast({
          title: "Usuario creado",
          description: `El usuario "${data.name}" ha sido creado exitosamente.`,
        });
      } catch (err) {
        toast({
          title: "Error al crear usuario",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
        throw err;
      }
    },
    [effectiveCompanyId, assignRolesToUser, fetchUsers, toast]
  );

  const handleUpdate = useCallback(
    async (data: CreateUserInput, selectedRoleIds: string[]) => {
      if (!editingUser || !effectiveCompanyId) return;

      try {
        const updateData = { ...data };
        if (!updateData.password) {
          delete (updateData as Partial<CreateUserInput>).password;
        }

        const response = await fetch(`/api/users/${editingUser.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": effectiveCompanyId,
          },
          body: JSON.stringify(updateData),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al actualizar usuario");
        }

        await assignRolesToUser(editingUser.id, selectedRoleIds, editingUserRoleIds);

        await fetchUsers();
        setEditingUser(null);
        setEditingUserRoleIds([]);
        toast({
          title: "Usuario actualizado",
          description: `El usuario "${data.name}" ha sido actualizado exitosamente.`,
        });
      } catch (err) {
        toast({
          title: "Error al actualizar usuario",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
        throw err;
      }
    },
    [editingUser, effectiveCompanyId, editingUserRoleIds, assignRolesToUser, fetchUsers, toast]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!effectiveCompanyId) return;
      setDeletingId(id);
      const user = users.find((u) => u.id === id);

      try {
        const response = await fetch(`/api/users/${id}`, {
          method: "DELETE",
          headers: { "x-company-id": effectiveCompanyId },
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || error.details || "Error al desactivar el usuario");
        }

        await fetchUsers();
        toast({
          title: "Usuario desactivado",
          description: user
            ? `El usuario "${user.name}" ha sido desactivado.`
            : "El usuario ha sido desactivado.",
        });
      } catch (err) {
        toast({
          title: "Error al desactivar usuario",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
      } finally {
        setDeletingId(null);
      }
    },
    [effectiveCompanyId, users, fetchUsers, toast]
  );

  const handleEditUser = useCallback(
    async (user: User) => {
      const userRoleIds = await fetchUserRoles(user.id);
      setEditingUserRoleIds(userRoleIds);
      setEditingUser(user);
    },
    [fetchUserRoles]
  );

  const cancelForm = useCallback(() => {
    setShowForm(false);
    setEditingUser(null);
    setEditingUserRoleIds([]);
  }, []);

  // Derived values
  const filteredUsers = users.filter((user) => {
    if (activeTab === "all") return true;
    return user.role === activeTab;
  });

  const fleetMap = new Map(fleets.map((f) => [f.id, f.name]));

  const state: UsersState = {
    users,
    fleets,
    roles,
    isLoading,
    showForm,
    showImportDialog,
    editingUser,
    editingUserRoleIds,
    activeTab,
    deletingId,
  };

  const actions: UsersActions = {
    fetchUsers,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleEditUser,
    setShowForm,
    setShowImportDialog,
    setActiveTab,
    cancelForm,
  };

  const meta: UsersMeta = {
    authUser: null,
    authCompanyId: null,
    isAuthLoading: !isReady,
    isSystemAdmin,
    effectiveCompanyId,
  };

  const derived: UsersDerived = {
    filteredUsers,
    fleetMap,
  };

  return (
    <UsersContext value={{ state, actions, meta, derived }}>
      {children}
    </UsersContext>
  );
}

export function useUsers(): UsersContextValue {
  const context = use(UsersContext);
  if (context === undefined) {
    throw new Error("useUsers must be used within a UsersProvider");
  }
  return context;
}
