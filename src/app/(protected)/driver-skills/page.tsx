"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DriverSkillForm } from "@/components/driver-skills/driver-skill-form";
import { Button } from "@/components/ui/button";
import type { DriverSkillInput } from "@/lib/validations/driver-skill";

interface DriverSkill {
  id: string;
  driverId: string;
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
  driver: {
    id: string;
    name: string;
    identification: string;
  };
  expiryStatus?: string;
}

interface Driver {
  id: string;
  name: string;
  identification: string;
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

export default function DriverSkillsPage() {
  const [driverSkills, setDriverSkills] = useState<DriverSkill[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [skills, setSkills] = useState<VehicleSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDriverSkill, setEditingDriverSkill] =
    useState<DriverSkill | null>(null);
  const [filterDriver, setFilterDriver] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterExpiry, setFilterExpiry] = useState<string>("");

  const fetchDriverSkills = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterDriver) params.append("driverId", filterDriver);
      if (filterStatus) params.append("active", filterStatus);
      if (filterExpiry) params.append("status", filterExpiry);

      const response = await fetch(`/api/driver-skills?${params.toString()}`, {
        headers: {
          "x-company-id": "demo-company-id",
        },
      });
      const data = await response.json();
      setDriverSkills(data.data || []);
    } catch (error) {
      console.error("Error fetching driver skills:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filterDriver, filterStatus, filterExpiry]);

  const fetchDrivers = useCallback(async () => {
    try {
      const response = await fetch("/api/drivers?active=true", {
        headers: {
          "x-company-id": "demo-company-id",
        },
      });
      const data = await response.json();
      setDrivers(data.data || []);
    } catch (error) {
      console.error("Error fetching drivers:", error);
    }
  }, []);

  const fetchSkills = useCallback(async () => {
    try {
      const response = await fetch("/api/vehicle-skills?active=true", {
        headers: {
          "x-company-id": "demo-company-id",
        },
      });
      const data = await response.json();
      setSkills(data.data || []);
    } catch (error) {
      console.error("Error fetching vehicle skills:", error);
    }
  }, []);

  useEffect(() => {
    fetchDriverSkills();
    fetchDrivers();
    fetchSkills();
  }, [fetchDriverSkills, fetchDrivers, fetchSkills]);

  const handleCreate = async (data: DriverSkillInput) => {
    const response = await fetch("/api/driver-skills", {
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

    await fetchDriverSkills();
    setShowForm(false);
  };

  const handleUpdate = async (data: DriverSkillInput) => {
    if (!editingDriverSkill) return;

    const response = await fetch(
      `/api/driver-skills/${editingDriverSkill.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": "demo-company-id",
        },
        body: JSON.stringify(data),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    await fetchDriverSkills();
    setEditingDriverSkill(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de desactivar esta habilidad del conductor?"))
      return;

    const response = await fetch(`/api/driver-skills/${id}`, {
      method: "DELETE",
      headers: {
        "x-company-id": "demo-company-id",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || error.details || "Error al desactivar la habilidad");
      return;
    }

    await fetchDriverSkills();
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const response = await fetch(`/api/driver-skills/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": "demo-company-id",
      },
      body: JSON.stringify({ active: !currentActive }),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || error.details || "Error al actualizar el estado");
      return;
    }

    await fetchDriverSkills();
  };

  // Filter by category (client-side)
  const filteredDriverSkills = useMemo(() => {
    if (!filterCategory) return driverSkills;
    return driverSkills.filter((ds) => ds.skill.category === filterCategory);
  }, [driverSkills, filterCategory]);

  const _getDriverName = (driverId: string) => {
    const driver = drivers.find((d) => d.id === driverId);
    return driver?.name || "Desconocido";
  };

  if (showForm || editingDriverSkill) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">
              {editingDriverSkill
                ? "Editar Habilidad de Conductor"
                : "Asignar Nueva Habilidad"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {editingDriverSkill
                ? "Actualice la información de la habilidad asignada"
                : "Asigne una habilidad a un conductor"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <DriverSkillForm
              onSubmit={editingDriverSkill ? handleUpdate : handleCreate}
              initialData={
                editingDriverSkill
                  ? {
                      driverId: editingDriverSkill.driverId,
                      skillId: editingDriverSkill.skillId,
                      obtainedAt: editingDriverSkill.obtainedAt,
                      expiresAt: editingDriverSkill.expiresAt || "",
                      active: editingDriverSkill.active,
                    }
                  : undefined
              }
              drivers={drivers}
              skills={skills}
              submitLabel={editingDriverSkill ? "Actualizar" : "Asignar"}
            />
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingDriverSkill(null);
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
              Gestión de Habilidades de Conductores
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Asigne y administre las habilidades y certificaciones de los
              conductores
            </p>
          </div>
          <Button onClick={() => setShowForm(true)}>Asignar Habilidad</Button>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label
                htmlFor="filterDriver"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Conductor
              </label>
              <select
                id="filterDriver"
                value={filterDriver}
                onChange={(e) => setFilterDriver(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Todos</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="filterCategory"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Categoría
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
        ) : filteredDriverSkills.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
            <p className="text-muted-foreground">
              No hay habilidades asignadas. Asigne la primera habilidad a un
              conductor.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Conductor
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Habilidad
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Categoría
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Fecha Obtención
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
                  {filteredDriverSkills.map((driverSkill) => (
                    <tr
                      key={driverSkill.id}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-foreground">
                        {driverSkill.driver.name}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        <div className="font-medium text-foreground">
                          {driverSkill.skill.name}
                        </div>
                        <div className="text-xs">{driverSkill.skill.code}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getCategoryColor(driverSkill.skill.category)}`}
                        >
                          {VEHICLE_SKILL_CATEGORY_LABELS[
                            driverSkill.skill.category
                          ] || driverSkill.skill.category}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                        {new Date(driverSkill.obtainedAt).toLocaleDateString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm">
                        {driverSkill.expiresAt ? (
                          <div className="flex flex-col">
                            <span>
                              {new Date(
                                driverSkill.expiresAt,
                              ).toLocaleDateString()}
                            </span>
                            <span
                              className={`text-xs ${driverSkill.expiryStatus === "expired" ? "text-destructive" : driverSkill.expiryStatus === "expiring_soon" ? "text-orange-500" : "text-muted-foreground"}`}
                            >
                              {
                                EXPIRY_STATUS_LABELS[
                                  driverSkill.expiryStatus || "valid"
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
                            handleToggleActive(
                              driverSkill.id,
                              driverSkill.active,
                            )
                          }
                          className={`inline-flex rounded-full px-2 text-xs font-semibold transition-colors ${
                            driverSkill.active
                              ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                              : "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:hover:bg-gray-900/50"
                          }`}
                        >
                          {driverSkill.active ? "Activo" : "Inactivo"}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                        <button
                          type="button"
                          onClick={() => setEditingDriverSkill(driverSkill)}
                          className="text-muted-foreground hover:text-foreground mr-4 transition-colors"
                        >
                          Editar
                        </button>
                        {driverSkill.active && (
                          <button
                            type="button"
                            onClick={() => handleDelete(driverSkill.id)}
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
