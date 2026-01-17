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
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { VehicleStatusModal } from "@/components/vehicles/vehicle-status-modal";
import { useCompanyContext } from "@/hooks/use-company-context";
import { CompanySelector } from "@/components/company-selector";
import { useToast } from "@/hooks/use-toast";
import type { VehicleInput } from "@/lib/validations/vehicle";
import type { VehicleStatusTransitionInput } from "@/lib/validations/vehicle-status";

interface Vehicle {
  id: string;
  name: string;
  plate: string | null;
  useNameAsPlate: boolean;
  loadType: string | null;
  maxOrders: number;
  originAddress: string | null;
  originLatitude: string | null;
  originLongitude: string | null;
  assignedDriverId: string | null;
  workdayStart: string | null;
  workdayEnd: string | null;
  hasBreakTime: boolean;
  breakDuration: number | null;
  breakTimeStart: string | null;
  breakTimeEnd: string | null;
  fleetIds: string[];
  fleets: Array<{ id: string; name: string }>;
  // Legacy fields
  brand: string | null;
  model: string | null;
  year: number | null;
  type: string | null;
  weightCapacity: number | null;
  volumeCapacity: number | null;
  refrigerated: boolean;
  heated: boolean;
  lifting: boolean;
  licenseRequired: string | null;
  insuranceExpiry: string | null;
  inspectionExpiry: string | null;
  status: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Fleet {
  id: string;
  name: string;
}

interface Driver {
  id: string;
  name: string;
}

const VEHICLE_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Disponible",
  IN_MAINTENANCE: "En Mantenimiento",
  ASSIGNED: "Asignado",
  INACTIVE: "Inactivo",
};

