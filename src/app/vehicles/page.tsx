"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { VehicleStatusModal } from "@/components/vehicles/vehicle-status-modal";
import type { VehicleInput } from "@/lib/validations/vehicle";
import type { VehicleStatusTransitionInput } from "@/lib/validations/vehicle-status";

interface Vehicle {
  id: string;
  fleetId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  type: string;
  weightCapacity: number;
  volumeCapacity: number;
  refrigerated: boolean;
  heated: boolean;
  lifting: boolean;
  licenseRequired?: string;
  insuranceExpiry?: string;
  inspectionExpiry?: string;
  status: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Fleet {
  id: string;
  name: string;
}

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  TRUCK: "Camión",
  VAN: "Furgoneta",
  SEMI_TRUCK: "Semirremolque",
  PICKUP: "Pickup",
  TRAILER: "Remolque",
  REFRIGERATED_TRUCK: "Camión Refrigerado",
};

const VEHICLE_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Disponible",
  IN_MAINTENANCE: "En Mantenimiento",
  ASSIGNED: "Asignado",
  INACTIVE: "Inactivo",
};

const getFeatureLabel = (refrigerated: boolean, heated: boolean, lifting: boolean) => {
  const features = [];
  if (refrigerated) features.push("Frío");
  if (heated) features.push("Calor");
  if (lifting) features.push("Elevación");
  return features.length > 0 ? features.join(", ") : "-";
};

const isExpiringSoon = (dateStr?: string): boolean => {
  if (!dateStr) return false;
  const expiryDate = new Date(dateStr);
  const today = new Date();
  const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
};

