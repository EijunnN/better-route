"use client";

import { useEffect, useMemo, useState } from "react";
import { DriverForm } from "@/components/drivers/driver-form";
import { DriverStatusModal } from "@/components/drivers/driver-status-modal";
import { Button } from "@/components/ui/button";
import type { DriverInput } from "@/lib/validations/driver";
import { isExpired, isExpiringSoon } from "@/lib/validations/driver";
import type { DriverStatusTransitionInput } from "@/lib/validations/driver-status";
import { STATUS_COLOR_CLASSES } from "@/lib/validations/driver-status";

interface Driver {
  id: string;
  fleetId: string;
  name: string;
  identification: string;
  email: string;
  phone?: string;
  birthDate?: string;
  photo?: string;
  licenseNumber: string;
  licenseExpiry: string;
  licenseCategories: string;
  certifications?: string;
  status: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Fleet {
  id: string;
  name: string;
}

const DRIVER_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Disponible",
  ASSIGNED: "Asignado",
  IN_ROUTE: "En Ruta",
  ON_PAUSE: "En Pausa",
  COMPLETED: "Completado",
  UNAVAILABLE: "No Disponible",
  ABSENT: "Ausente",
};

const getLicenseStatusColor = (expiryDate: string) => {
  if (isExpired(expiryDate)) return "text-destructive";
  if (isExpiringSoon(expiryDate)) return "text-orange-500";
  return "text-muted-foreground";
};

const getLicenseStatusLabel = (expiryDate: string) => {
  if (isExpired(expiryDate)) return "Vencida ⚠️";
  if (isExpiringSoon(expiryDate)) return "Pronto a vencer ⏰";
  return new Date(expiryDate).toLocaleDateString();
};

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [statusModalDriver, setStatusModalDriver] = useState<Driver | null>(
    null,
  );

  const fetchDrivers = async () => {
    try {
      const response = await fetch("/api/drivers", {
        headers: {
          "x-company-id": "demo-company-id",
        },
      });
      const data = await response.json();
      setDrivers(data.data || []);
    } catch (error) {
      console.error("Error fetching drivers:", error);
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
    fetchDrivers();
    fetchFleets();
  }, []);

  const handleCreate = async (data: DriverInput) => {
    const response = await fetch("/api/drivers", {
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

    await fetchDrivers();
    setShowForm(false);
  };

  const handleUpdate = async (data: DriverInput) => {
    if (!editingDriver) return;

    const response = await fetch(`/api/drivers/${editingDriver.id}`, {
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

    await fetchDrivers();
    setEditingDriver(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de desactivar este conductor?")) return;

    const response = await fetch(`/api/drivers/${id}`, {
      method: "DELETE",
      headers: {
        "x-company-id": "demo-company-id",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || error.details || "Error al desactivar el conductor");
      return;
    }

    await fetchDrivers();
  };

  const handleStatusChange = async (
    driverId: string,
    data: DriverStatusTransitionInput,
  ) => {
    const response = await fetch(`/api/drivers/${driverId}/status-transition`, {
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

    await fetchDrivers();
    setStatusModalDriver(null);
  };

  const getFleetName = (fleetId: string) => {
    const fleet = fleets.find((f) => f.id === fleetId);
    return fleet?.name || "Desconocida";
  };

  if (showForm || editingDriver) {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {editingDriver ? "Editar Conductor" : "Nuevo Conductor"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {editingDriver
              ? "Actualice la información del conductor"
              : "Complete el formulario para crear un nuevo conductor"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <DriverForm
            onSubmit={editingDriver ? handleUpdate : handleCreate}
            initialData={
              editingDriver
                ? {
                    fleetId: editingDriver.fleetId,
                    name: editingDriver.name,
                    identification: editingDriver.identification,
                    email: editingDriver.email,
                    phone: editingDriver.phone || "",
                    birthDate: editingDriver.birthDate || "",
                    photo: editingDriver.photo || "",
                    licenseNumber: editingDriver.licenseNumber,
                    licenseExpiry: editingDriver.licenseExpiry,
                    licenseCategories: editingDriver.licenseCategories,
                    certifications: editingDriver.certifications || "",
                    status: editingDriver.status as DriverInput["status"],
                    active: editingDriver.active,
                  }
                : undefined
            }
            fleets={fleets}
            submitLabel={editingDriver ? "Actualizar" : "Crear"}
          />
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditingDriver(null);
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
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Gestión de Conductores
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Administre los conductores de la flota
            </p>
          </div>
          <Button onClick={() => setShowForm(true)}>Nuevo Conductor</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        ) : drivers.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
            <p className="text-muted-foreground">
              No hay conductores registrados. Cree el primer conductor.
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
                      Identificación
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Contacto
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Flota
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Licencia
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
                  {drivers.map((driver) => (
                    <tr
                      key={driver.id}
                      className="hover:bg-muted/50 transition-colors"
                    >
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-foreground">
                        {driver.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                        {driver.identification}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        <div>{driver.email}</div>
                        {driver.phone && (
                          <div className="text-xs">{driver.phone}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                        {getFleetName(driver.fleetId)}
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        <div>{driver.licenseNumber}</div>
                        <div className="text-xs">
                          {driver.licenseCategories}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm">
                        <span
                          className={getLicenseStatusColor(
                            driver.licenseExpiry,
                          )}
                        >
                          {getLicenseStatusLabel(driver.licenseExpiry)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <button
                          onClick={() => setStatusModalDriver(driver)}
                          className={`inline-flex cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors hover:opacity-80 ${
                            STATUS_COLOR_CLASSES[
                              driver.status as keyof typeof STATUS_COLOR_CLASSES
                            ] ||
                            "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"
                          }`}
                        >
                          {DRIVER_STATUS_LABELS[driver.status] || driver.status}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                        <button
                          onClick={() => setEditingDriver(driver)}
                          className="text-muted-foreground hover:text-foreground mr-4 transition-colors"
                        >
                          Editar
                        </button>
                        {driver.active && (
                          <button
                            onClick={() => handleDelete(driver.id)}
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

      {statusModalDriver && (
        <DriverStatusModal
          open={!!statusModalDriver}
          onOpenChange={(open) => !open && setStatusModalDriver(null)}
          driverId={statusModalDriver.id}
          driverName={statusModalDriver.name}
          currentStatus={statusModalDriver.status as any}
          onStatusChange={handleStatusChange}
        />
      )}
    </>
  );
}