function VehiclesPageContent() {
  const {
    effectiveCompanyId: companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  } = useCompanyContext();
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [statusModalVehicle, setStatusModalVehicle] = useState<Vehicle | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchVehicles = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/vehicles", {
        headers: {
          "x-company-id": companyId ?? "",
        },
      });
      const data = await response.json();
      // Map fleets array to fleetIds
      const vehiclesData = (data.data || []).map(
        (v: Vehicle & { fleets?: Array<{ id: string; name: string }> }) => ({
          ...v,
          fleetIds: v.fleets?.map((f) => f.id) || [],
        }),
      );
      setVehicles(vehiclesData);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  const fetchFleets = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/fleets", {
        headers: {
          "x-company-id": companyId ?? "",
        },
      });
      const data = await response.json();
      setFleets(data.data || []);
    } catch (error) {
      console.error("Error fetching fleets:", error);
    }
  }, [companyId]);

  const fetchDrivers = useCallback(async () => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/users?role=CONDUCTOR", {
        headers: {
          "x-company-id": companyId ?? "",
        },
      });
      const data = await response.json();
      setDrivers(
        (data.data || []).map((d: { id: string; name: string }) => ({
          id: d.id,
          name: d.name,
        })),
      );
    } catch (error) {
      console.error("Error fetching drivers:", error);
    }
  }, [companyId]);

  useEffect(() => {
    fetchVehicles();
    fetchFleets();
    fetchDrivers();
  }, [companyId, fetchDrivers, fetchFleets, fetchVehicles]);

  const handleCreate = async (data: VehicleInput) => {
    try {
      const response = await fetch("/api/vehicles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId ?? "",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al crear vehículo");
      }

      await fetchVehicles();
      setShowForm(false);
      toast({
        title: "Vehículo creado",
        description: `El vehículo "${data.name}" ha sido creado exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al crear vehículo",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleUpdate = async (data: VehicleInput) => {
    if (!editingVehicle) return;

    try {
      const response = await fetch(`/api/vehicles/${editingVehicle.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId ?? "",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al actualizar vehículo");
      }

      await fetchVehicles();
      setEditingVehicle(null);
      toast({
        title: "Vehículo actualizado",
        description: `El vehículo "${data.name}" ha sido actualizado exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al actualizar vehículo",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const vehicle = vehicles.find((v) => v.id === id);

    try {
      const response = await fetch(`/api/vehicles/${id}`, {
        method: "DELETE",
        headers: {
          "x-company-id": companyId ?? "",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.details || "Error al desactivar el vehículo");
      }

      await fetchVehicles();
      toast({
        title: "Vehículo desactivado",
        description: vehicle
          ? `El vehículo "${vehicle.name}" ha sido desactivado.`
          : "El vehículo ha sido desactivado.",
      });
    } catch (err) {
      toast({
        title: "Error al desactivar vehículo",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleStatusChange = async (
    vehicleId: string,
    data: VehicleStatusTransitionInput,
  ) => {
    const response = await fetch(
      `/api/vehicles/${vehicleId}/status-transition`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId ?? "",
        },
        body: JSON.stringify(data),
      },
    );

    if (!response.ok) {
      throw response;
    }

    await fetchVehicles();
  };

  const getFleetNames = (vehicle: Vehicle) => {
    if (vehicle.fleets && vehicle.fleets.length > 0) {
      return vehicle.fleets.map((f) => f.name).join(", ");
    }
    return "-";
  };

  if (!isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

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
              initialData={
                editingVehicle
                  ? {
                      name: editingVehicle.name,
                      useNameAsPlate: editingVehicle.useNameAsPlate,
                      plate: editingVehicle.plate || "",
                      loadType:
                        editingVehicle.loadType as VehicleInput["loadType"],
                      maxOrders: editingVehicle.maxOrders,
                      originAddress: editingVehicle.originAddress || "",
                      originLatitude: editingVehicle.originLatitude || "",
                      originLongitude: editingVehicle.originLongitude || "",
                      assignedDriverId: editingVehicle.assignedDriverId,
                      workdayStart: editingVehicle.workdayStart || "",
                      workdayEnd: editingVehicle.workdayEnd || "",
                      hasBreakTime: editingVehicle.hasBreakTime,
                      breakDuration: editingVehicle.breakDuration,
                      breakTimeStart: editingVehicle.breakTimeStart || "",
                      breakTimeEnd: editingVehicle.breakTimeEnd || "",
                      fleetIds: editingVehicle.fleetIds || [],
                      brand: editingVehicle.brand || "",
                      model: editingVehicle.model || "",
                      year: editingVehicle.year,
                      type: editingVehicle.type as VehicleInput["type"],
                      weightCapacity: editingVehicle.weightCapacity,
                      volumeCapacity: editingVehicle.volumeCapacity,
                      refrigerated: editingVehicle.refrigerated,
                      heated: editingVehicle.heated,
                      lifting: editingVehicle.lifting,
                      licenseRequired:
                        editingVehicle.licenseRequired as VehicleInput["licenseRequired"],
                      insuranceExpiry: editingVehicle.insuranceExpiry || "",
                      inspectionExpiry: editingVehicle.inspectionExpiry || "",
                      status: editingVehicle.status as VehicleInput["status"],
                      active: editingVehicle.active,
                    }
                  : undefined
              }
              fleets={fleets}
              drivers={drivers}
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
    <div className="space-y-6">
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

      <CompanySelector
        companies={companies}
        selectedCompanyId={selectedCompanyId}
        authCompanyId={authCompanyId}
        onCompanyChange={setSelectedCompanyId}
        isSystemAdmin={isSystemAdmin}
      />

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
                    Nombre
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Placa
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Tipo Carga
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Max Pedidos
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Flotas
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
                  <tr
                    key={vehicle.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-foreground">
                      {vehicle.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                      {vehicle.plate || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                      {vehicle.loadType || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
                      {vehicle.maxOrders}
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground max-w-xs truncate">
                      {getFleetNames(vehicle)}
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
                        {VEHICLE_STATUS_LABELS[vehicle.status] ||
                          vehicle.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingVehicle(vehicle)}
                        disabled={deletingId === vehicle.id}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setStatusModalVehicle(vehicle)}
                        disabled={deletingId === vehicle.id}
                      >
                        Cambiar Estado
                      </Button>
                      {vehicle.active && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={deletingId === vehicle.id}
                            >
                              {deletingId === vehicle.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                ¿Desactivar vehículo?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción desactivará el vehículo{" "}
                                <strong>{vehicle.name}</strong>. No podrá ser
                                asignado a rutas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(vehicle.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Desactivar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Status Change Modal */}
      {statusModalVehicle && (
        <VehicleStatusModal
          open={!!statusModalVehicle}
          onOpenChange={(open) => !open && setStatusModalVehicle(null)}
          vehicleId={statusModalVehicle.id}
          currentStatus={statusModalVehicle.status}
          vehiclePlate={statusModalVehicle.plate || statusModalVehicle.name}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}

export default function VehiclesPage() {
  return (
    <ProtectedPage requiredPermission="vehicles:VIEW">
      <VehiclesPageContent />
    </ProtectedPage>
  );
}
