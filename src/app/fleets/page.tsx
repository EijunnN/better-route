"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FleetForm } from "@/components/fleets/fleet-form";
import type { FleetInput } from "@/lib/validations/fleet";

interface Fleet {
  id: string;
  name: string;
  type: string;
  weightCapacity: number;
  volumeCapacity: number;
  operationStart: string;
  operationEnd: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const FLEET_TYPE_LABELS: Record<string, string> = {
  HEAVY_LOAD: "Carga Pesada",
  LIGHT_LOAD: "Carga Ligera",
  EXPRESS: "Express",
  REFRIGERATED: "Refrigerado",
  SPECIAL: "Especial",
};

export default function FleetsPage() {
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingFleet, setEditingFleet] = useState<Fleet | null>(null);

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
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFleets();
  }, []);

  const handleCreate = async (data: FleetInput) => {
    const response = await fetch("/api/fleets", {
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

    await fetchFleets();
    setShowForm(false);
  };

  const handleUpdate = async (data: FleetInput) => {
    if (!editingFleet) return;

    const response = await fetch(`/api/fleets/${editingFleet.id}`, {
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

    await fetchFleets();
    setEditingFleet(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de desactivar esta flota?")) return;

    const response = await fetch(`/api/fleets/${id}`, {
      method: "DELETE",
      headers: {
        "x-company-id": "demo-company-id",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || error.details || "Error al desactivar la flota");
      return;
    }

    await fetchFleets();
  };

  if (showForm || editingFleet) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">
              {editingFleet ? "Editar Flota" : "Nueva Flota"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {editingFleet
                ? "Actualice la información de la flota"
                : "Complete el formulario para crear una nueva flota"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <FleetForm
              onSubmit={editingFleet ? handleUpdate : handleCreate}
              initialData={editingFleet ? {
                ...editingFleet,
                type: editingFleet.type as FleetInput["type"],
              } : undefined}
              submitLabel={editingFleet ? "Actualizar" : "Crear"}
            />
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingFleet(null);
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
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Gestión de Flotas
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Administre las flotas de vehículos y conductores
            </p>
          </div>
          <Button onClick={() => setShowForm(true)}>Nueva Flota</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        ) : fleets.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
            <p className="text-muted-foreground">
              No hay flotas registradas. Cree la primera flota.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Nombre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Capacidad Peso
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Capacidad Volumen
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Horario Operación
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fleets.map((fleet) => (
                  <tr key={fleet.id} className="hover:bg-muted/50 transition-colors">
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-foreground">
                      {fleet.name}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                      {FLEET_TYPE_LABELS[fleet.type] || fleet.type}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                      {fleet.weightCapacity.toLocaleString()} kg
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                      {fleet.volumeCapacity.toLocaleString()} m³
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                      {fleet.operationStart} - {fleet.operationEnd}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 text-xs font-semibold ${
                          fleet.active
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {fleet.active ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <button
                        onClick={() => setEditingFleet(fleet)}
                        className="text-muted-foreground hover:text-foreground mr-4 transition-colors"
                      >
                        Editar
                      </button>
                      {fleet.active && (
                        <button
                          onClick={() => handleDelete(fleet.id)}
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
        )}
      </div>
    </div>
  );
}
