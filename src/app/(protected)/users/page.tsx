"use client";

import { Building2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ProtectedPage } from "@/components/auth/protected-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserForm } from "@/components/users/user-form";
import { useAuth } from "@/hooks/use-auth";
import type { CreateUserInput } from "@/lib/validations/user";
import {
  DRIVER_STATUS_LABELS,
  isExpired,
  isExpiringSoon,
  ROLE_LABELS,
} from "@/lib/validations/user";

interface User {
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

interface Fleet {
  id: string;
  name: string;
}

interface CustomRole {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  isSystem: boolean;
}

interface Company {
  id: string;
  legalName: string;
  commercialName: string;
  active: boolean;
}

const ROLE_TABS = [
  { key: "all", label: "Todos" },
  { key: "ADMIN_SISTEMA", label: "Admin Sistema" },
  { key: "ADMIN_FLOTA", label: "Admin Flota" },
  { key: "PLANIFICADOR", label: "Planificadores" },
  { key: "MONITOR", label: "Monitores" },
  { key: "CONDUCTOR", label: "Conductores" },
];

const STATUS_COLOR_CLASSES: Record<string, string> = {
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

const getLicenseStatusColor = (expiryDate: string | null | undefined) => {
  if (!expiryDate) return "text-muted-foreground";
  if (isExpired(expiryDate)) return "text-destructive";
  if (isExpiringSoon(expiryDate)) return "text-orange-500";
  return "text-muted-foreground";
};

const getLicenseStatusLabel = (expiryDate: string | null | undefined) => {
  if (!expiryDate) return "-";
  if (isExpired(expiryDate)) return "Vencida";
  if (isExpiringSoon(expiryDate)) return "Pronto a vencer";
  return new Date(expiryDate).toLocaleDateString();
};

function UsersPageContent() {
  const { user: authUser, companyId: authCompanyId, isLoading: isAuthLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingUserRoleIds, setEditingUserRoleIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  // Check if user is system admin (can manage users across companies)
  const isSystemAdmin = authUser?.role === "ADMIN_SISTEMA";

  // Use selected company for system admins, otherwise use auth company
  const effectiveCompanyId = isSystemAdmin && selectedCompanyId ? selectedCompanyId : authCompanyId;

  const fetchUsers = useCallback(async () => {
    if (!effectiveCompanyId) return;
    try {
      const url =
        activeTab === "all" ? "/api/users" : `/api/users?role=${activeTab}`;
      const response = await fetch(url, {
        headers: {
          "x-company-id": effectiveCompanyId,
        },
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
        headers: {
          "x-company-id": effectiveCompanyId,
        },
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
        headers: {
          "x-company-id": effectiveCompanyId,
        },
      });
      const data = await response.json();
      setRoles(data.data || []);
    } catch (error) {
      console.error("Error fetching roles:", error);
    }
  }, [effectiveCompanyId]);

  // Fetch companies (only for system admins)
  const fetchCompanies = useCallback(async () => {
    if (!isSystemAdmin) return; // Only fetch for system admins
    try {
      const response = await fetch("/api/companies?active=true", {
        credentials: "include", // Use cookie auth instead of company header
      });
      const data = await response.json();
      setCompanies(data.data || []);
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  }, [isSystemAdmin]);

  const fetchUserRoles = useCallback(async (userId: string) => {
    if (!effectiveCompanyId) return [];
    try {
      const response = await fetch(`/api/users/${userId}/roles`, {
        headers: {
          "x-company-id": effectiveCompanyId,
        },
      });
      const data = await response.json();
      return (data.data || []).map((ur: { roleId: string }) => ur.roleId);
    } catch (error) {
      console.error("Error fetching user roles:", error);
      return [];
    }
  }, [effectiveCompanyId]);

  // Fetch companies for system admins
  useEffect(() => {
    if (isSystemAdmin) {
      fetchCompanies();
    }
  }, [isSystemAdmin, fetchCompanies]);

  // Auto-select first company for system admins when companies load
  useEffect(() => {
    if (isSystemAdmin && !authCompanyId && !selectedCompanyId && companies.length > 0) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [isSystemAdmin, authCompanyId, selectedCompanyId, companies]);

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

  const assignRolesToUser = async (userId: string, roleIds: string[], currentRoleIds: string[] = []) => {
    if (!effectiveCompanyId) return;
    // Roles to add
    const rolesToAdd = roleIds.filter(id => !currentRoleIds.includes(id));
    // Roles to remove
    const rolesToRemove = currentRoleIds.filter(id => !roleIds.includes(id));

    // Add new roles
    for (const roleId of rolesToAdd) {
      await fetch(`/api/users/${userId}/roles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": effectiveCompanyId,
        },
        body: JSON.stringify({ roleId, isPrimary: rolesToAdd.indexOf(roleId) === 0 }),
      });
    }

    // Remove roles
    for (const roleId of rolesToRemove) {
      await fetch(`/api/users/${userId}/roles?roleId=${roleId}`, {
        method: "DELETE",
        headers: {
          "x-company-id": effectiveCompanyId,
        },
      });
    }
  };

  const handleCreate = async (data: CreateUserInput, selectedRoleIds: string[]) => {
    if (!effectiveCompanyId) return;
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
      throw error;
    }

    const result = await response.json();
    const userId = result.data?.id;

    // Assign roles if any selected
    if (userId && selectedRoleIds.length > 0) {
      await assignRolesToUser(userId, selectedRoleIds);
    }

    await fetchUsers();
    setShowForm(false);
  };

  const handleUpdate = async (data: CreateUserInput, selectedRoleIds: string[]) => {
    if (!editingUser || !effectiveCompanyId) return;

    // Remove password from update if empty
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
      throw error;
    }

    // Update roles
    await assignRolesToUser(editingUser.id, selectedRoleIds, editingUserRoleIds);

    await fetchUsers();
    setEditingUser(null);
    setEditingUserRoleIds([]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de desactivar este usuario?")) return;
    if (!effectiveCompanyId) return;

    const response = await fetch(`/api/users/${id}`, {
      method: "DELETE",
      headers: {
        "x-company-id": effectiveCompanyId,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || error.details || "Error al desactivar el usuario");
      return;
    }

    await fetchUsers();
  };

  // Create Map for O(1) lookups - React Compiler handles memoization
  const fleetMap = new Map(fleets.map((f) => [f.id, f.name]));

  const _getFleetName = (fleetId: string | null | undefined) => {
    if (!fleetId) return "-";
    return fleetMap.get(fleetId) || "Desconocida";
  };

  const handleEditUser = async (user: User) => {
    const userRoleIds = await fetchUserRoles(user.id);
    setEditingUserRoleIds(userRoleIds);
    setEditingUser(user);
  };

  const filteredUsers = users.filter((user) => {
    if (activeTab === "all") return true;
    return user.role === activeTab;
  });

  // Show loading state while auth is loading
  // Allow ADMIN_SISTEMA to proceed without authCompanyId (they can select a company)
  if (isAuthLoading || (!authCompanyId && !isSystemAdmin)) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (showForm || editingUser) {
    const handleCancel = () => {
      setShowForm(false);
      setEditingUser(null);
      setEditingUserRoleIds([]);
    };

    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {editingUser ? "Editar Usuario" : "Nuevo Usuario"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {editingUser
              ? "Actualice la información del usuario"
              : "Complete el formulario para crear un nuevo usuario"}
          </p>
        </div>
        <UserForm
          onSubmit={editingUser ? handleUpdate : handleCreate}
          onCancel={handleCancel}
          initialData={
            editingUser
              ? {
                  name: editingUser.name,
                  email: editingUser.email,
                  username: editingUser.username,
                  role: editingUser.role as CreateUserInput["role"],
                  phone: editingUser.phone,
                  identification: editingUser.identification,
                  birthDate: editingUser.birthDate,
                  photo: editingUser.photo,
                  licenseNumber: editingUser.licenseNumber,
                  licenseExpiry: editingUser.licenseExpiry,
                  licenseCategories: editingUser.licenseCategories,
                  certifications: editingUser.certifications,
                  driverStatus:
                    editingUser.driverStatus as CreateUserInput["driverStatus"],
                  primaryFleetId: editingUser.primaryFleetId,
                  active: editingUser.active,
                }
              : undefined
          }
          fleets={fleets}
          roles={roles}
          initialRoleIds={editingUserRoleIds}
          submitLabel={editingUser ? "Actualizar" : "Crear"}
          isEditing={!!editingUser}
          companyId={effectiveCompanyId ?? undefined}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Gestión de Usuarios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administre los usuarios del sistema
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>Nuevo Usuario</Button>
      </div>

      {/* Company selector for system admins */}
      {isSystemAdmin && companies.length > 0 && (
        <Card>
          <CardContent className="flex items-center gap-4 py-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span className="text-sm font-medium">Empresa:</span>
            </div>
            <Select
              value={selectedCompanyId || authCompanyId || ""}
              onValueChange={(value) => setSelectedCompanyId(value || null)}
            >
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Seleccionar empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.commercialName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCompanyId && selectedCompanyId !== authCompanyId && (
              <Badge variant="secondary" className="text-xs">
                Viendo otra empresa
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Role Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          {ROLE_TABS.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
          <p className="text-muted-foreground">
            No hay usuarios registrados. Cree el primer usuario.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Nombre
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Usuario
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Contacto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Rol
                  </th>
                  {(activeTab === "all" || activeTab === "CONDUCTOR") && (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Licencia
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Vencimiento
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Estado
                      </th>
                    </>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Activo
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-foreground">
                      {user.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                      @{user.username}
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">
                      <div>{user.email}</div>
                      {user.phone && (
                        <div className="text-xs">{user.phone}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold">
                        {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ||
                          user.role}
                      </span>
                    </td>
                    {(activeTab === "all" || activeTab === "CONDUCTOR") && (
                      <>
                        <td className="px-4 py-4 text-sm text-muted-foreground">
                          {user.role === "CONDUCTOR" ? (
                            <>
                              <div>{user.licenseNumber || "-"}</div>
                              {user.licenseCategories && (
                                <div className="text-xs">
                                  {user.licenseCategories}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm">
                          {user.role === "CONDUCTOR" ? (
                            <span
                              className={getLicenseStatusColor(
                                user.licenseExpiry,
                              )}
                            >
                              {getLicenseStatusLabel(user.licenseExpiry)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          {user.role === "CONDUCTOR" && user.driverStatus ? (
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                STATUS_COLOR_CLASSES[user.driverStatus] ||
                                "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {DRIVER_STATUS_LABELS[
                                user.driverStatus as keyof typeof DRIVER_STATUS_LABELS
                              ] || user.driverStatus}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </td>
                      </>
                    )}
                    <td className="whitespace-nowrap px-4 py-4 text-sm">
                      {user.active ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                      <button
                        type="button"
                        onClick={() => handleEditUser(user)}
                        className="text-muted-foreground hover:text-foreground mr-4 transition-colors"
                      >
                        Editar
                      </button>
                      {user.active && (
                        <button
                          type="button"
                          onClick={() => handleDelete(user.id)}
                          className="text-destructive hover:text-destructive/80 transition-colors"
                        >
                          Desactivar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UsersPage() {
  return (
    <ProtectedPage requiredPermission="users:VIEW">
      <UsersPageContent />
    </ProtectedPage>
  );
}
