"use client";

import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useFleetList, useRoleList, useUserList } from "@/hooks/queries";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useCompanyContext } from "@/hooks/use-company-context";
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
  AVAILABLE:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  ASSIGNED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  IN_ROUTE:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  ON_PAUSE:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  COMPLETED: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  UNAVAILABLE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  ABSENT:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

// State
export interface UsersState {
  users: User[];
  fleets: Fleet[];
  roles: CustomRole[];
  isLoading: boolean;
  error: string | null;
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
  handleCreate: (
    data: CreateUserInput,
    selectedRoleIds: string[],
  ) => Promise<void>;
  handleUpdate: (
    data: CreateUserInput,
    selectedRoleIds: string[],
  ) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handleEditUser: (user: User) => Promise<void>;
  setShowForm: (show: boolean) => void;
  setShowImportDialog: (show: boolean) => void;
  setActiveTab: (tab: string) => void;
  cancelForm: () => void;
}

// Meta
export interface UsersMeta {
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
  const { effectiveCompanyId, isSystemAdmin, isReady } = useCompanyContext();

  const [activeTab, setActiveTab] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingUserRoleIds, setEditingUserRoleIds] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    data: users = [],
    isLoading,
    error: usersError,
    mutate: mutateUsers,
  } = useUserList(activeTab === "all" ? undefined : { role: activeTab });

  const { data: rawFleets = [], mutate: mutateFleets } = useFleetList();
  const { data: roles = [], mutate: mutateRoles } = useRoleList();

  const fleets = useMemo<Fleet[]>(
    () => rawFleets.map((f) => ({ id: f.id, name: f.name })),
    [rawFleets],
  );

  const error = usersError
    ? usersError instanceof Error
      ? usersError.message
      : "Error al cargar usuarios"
    : null;

  const refetch = useCallback(async () => {
    await Promise.all([mutateUsers(), mutateFleets(), mutateRoles()]);
  }, [mutateUsers, mutateFleets, mutateRoles]);
  const apiMutate = useApiMutation(mutateUsers);

  const fetchUserRoles = async (userId: string) => {
    if (!effectiveCompanyId) return [];
    try {
      const response = await fetch(`/api/users/${userId}/roles`, {
        headers: { "x-company-id": effectiveCompanyId },
      });
      const data = await response.json();
      return (data.data || []).map((ur: { roleId: string }) => ur.roleId);
    } catch {
      return [];
    }
  };

  /** Best-effort, as before: a failed role assignment never blocks the save. */
  const assignRolesToUser = async (
    userId: string,
    roleIds: string[],
    currentRoleIds: string[] = [],
  ) => {
    const currentSet = new Set(currentRoleIds);
    const desiredSet = new Set(roleIds);
    const rolesToAdd = roleIds.filter((id) => !currentSet.has(id));
    const rolesToRemove = currentRoleIds.filter((id) => !desiredSet.has(id));

    await Promise.all(
      rolesToAdd.map((roleId, idx) =>
        apiMutate(`/api/users/${userId}/roles`, {
          body: { roleId, isPrimary: idx === 0 },
          revalidate: null,
          rethrow: false,
        }),
      ),
    );

    await Promise.all(
      rolesToRemove.map((roleId) =>
        apiMutate(`/api/users/${userId}/roles?roleId=${roleId}`, {
          method: "DELETE",
          revalidate: null,
          rethrow: false,
        }),
      ),
    );
  };

  const handleCreate = async (
    data: CreateUserInput,
    selectedRoleIds: string[],
  ) => {
    const result = await apiMutate<{ data?: { id?: string } }>("/api/users", {
      body: data,
      errorTitle: "Error al crear usuario",
      revalidate: null,
      success: {
        title: "Usuario creado",
        description: `El usuario "${data.name}" ha sido creado exitosamente.`,
      },
    });

    const userId = result?.data?.id;
    if (userId && selectedRoleIds.length > 0) {
      await assignRolesToUser(userId, selectedRoleIds);
    }

    await mutateUsers();
    setShowForm(false);
  };

  const handleUpdate = async (
    data: CreateUserInput,
    selectedRoleIds: string[],
  ) => {
    if (!editingUser) return;

    const updateData = { ...data };
    if (!updateData.password) {
      delete (updateData as Partial<CreateUserInput>).password;
    }

    await apiMutate(`/api/users/${editingUser.id}`, {
      method: "PUT",
      body: updateData,
      errorTitle: "Error al actualizar usuario",
      revalidate: null,
      success: {
        title: "Usuario actualizado",
        description: `El usuario "${data.name}" ha sido actualizado exitosamente.`,
      },
    });

    await assignRolesToUser(
      editingUser.id,
      selectedRoleIds,
      editingUserRoleIds,
    );

    await mutateUsers();
    setEditingUser(null);
    setEditingUserRoleIds([]);
  };

  const handleDelete = async (id: string) => {
    const user = users.find((u) => u.id === id);
    setDeletingId(id);
    await apiMutate(`/api/users/${id}`, {
      method: "DELETE",
      rethrow: false,
      errorTitle: "Error al desactivar usuario",
      success: {
        title: "Usuario desactivado",
        description: user
          ? `El usuario "${user.name}" ha sido desactivado.`
          : "El usuario ha sido desactivado.",
      },
    });
    setDeletingId(null);
  };

  const handleEditUser = async (user: User) => {
    const userRoleIds = await fetchUserRoles(user.id);
    setEditingUserRoleIds(userRoleIds);
    setEditingUser(user);
  };

  const openForm = (show: boolean) => {
    setShowForm(show);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingUser(null);
    setEditingUserRoleIds([]);
  };

  // Derived values. The query already filters by role server-side; we keep the
  // client filter too so behavior is identical to before (a user could carry a
  // role that differs from the server's role filter).
  const filteredUsers = useMemo(
    () =>
      users.filter((user) => activeTab === "all" || user.role === activeTab),
    [users, activeTab],
  );

  const fleetMap = useMemo(
    () => new Map(fleets.map((f) => [f.id, f.name])),
    [fleets],
  );

  const state: UsersState = {
    users,
    fleets,
    roles,
    isLoading,
    error,
    showForm,
    showImportDialog,
    editingUser,
    editingUserRoleIds,
    activeTab,
    deletingId,
  };

  const actions: UsersActions = {
    fetchUsers: refetch,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleEditUser,
    setShowForm: openForm,
    setShowImportDialog,
    setActiveTab,
    cancelForm,
  };

  const meta: UsersMeta = {
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
