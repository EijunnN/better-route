"use client";

import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";

export interface Role {
  id: string;
  name: string;
  description: string | null;
  code: string | null;
  isSystem: boolean;
  active: boolean;
  enabledPermissionsCount: number;
  createdAt: string;
}

export interface Permission {
  id: string;
  entity: string;
  action: string;
  name: string;
  description: string | null;
  enabled: boolean;
}

export interface GroupedPermissions {
  [category: string]: Permission[];
}

export interface RolePermissionsResponse {
  roleId: string;
  roleName: string;
  isSystem: boolean;
  permissions: GroupedPermissions;
}

export const CATEGORY_LABELS: Record<string, string> = {
  ORDERS: "Pedidos",
  VEHICLES: "Vehículos",
  DRIVERS: "Conductores",
  FLEETS: "Flotas",
  ROUTES: "Rutas",
  OPTIMIZATION: "Optimización",
  ALERTS: "Alertas",
  USERS: "Usuarios",
  SETTINGS: "Configuración",
  REPORTS: "Reportes",
};

export interface RolesState {
  roles: Role[];
  isLoading: boolean;
  showForm: boolean;
  selectedRole: Role | null;
  rolePermissions: RolePermissionsResponse | null;
  isLoadingPermissions: boolean;
  savingPermission: string | null;
  deletingId: string | null;
  formData: { name: string; description: string };
  formError: string;
}

export interface RolesActions {
  fetchRoles: () => Promise<void>;
  handleCreateRole: (e: React.FormEvent) => Promise<void>;
  handleDeleteRole: (id: string) => Promise<void>;
  handleTogglePermission: (permissionId: string, enabled: boolean) => Promise<void>;
  handleToggleAllInCategory: (category: string, enable: boolean) => Promise<void>;
  setShowForm: (show: boolean) => void;
  setSelectedRole: (role: Role | null) => void;
  setFormData: (data: { name: string; description: string }) => void;
  resetForm: () => void;
}

export interface RolesMeta {
  authUser: { role: string } | null;
  authCompanyId: string | null;
  isAuthLoading: boolean;
  isSystemAdmin: boolean;
  effectiveCompanyId: string | null;
}

interface RolesContextValue {
  state: RolesState;
  actions: RolesActions;
  meta: RolesMeta;
}

const RolesContext = createContext<RolesContextValue | undefined>(undefined);

