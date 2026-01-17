"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProtectedPage } from "@/components/auth/protected-page";
import { useCompanyContext } from "@/hooks/use-company-context";
import { CompanySelector } from "@/components/company-selector";
import { Button } from "@/components/ui/button";
import { UserSkillForm } from "@/components/user-skills/user-skill-form";
import type { UserSkillInput } from "@/lib/validations/user-skill";

interface UserSkill {
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
  user: {
    id: string;
    name: string;
    identification: string | null;
  };
  expiryStatus?: string;
}

interface User {
  id: string;
  name: string;
  identification: string | null;
  role: string;
}

interface VehicleSkill {
  id: string;
  code: string;
  name: string;
  category: string;
  description?: string;
  active: boolean;
}

const VEHICLE_SKILL_CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: "Equipamiento",
  TEMPERATURE: "Temperatura",
  CERTIFICATIONS: "Certificaciones",
  SPECIAL: "Especiales",
};

const EXPIRY_STATUS_LABELS: Record<string, string> = {
  valid: "Vigente",
  expiring_soon: "Pronto a vencer",
  expired: "Vencida",
};

const _getExpiryStatusColor = (status: string) => {
  switch (status) {
    case "expired":
      return "bg-destructive/10 text-destructive";
    case "expiring_soon":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    default:
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  }
};

