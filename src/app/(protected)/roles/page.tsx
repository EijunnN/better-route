"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ProtectedPage } from "@/components/auth/protected-page";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface Role {
  id: string;
  name: string;
  description: string | null;
  code: string | null;
  isSystem: boolean;
  active: boolean;
  enabledPermissionsCount: number;
  createdAt: string;
}

interface Permission {
  id: string;
  entity: string;
  action: string;
  name: string;
  description: string | null;
  enabled: boolean;
}

interface GroupedPermissions {
  [category: string]: Permission[];
}

interface RolePermissionsResponse {
  roleId: string;
  roleName: string;
  isSystem: boolean;
  permissions: GroupedPermissions;
}

const CATEGORY_LABELS: Record<string, string> = {
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

function RolesPageContent() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [rolePermissions, setRolePermissions] =
    useState<RolePermissionsResponse | null>(null);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [savingPermission, setSavingPermission] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const [formError, setFormError] = useState("");

  const fetchRoles = useCallback(async () => {
    try {
      const response = await fetch("/api/roles");
      const data = await response.json();
      setRoles(data.data || []);
    } catch (error) {
      console.error("Error fetching roles:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchRolePermissions = useCallback(async (roleId: string) => {
    setIsLoadingPermissions(true);
    try {
      const response = await fetch(`/api/roles/${roleId}/permissions`);
      const data = await response.json();
      setRolePermissions(data);
    } catch (error) {
      console.error("Error fetching role permissions:", error);
    } finally {
      setIsLoadingPermissions(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  useEffect(() => {
    if (selectedRole) {
      fetchRolePermissions(selectedRole.id);
    } else {
      setRolePermissions(null);
    }
  }, [selectedRole, fetchRolePermissions]);

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formData.name.trim()) {
      setFormError("El nombre del rol es requerido");
      return;
    }

    try {
      const response = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al crear el rol");
      }

      await fetchRoles();
      setShowForm(false);
      setFormData({ name: "", description: "" });
      toast({
        title: "Rol creado",
        description: `El rol "${formData.name}" ha sido creado exitosamente.`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error al crear el rol";
      setFormError(errorMessage);
      toast({
        title: "Error al crear rol",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleDeleteRole = async (id: string) => {
    setDeletingId(id);
    const role = roles.find((r) => r.id === id);

    try {
      const response = await fetch(`/api/roles/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al eliminar el rol");
      }

      if (selectedRole?.id === id) {
        setSelectedRole(null);
      }
      await fetchRoles();
      toast({
        title: "Rol eliminado",
        description: role
          ? `El rol "${role.name}" ha sido eliminado.`
          : "El rol ha sido eliminado.",
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
  };

  const handleTogglePermission = async (
    permissionId: string,
    enabled: boolean,
  ) => {
    if (!selectedRole || selectedRole.isSystem) return;

    setSavingPermission(permissionId);

    try {
      const response = await fetch(
        `/api/roles/${selectedRole.id}/permissions`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissionId, enabled }),
        },
      );

      if (response.ok) {
        // Update local state
        setRolePermissions((prev) => {
          if (!prev) return prev;
          const updated = { ...prev };
          for (const category in updated.permissions) {
            updated.permissions[category] = updated.permissions[category].map(
              (p) => (p.id === permissionId ? { ...p, enabled } : p),
            );
          }
          return updated;
        });

        // Update role count in list
        setRoles((prev) =>
          prev.map((r) =>
            r.id === selectedRole.id
              ? {
                  ...r,
                  enabledPermissionsCount:
                    r.enabledPermissionsCount + (enabled ? 1 : -1),
                }
              : r,
          ),
        );
      }
    } catch (error) {
      console.error("Error toggling permission:", error);
    } finally {
      setSavingPermission(null);
    }
  };

  const handleToggleAllInCategory = async (
    category: string,
    enable: boolean,
  ) => {
    if (!selectedRole || !rolePermissions || selectedRole.isSystem) return;

    const permsInCategory = rolePermissions.permissions[category] || [];
    const updates = permsInCategory
      .filter((p) => p.enabled !== enable)
      .map((p) => ({ permissionId: p.id, enabled: enable }));

    if (updates.length === 0) return;

    try {
      const response = await fetch(
        `/api/roles/${selectedRole.id}/permissions`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permissions: updates }),
        },
      );

      if (response.ok) {
        // Refresh permissions
        await fetchRolePermissions(selectedRole.id);
        await fetchRoles();
      }
    } catch (error) {
      console.error("Error toggling category permissions:", error);
    }
  };

  if (showForm) {
    return (
      <div className="max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nuevo Rol</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cree un nuevo rol personalizado para su empresa
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <form onSubmit={handleCreateRole} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Nombre del Rol *
              </label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Ej: Supervisor de Entregas"
              />
            </div>
            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Descripción
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Descripción opcional del rol..."
              />
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            <div className="flex gap-3">
              <Button type="submit">Crear Rol</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setFormData({ name: "", description: "" });
                  setFormError("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Gestión de Roles
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure roles y permisos personalizados para su empresa
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>Nuevo Rol</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roles List */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-semibold text-foreground">Roles</h2>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
              </div>
            ) : roles.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No hay roles configurados
              </div>
            ) : (
              <div className="divide-y divide-border">
                {roles.map((role) => (
                  <div
                    key={role.id}
                    className={`p-4 cursor-pointer transition-colors hover:bg-muted/50 ${
                      selectedRole?.id === role.id ? "bg-muted" : ""
                    }`}
                    onClick={() => setSelectedRole(role)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && setSelectedRole(role)
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">
                            {role.name}
                          </span>
                          {role.isSystem && (
                            <span className="text-xs bg-muted px-2 py-0.5 rounded">
                              Sistema
                            </span>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {role.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {role.enabledPermissionsCount} permisos activos
                        </p>
                      </div>
                      {!role.isSystem && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={deletingId === role.id}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {deletingId === role.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                ¿Eliminar rol?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción eliminará el rol{" "}
                                <strong>{role.name}</strong>. Los usuarios con
                                este rol perderán los permisos asociados.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteRole(role.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Permissions Panel */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-semibold text-foreground">
                {selectedRole
                  ? `Permisos: ${selectedRole.name}`
                  : "Seleccione un rol"}
              </h2>
              {selectedRole?.isSystem && (
                <p className="text-xs text-muted-foreground mt-1">
                  Los roles del sistema no pueden ser modificados
                </p>
              )}
            </div>

            {!selectedRole ? (
              <div className="p-8 text-center text-muted-foreground">
                Seleccione un rol de la lista para ver y editar sus permisos
              </div>
            ) : isLoadingPermissions ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
              </div>
            ) : rolePermissions ? (
              <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
                {Object.entries(rolePermissions.permissions).map(
                  ([category, perms]) => (
                    <div key={category} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-foreground">
                          {CATEGORY_LABELS[category] || category}
                        </h3>
                        {!selectedRole.isSystem && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleAllInCategory(category, true)
                              }
                              className="text-xs text-primary hover:underline"
                            >
                              Activar todos
                            </button>
                            <span className="text-muted-foreground">|</span>
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleAllInCategory(category, false)
                              }
                              className="text-xs text-muted-foreground hover:underline"
                            >
                              Desactivar todos
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        {perms.map((perm) => (
                          <div
                            key={perm.id}
                            className="flex items-center justify-between py-1"
                          >
                            <div>
                              <span className="text-sm text-foreground">
                                {perm.name}
                              </span>
                              {perm.description && (
                                <p className="text-xs text-muted-foreground">
                                  {perm.description}
                                </p>
                              )}
                            </div>
                            <Switch
                              checked={perm.enabled}
                              onCheckedChange={(checked) =>
                                handleTogglePermission(perm.id, checked)
                              }
                              disabled={
                                selectedRole.isSystem ||
                                savingPermission === perm.id
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ),
                )}
                {Object.keys(rolePermissions.permissions).length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    No hay permisos configurados en el sistema.
                    <br />
                    Ejecute la migración para crear los permisos base.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// Wrap with permission protection
export default function RolesPage() {
  return (
    <ProtectedPage requiredPermission="roles:VIEW">
      <RolesPageContent />
    </ProtectedPage>
  );
}