export function RolesProvider({ children }: { children: ReactNode }) {
  const {
    effectiveCompanyId,
    isSystemAdmin,
    isReady,
  } = useCompanyContext();
  const { toast } = useToast();

  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [rolePermissions, setRolePermissions] = useState<RolePermissionsResponse | null>(null);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [savingPermission, setSavingPermission] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [formError, setFormError] = useState("");

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
    } finally {
      setIsLoading(false);
    }
  }, [effectiveCompanyId]);

  const fetchRolePermissions = useCallback(
    async (roleId: string) => {
      if (!effectiveCompanyId) return;
      setIsLoadingPermissions(true);
      try {
        const response = await fetch(`/api/roles/${roleId}/permissions`, {
          headers: { "x-company-id": effectiveCompanyId },
        });
        const data = await response.json();
        setRolePermissions(data);
      } catch (error) {
        console.error("Error fetching role permissions:", error);
      } finally {
        setIsLoadingPermissions(false);
      }
    },
    [effectiveCompanyId]
  );

  useEffect(() => {
    if (effectiveCompanyId) {
      setIsLoading(true);
      setSelectedRole(null);
      setRolePermissions(null);
      fetchRoles();
    }
  }, [effectiveCompanyId, fetchRoles]);

  useEffect(() => {
    if (selectedRole) {
      fetchRolePermissions(selectedRole.id);
    } else {
      setRolePermissions(null);
    }
  }, [selectedRole, fetchRolePermissions]);

  const handleCreateRole = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError("");
      if (!formData.name.trim()) {
        setFormError("El nombre del rol es requerido");
        return;
      }
      if (!effectiveCompanyId) {
        setFormError("Debe seleccionar una empresa primero");
        return;
      }
      try {
        const response = await fetch("/api/roles", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": effectiveCompanyId,
          },
          body: JSON.stringify(formData),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al crear el rol");
        }
        await fetchRoles();
        setShowForm(false);
        setFormData({ name: "", description: "" });
        toast({ title: "Rol creado", description: `El rol "${formData.name}" ha sido creado exitosamente.` });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Error al crear el rol";
        setFormError(errorMessage);
        toast({ title: "Error al crear rol", description: errorMessage, variant: "destructive" });
      }
    },
    [formData, effectiveCompanyId, fetchRoles, toast]
  );

  const handleDeleteRole = useCallback(
    async (id: string) => {
      if (!effectiveCompanyId) return;
      setDeletingId(id);
      const role = roles.find((r) => r.id === id);
      try {
        const response = await fetch(`/api/roles/${id}`, {
          method: "DELETE",
          headers: { "x-company-id": effectiveCompanyId },
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al eliminar el rol");
        }
        if (selectedRole?.id === id) setSelectedRole(null);
        await fetchRoles();
        toast({
          title: "Rol eliminado",
          description: role ? `El rol "${role.name}" ha sido eliminado.` : "El rol ha sido eliminado.",
        });
      } catch (err) {
        toast({
          title: "Error al eliminar rol",
          description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
          variant: "destructive",
        });
      } finally {
        setDeletingId(null);
      }
    },
    [effectiveCompanyId, roles, selectedRole, fetchRoles, toast]
  );

  const handleTogglePermission = useCallback(
    async (permissionId: string, enabled: boolean) => {
      if (!selectedRole || selectedRole.isSystem || !effectiveCompanyId) return;
      setSavingPermission(permissionId);
      try {
        const response = await fetch(`/api/roles/${selectedRole.id}/permissions`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": effectiveCompanyId,
          },
          body: JSON.stringify({ permissionId, enabled }),
        });
        if (response.ok) {
          setRolePermissions((prev) => {
            if (!prev) return prev;
            const updated = { ...prev };
            for (const category in updated.permissions) {
              updated.permissions[category] = updated.permissions[category].map((p) =>
                p.id === permissionId ? { ...p, enabled } : p
              );
            }
            return updated;
          });
          setRoles((prev) =>
            prev.map((r) =>
              r.id === selectedRole.id
                ? { ...r, enabledPermissionsCount: r.enabledPermissionsCount + (enabled ? 1 : -1) }
                : r
            )
          );
        }
      } catch (error) {
        console.error("Error toggling permission:", error);
      } finally {
        setSavingPermission(null);
      }
    },
    [selectedRole, effectiveCompanyId]
  );

  const handleToggleAllInCategory = useCallback(
    async (category: string, enable: boolean) => {
      if (!selectedRole || !rolePermissions || selectedRole.isSystem || !effectiveCompanyId) return;
      const permsInCategory = rolePermissions.permissions[category] || [];
      const updates = permsInCategory.filter((p) => p.enabled !== enable).map((p) => ({ permissionId: p.id, enabled: enable }));
      if (updates.length === 0) return;

      const permissionIdsToUpdate = new Set(updates.map((u) => u.permissionId));
      setRolePermissions((prev) => {
        if (!prev) return prev;
        const updated = { ...prev };
        updated.permissions = { ...updated.permissions };
        updated.permissions[category] = updated.permissions[category].map((p) =>
          permissionIdsToUpdate.has(p.id) ? { ...p, enabled: enable } : p
        );
        return updated;
      });

      const countDelta = enable ? updates.length : -updates.length;
      setRoles((prev) =>
        prev.map((r) =>
          r.id === selectedRole.id ? { ...r, enabledPermissionsCount: r.enabledPermissionsCount + countDelta } : r
        )
      );

      try {
        const response = await fetch(`/api/roles/${selectedRole.id}/permissions`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": effectiveCompanyId,
          },
          body: JSON.stringify({ permissions: updates }),
        });
        if (!response.ok) {
          await fetchRolePermissions(selectedRole.id);
          await fetchRoles();
        }
      } catch (error) {
        console.error("Error toggling category permissions:", error);
        await fetchRolePermissions(selectedRole.id);
        await fetchRoles();
      }
    },
    [selectedRole, rolePermissions, effectiveCompanyId, fetchRolePermissions, fetchRoles]
  );

  const resetForm = useCallback(() => {
    setShowForm(false);
    setFormData({ name: "", description: "" });
    setFormError("");
  }, []);

  const state: RolesState = {
    roles,
    isLoading,
    showForm,
    selectedRole,
    rolePermissions,
    isLoadingPermissions,
    savingPermission,
    deletingId,
    formData,
    formError,
  };

  const actions: RolesActions = {
    fetchRoles,
    handleCreateRole,
    handleDeleteRole,
    handleTogglePermission,
    handleToggleAllInCategory,
    setShowForm,
    setSelectedRole,
    setFormData,
    resetForm,
  };

  const meta: RolesMeta = { authUser: null, authCompanyId: null, isAuthLoading: !isReady, isSystemAdmin, effectiveCompanyId };

  return <RolesContext value={{ state, actions, meta }}>{children}</RolesContext>;
}

export function useRoles(): RolesContextValue {
  const context = use(RolesContext);
  if (context === undefined) {
    throw new Error("useRoles must be used within a RolesProvider");
  }
  return context;
}