const getCategoryColor = (category: string) => {
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

function UserSkillsPageContent() {
  const {
    effectiveCompanyId: companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  } = useCompanyContext();
  const [userSkills, setUserSkills] = useState<UserSkill[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [skills, setSkills] = useState<VehicleSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUserSkill, setEditingUserSkill] = useState<UserSkill | null>(
    null,
  );
  const [filterUser, setFilterUser] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterExpiry, setFilterExpiry] = useState<string>("");

  const fetchUserSkills = useCallback(async () => {
    if (!companyId) return;
    try {
      const params = new URLSearchParams();
      if (filterUser) params.append("userId", filterUser);
      if (filterStatus) params.append("active", filterStatus);
      if (filterExpiry) params.append("status", filterExpiry);

      const response = await fetch(`/api/user-skills?${params.toString()}`, {
        headers: {
          "x-company-id": companyId ?? "",
        },
      });
      const data = await response.json();
      setUserSkills(data.data || []);
    } catch (error) {
      console.error("Error fetching user skills:", error);
    } finally {
      setIsLoading(false);
    }
  }, [companyId, filterUser, filterStatus, filterExpiry]);

  const fetchUsers = useCallback(async () => {
    if (!companyId) return;
    try {
      // Fetch users with role CONDUCTOR
      const response = await fetch("/api/users?active=true", {
        headers: {
          "x-company-id": companyId ?? "",
        },
      });
      const data = await response.json();
      // Filter to only show conductors
      const conductors = (data.data || []).filter(
        (u: User) => u.role === "CONDUCTOR",
      );
      setUsers(conductors);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  }, [companyId]);

  const fetchSkills = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/vehicle-skills?active=true", {
        headers: {
          "x-company-id": companyId ?? "",
        },
      });
      const data = await response.json();
      setSkills(data.data || []);
    } catch (error) {
      console.error("Error fetching vehicle skills:", error);
    }
  }, [companyId]);

  useEffect(() => {
    fetchUserSkills();
    fetchUsers();
    fetchSkills();
  }, [fetchUserSkills, fetchUsers, fetchSkills]);

  const handleCreate = async (data: UserSkillInput) => {
    const response = await fetch("/api/user-skills", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": companyId ?? "",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    await fetchUserSkills();
    setShowForm(false);
  };

  const handleUpdate = async (data: UserSkillInput) => {
    if (!editingUserSkill) return;

    const response = await fetch(`/api/user-skills/${editingUserSkill.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": companyId ?? "",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    await fetchUserSkills();
    setEditingUserSkill(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Esta seguro de desactivar esta habilidad del usuario?"))
      return;

    const response = await fetch(`/api/user-skills/${id}`, {
      method: "DELETE",
      headers: {
        "x-company-id": companyId ?? "",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || error.details || "Error al desactivar la habilidad");
      return;
    }

    await fetchUserSkills();
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const response = await fetch(`/api/user-skills/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": companyId ?? "",
      },
      body: JSON.stringify({ active: !currentActive }),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || error.details || "Error al actualizar el estado");
      return;
    }

    await fetchUserSkills();
  };

  // Filter by category (client-side)
  const filteredUserSkills = useMemo(() => {
    if (!filterCategory) return userSkills;
    return userSkills.filter((us) => us.skill.category === filterCategory);
  }, [userSkills, filterCategory]);

  if (!isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (showForm || editingUserSkill) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">
              {editingUserSkill
                ? "Editar Habilidad de Usuario"
                : "Asignar Nueva Habilidad"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {editingUserSkill
                ? "Actualice la informacion de la habilidad asignada"
                : "Asigne una habilidad a un usuario (conductor)"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <UserSkillForm
              onSubmit={editingUserSkill ? handleUpdate : handleCreate}
              initialData={
                editingUserSkill
                  ? {
                      userId: editingUserSkill.userId,
                      skillId: editingUserSkill.skillId,
                      obtainedAt: editingUserSkill.obtainedAt,
                      expiresAt: editingUserSkill.expiresAt || "",
                      active: editingUserSkill.active,
                    }
                  : undefined
              }
              users={users}
              skills={skills}
              submitLabel={editingUserSkill ? "Actualizar" : "Asignar"}
            />
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingUserSkill(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Gestion de Habilidades de Usuarios
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Asigne y administre las habilidades y certificaciones de los
              usuarios (conductores)
            </p>
          </div>
          <Button onClick={() => setShowForm(true)}>Asignar Habilidad</Button>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label
                htmlFor="filterUser"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Usuario
              </label>
              <select
                id="filterUser"
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Todos</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="filterCategory"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Categoria
              </label>
              <select
                id="filterCategory"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Todas</option>
                {Object.entries(VEHICLE_SKILL_CATEGORY_LABELS).map(
                  ([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label
                htmlFor="filterStatus"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Estado
              </label>
              <select
                id="filterStatus"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Todos</option>
                <option value="true">Activos</option>
                <option value="false">Inactivos</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="filterExpiry"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Vencimiento
              </label>
              <select
                id="filterExpiry"
                value={filterExpiry}
                onChange={(e) => setFilterExpiry(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Todos</option>
                <option value="valid">Vigentes</option>
                <option value="expiring_soon">Prontos a vencer</option>
                <option value="expired">Vencidas</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        ) : filteredUserSkills.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
            <p className="text-muted-foreground">
              No hay habilidades asignadas. Asigne la primera habilidad a un
              usuario.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Usuario
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Habilidad
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Categoria
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Fecha Obtencion
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Vencimiento
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUserSkills.map((userSkill) => (
                    <tr
                      key={userSkill.id}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-foreground">
                        {userSkill.user.name}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        <div className="font-medium text-foreground">
                          {userSkill.skill.name}
                        </div>
                        <div className="text-xs">{userSkill.skill.code}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getCategoryColor(userSkill.skill.category)}`}
                        >
                          {VEHICLE_SKILL_CATEGORY_LABELS[
                            userSkill.skill.category
                          ] || userSkill.skill.category}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                        {new Date(userSkill.obtainedAt).toLocaleDateString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm">
                        {userSkill.expiresAt ? (
                          <div className="flex flex-col">
                            <span>
                              {new Date(
                                userSkill.expiresAt,
                              ).toLocaleDateString()}
                            </span>
                            <span
                              className={`text-xs ${userSkill.expiryStatus === "expired" ? "text-destructive" : userSkill.expiryStatus === "expiring_soon" ? "text-orange-500" : "text-muted-foreground"}`}
                            >
                              {
                                EXPIRY_STATUS_LABELS[
                                  userSkill.expiryStatus || "valid"
                                ]
                              }
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            Sin vencimiento
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleActive(userSkill.id, userSkill.active)
                          }
                          className={`inline-flex rounded-full px-2 text-xs font-semibold transition-colors ${
                            userSkill.active
                              ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                              : "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:hover:bg-gray-900/50"
                          }`}
                        >
                          {userSkill.active ? "Activo" : "Inactivo"}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                        <button
                          type="button"
                          onClick={() => setEditingUserSkill(userSkill)}
                          className="text-muted-foreground hover:text-foreground mr-4 transition-colors"
                        >
                          Editar
                        </button>
                        {userSkill.active && (
                          <button
                            type="button"
                            onClick={() => handleDelete(userSkill.id)}
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
    </div>
  );
}

export default function UserSkillsPage() {
  return (
    <ProtectedPage requiredPermission="user_skills:VIEW">
      <UserSkillsPageContent />
    </ProtectedPage>
  );
}
