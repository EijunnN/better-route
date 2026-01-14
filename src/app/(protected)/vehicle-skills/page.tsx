"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { VehicleSkillForm } from "@/components/vehicle-skills/vehicle-skill-form";
import type { VehicleSkillInput } from "@/lib/validations/vehicle-skill";
import { VEHICLE_SKILL_CATEGORY_LABELS } from "@/lib/validations/vehicle-skill";

interface VehicleSkill {
  id: string;
  code: string;
  name: string;
  category: string;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  EQUIPMENT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  TEMPERATURE:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  CERTIFICATIONS:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  SPECIAL:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function VehicleSkillsPage() {
  const [skills, setSkills] = useState<VehicleSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSkill, setEditingSkill] = useState<VehicleSkill | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterActive, setFilterActive] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchSkills = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCategory) params.append("category", filterCategory);
      if (filterActive) params.append("active", filterActive);
      if (searchTerm) params.append("search", searchTerm);

      const response = await fetch(`/api/vehicle-skills?${params.toString()}`, {
        headers: {
          "x-company-id": "demo-company-id",
        },
      });
      const data = await response.json();
      setSkills(data.data || []);
    } catch (error) {
      console.error("Error fetching vehicle skills:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, [filterCategory, filterActive, searchTerm]);

  const handleCreate = async (data: VehicleSkillInput) => {
    const response = await fetch("/api/vehicle-skills", {
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

    await fetchSkills();
    setShowForm(false);
  };

  const handleUpdate = async (data: VehicleSkillInput) => {
    if (!editingSkill) return;

    const response = await fetch(`/api/vehicle-skills/${editingSkill.id}`, {
      method: "PATCH",
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

    await fetchSkills();
    setEditingSkill(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de eliminar esta habilidad?")) return;

    const response = await fetch(`/api/vehicle-skills/${id}`, {
      method: "DELETE",
      headers: {
        "x-company-id": "demo-company-id",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || error.details || "Error al eliminar la habilidad");
      return;
    }

    await fetchSkills();
  };

  const handleToggleActive = async (skill: VehicleSkill) => {
    const response = await fetch(`/api/vehicle-skills/${skill.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": "demo-company-id",
      },
      body: JSON.stringify({ active: !skill.active }),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Error al actualizar el estado");
      return;
    }

    await fetchSkills();
  };

  if (showForm || editingSkill) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">
              {editingSkill ? "Editar Habilidad" : "Nueva Habilidad"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {editingSkill
                ? "Actualice la información de la habilidad"
                : "Complete el formulario para crear una nueva habilidad"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <VehicleSkillForm
              onSubmit={editingSkill ? handleUpdate : handleCreate}
              initialData={
                editingSkill
                  ? {
                      code: editingSkill.code,
                      name: editingSkill.name,
                      category:
                        editingSkill.category as VehicleSkillInput["category"],
                      description: editingSkill.description,
                      active: editingSkill.active,
                    }
                  : undefined
              }
              submitLabel={editingSkill ? "Actualizar" : "Crear"}
            />
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingSkill(null);
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
              Catálogo de Habilidades de Vehículos
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gestione las capacidades especiales de los vehículos
            </p>
          </div>
          <Button onClick={() => setShowForm(true)}>Nueva Habilidad</Button>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="search"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Buscar
              </label>
              <input
                id="search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Código, nombre o descripción..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label
                htmlFor="category"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Categoría
              </label>
              <select
                id="category"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Todas</option>
                {Object.entries(VEHICLE_SKILL_CATEGORY_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label
                htmlFor="active"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Estado
              </label>
              <select
                id="active"
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Todos</option>
                <option value="true">Activos</option>
                <option value="false">Inactivos</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        ) : skills.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
            <p className="text-muted-foreground">
              {searchTerm || filterCategory || filterActive
                ? "No se encontraron habilidades con los filtros aplicados."
                : "No hay habilidades registradas. Cree la primera habilidad."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Código
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Nombre
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Categoría
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Descripción
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
                  {skills.map((skill) => (
                    <tr
                      key={skill.id}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-mono font-medium text-foreground">
                        {skill.code}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-foreground">
                        {skill.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            CATEGORY_BADGE_COLORS[skill.category] ||
                            "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {VEHICLE_SKILL_CATEGORY_LABELS[skill.category] ||
                            skill.category}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground max-w-xs truncate">
                        {skill.description || "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <button
                          onClick={() => handleToggleActive(skill)}
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            skill.active
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-900/50"
                          }`}
                        >
                          {skill.active ? "Activo" : "Inactivo"}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                        <button
                          onClick={() => setEditingSkill(skill)}
                          className="text-muted-foreground hover:text-foreground mr-4 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(skill.id)}
                          className="text-destructive hover:text-destructive/80 transition-colors"
                        >
                          Eliminar
                        </button>
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