const isExpired = (dateStr?: string): boolean => {
  if (!dateStr) return false;
  const expiryDate = new Date(dateStr);
  const today = new Date();
  return expiryDate < today;
};

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [statusModalVehicle, setStatusModalVehicle] = useState<Vehicle | null>(null);

  const fetchVehicles = async () => {
    try {
      const response = await fetch("/api/vehicles", {
        headers: {
          "x-company-id": "demo-company-id",
        },
      });
      const data = await response.json();
      setVehicles(data.data || []);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
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
    fetchVehicles();
    fetchFleets();
  }, []);

  const handleCreate = async (data: VehicleInput) => {
    const response = await fetch("/api/vehicles", {
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

    await fetchVehicles();
    setShowForm(false);
  };

  const handleUpdate = async (data: VehicleInput) => {
    if (!editingVehicle) return;

    const response = await fetch(`/api/vehicles/${editingVehicle.id}`, {
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

    await fetchVehicles();
    setEditingVehicle(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de desactivar este vehículo?")) return;

    const response = await fetch(`/api/vehicles/${id}`, {
      method: "DELETE",
      headers: {
        "x-company-id": "demo-company-id",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || error.details || "Error al desactivar el vehículo");
      return;
    }

    await fetchVehicles();
  };

  const handleStatusChange = async (vehicleId: string, data: VehicleStatusTransitionInput) => {
    const response = await fetch(`/api/vehicles/${vehicleId}/status-transition`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": "demo-company-id",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw response;
    }

    await fetchVehicles();
  };

  const getFleetName = (fleetId: string) => {
    const fleet = fleets.find((f) => f.id === fleetId);
    return fleet?.name || "Desconocida";
  };

  if (showForm || editingVehicle) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">
              {editingVehicle ? "Editar Vehículo" : "Nuevo Vehículo"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {editingVehicle
                ? "Actualice la información del vehículo"
                : "Complete el formulario para crear un nuevo vehículo"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <VehicleForm
              onSubmit={editingVehicle ? handleUpdate : handleCreate}
              initialData={editingVehicle ? {
                fleetId: editingVehicle.fleetId,
                plate: editingVehicle.plate,
                brand: editingVehicle.brand,
                model: editingVehicle.model,
                year: editingVehicle.year,
                type: editingVehicle.type as VehicleInput["type"],
                weightCapacity: editingVehicle.weightCapacity,
                volumeCapacity: editingVehicle.volumeCapacity,
                refrigerated: editingVehicle.refrigerated,
                heated: editingVehicle.heated,
                lifting: editingVehicle.lifting,
                licenseRequired: editingVehicle.licenseRequired as VehicleInput["licenseRequired"],
                insuranceExpiry: editingVehicle.insuranceExpiry || "",
                inspectionExpiry: editingVehicle.inspectionExpiry || "",
                status: editingVehicle.status as VehicleInput["status"],
                active: editingVehicle.active,
              } : undefined}
              fleets={fleets}
              submitLabel={editingVehicle ? "Actualizar" : "Crear"}
            />
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingVehicle(null);
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
              Gestión de Vehículos
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Administre los vehículos de la flota
            </p>
          </div>
          <Button onClick={() => setShowForm(true)}>Nuevo Vehículo</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        ) : vehicles.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
            <p className="text-muted-foreground">
              No hay vehículos registrados. Cree el primer vehículo.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Matrícula
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Marca/Modelo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Tipo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Flota
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Capacidades
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Características
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Documentos
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
                  {vehicles.map((vehicle) => (
                    <tr key={vehicle.id} className="hover:bg-muted/50 transition-colors">
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-foreground">
                        {vehicle.plate}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                        {vehicle.brand} {vehicle.model} ({vehicle.year})
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                        {VEHICLE_TYPE_LABELS[vehicle.type] || vehicle.type}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                        {getFleetName(vehicle.fleetId)}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        <div>{vehicle.weightCapacity.toLocaleString()} kg</div>
                        <div>{vehicle.volumeCapacity.toLocaleString()} m³</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                        {getFeatureLabel(vehicle.refrigerated, vehicle.heated, vehicle.lifting)}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="space-y-1">
                          {vehicle.insuranceExpiry && (
                            <div className={isExpired(vehicle.insuranceExpiry) ? "text-destructive" : isExpiringSoon(vehicle.insuranceExpiry) ? "text-orange-500" : "text-muted-foreground"}>
                              Seguro: {new Date(vehicle.insuranceExpiry).toLocaleDateString()}
                              {isExpired(vehicle.insuranceExpiry) && " ⚠️"}
                              {isExpiringSoon(vehicle.insuranceExpiry) && !isExpired(vehicle.insuranceExpiry) && " ⏰"}
                            </div>
                          )}
                          {vehicle.inspectionExpiry && (
                            <div className={isExpired(vehicle.inspectionExpiry) ? "text-destructive" : isExpiringSoon(vehicle.inspectionExpiry) ? "text-orange-500" : "text-muted-foreground"}>
                              Inspección: {new Date(vehicle.inspectionExpiry).toLocaleDateString()}
                              {isExpired(vehicle.inspectionExpiry) && " ⚠️"}
                              {isExpiringSoon(vehicle.inspectionExpiry) && !isExpired(vehicle.inspectionExpiry) && " ⏰"}
                            </div>
                          )}
                          {!vehicle.insuranceExpiry && !vehicle.inspectionExpiry && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 text-xs font-semibold ${
                            vehicle.status === "AVAILABLE"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : vehicle.status === "IN_MAINTENANCE"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                              : vehicle.status === "ASSIGNED"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {VEHICLE_STATUS_LABELS[vehicle.status] || vehicle.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                        <button
                          onClick={() => setEditingVehicle(vehicle)}
                          className="text-muted-foreground hover:text-foreground mr-3 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setStatusModalVehicle(vehicle)}
                          className="text-muted-foreground hover:text-foreground mr-3 transition-colors"
                        >
                          Cambiar Estado
                        </button>
                        {vehicle.active && (
                          <button
                            onClick={() => handleDelete(vehicle.id)}
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

      {/* Status Change Modal */}
      {statusModalVehicle && (
        <VehicleStatusModal
          open={!!statusModalVehicle}
          onOpenChange={(open) => !open && setStatusModalVehicle(null)}
          vehicleId={statusModalVehicle.id}
          currentStatus={statusModalVehicle.status}
          vehiclePlate={statusModalVehicle.plate}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
