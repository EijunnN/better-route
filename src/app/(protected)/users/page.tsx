"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { UserForm } from "@/components/users/user-form";
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

const ROLE_TABS = [
  { key: "all", label: "Todos" },
  { key: "ADMIN", label: "Administradores" },
  { key: "CONDUCTOR", label: "Conductores" },
  { key: "AGENTE_SEGUIMIENTO", label: "Agentes" },
  { key: "PLANIFICADOR", label: "Planificadores" },
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

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  const fetchUsers = async () => {
    try {
      const url =
        activeTab === "all" ? "/api/users" : `/api/users?role=${activeTab}`;
      const response = await fetch(url, {
        headers: {
          "x-company-id": "demo-company-id",
        },
      });
      const data = await response.json();
      setUsers(data.data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFleets = async () => {
    try {
      const response = await fetch("/api/fleets", {
        headers: {
          "x-company-id": "demo-company-id",
        },
      });
      const data = await response.json();
      setFleets(data.data || []);
    } catch (error) {
      console.error("Error fetching fleets:", error);
    }
  };

  useEffect(() => {
    fetchFleets();
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchUsers();
  }, [activeTab]);

  const handleCreate = async (data: CreateUserInput) => {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": "demo-company-id",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    await fetchUsers();
    setShowForm(false);
  };

  const handleUpdate = async (data: CreateUserInput) => {
    if (!editingUser) return;

    // Remove password from update if empty
    const updateData = { ...data };
    if (!updateData.password) {
      delete (updateData as any).password;
    }

    const response = await fetch(`/api/users/${editingUser.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": "demo-company-id",
      },
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    await fetchUsers();
    setEditingUser(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de desactivar este usuario?")) return;

    const response = await fetch(`/api/users/${id}`, {
      method: "DELETE",
      headers: {
        "x-company-id": "demo-company-id",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || error.details || "Error al desactivar el usuario");
      return;
    }

    await fetchUsers();
  };

  const getFleetName = (fleetId: string | null | undefined) => {
    if (!fleetId) return "-";
    const fleet = fleets.find((f) => f.id === fleetId);
    return fleet?.name || "Desconocida";
  };

  const filteredUsers = users.filter((user) => {
    if (activeTab === "all") return true;
    return user.role === activeTab;
  });

  if (showForm || editingUser) {
    return (
      <div className="max-w-3xl space-y-6">
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
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <UserForm
            onSubmit={editingUser ? handleUpdate : handleCreate}
            initialData={
              editingUser
                ? {
                    name: editingUser.name,
                    email: editingUser.email,
                    username: editingUser.username,
                    role: editingUser.role as any,
                    phone: editingUser.phone,
                    identification: editingUser.identification,
                    birthDate: editingUser.birthDate,
                    photo: editingUser.photo,
                    licenseNumber: editingUser.licenseNumber,
                    licenseExpiry: editingUser.licenseExpiry,
                    licenseCategories: editingUser.licenseCategories,
                    certifications: editingUser.certifications,
                    driverStatus: editingUser.driverStatus as any,
                    primaryFleetId: editingUser.primaryFleetId,
                    active: editingUser.active,
                  }
                : undefined
            }
            fleets={fleets}
            submitLabel={editingUser ? "Actualizar" : "Crear"}
            isEditing={!!editingUser}
          />
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditingUser(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
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

      {/* Role Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        {ROLE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
                        onClick={() => setEditingUser(user)}
                        className="text-muted-foreground hover:text-foreground mr-4 transition-colors"
                      >
                        Editar
                      </button>
                      {user.active && (
                        <button
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
