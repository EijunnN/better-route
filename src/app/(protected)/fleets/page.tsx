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
import { FleetForm } from "@/components/fleets/fleet-form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { FleetInput } from "@/lib/validations/fleet";
import { useCompanyContext } from "@/hooks/use-company-context";
import { CompanySelector } from "@/components/company-selector";

interface Fleet {
  id: string;
  name: string;
  description?: string | null;
  type?: string | null;
  weightCapacity?: number | null;
  volumeCapacity?: number | null;
  operationStart?: string | null;
  operationEnd?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  vehicleIds?: string[];
  userIds?: string[];
}

interface VehicleWithFleets {
  id: string;
  name: string;
  plate: string | null;
  fleets: Array<{ id: string; name: string }>;
}

interface UserWithFleets {
  id: string;
  name: string;
  role: string;
  fleets: Array<{ id: string; name: string }>;
}

function FleetsPageContent() {
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
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [vehicles, setVehicles] = useState<VehicleWithFleets[]>([]);
  const [users, setUsers] = useState<UserWithFleets[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingFleet, setEditingFleet] = useState<Fleet | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  const fetchVehiclesAndUsers = useCallback(async () => {
    if (!companyId) return;
    try {
      // Fetch vehicles with their fleet assignments
      const vehiclesRes = await fetch("/api/vehicles", {
        headers: { "x-company-id": companyId ?? "" },
      });
      const vehiclesData = await vehiclesRes.json();
      const vehiclesList = vehiclesData.data || [];

      // Map to VehicleWithFleets format
      const vehiclesWithFleets: VehicleWithFleets[] = vehiclesList.map(
        (v: {
          id: string;
          name?: string;
          plate?: string;
          fleets?: Array<{ id: string; name: string }>;
        }) => ({
          id: v.id,
          name: v.name || v.plate || "Sin nombre",
          plate: v.plate,
          fleets: v.fleets || [],
        }),
      );
      setVehicles(vehiclesWithFleets);

      // Fetch users
      const usersRes = await fetch("/api/users", {
        headers: { "x-company-id": companyId ?? "" },
      });
      const usersData = await usersRes.json();
      const usersList = usersData.data || [];

      // Map to UserWithFleets format (only users who can have fleet access)
      const usersWithFleets: UserWithFleets[] = usersList
        .filter(
          (u: { role: string }) =>
            u.role === "AGENTE_SEGUIMIENTO" ||
            u.role === "PLANIFICADOR" ||
            u.role === "ADMIN",
        )
        .map(
          (u: {
            id: string;
            name: string;
            role: string;
            fleetPermissions?: Array<{ id: string; name: string }>;
          }) => ({
            id: u.id,
            name: u.name,
            role: u.role,
            fleets: u.fleetPermissions || [],
          }),
        );
      setUsers(usersWithFleets);
    } catch (error) {
      console.error("Error fetching vehicles/users:", error);
    }
  }, [companyId]);

  useEffect(() => {
    fetchFleets();
    fetchVehiclesAndUsers();
  }, [fetchFleets, fetchVehiclesAndUsers, companyId]);

  const handleCreate = async (data: FleetInput) => {
    try {
      const response = await fetch("/api/fleets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId ?? "",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al crear flota");
      }

      await fetchFleets();
      setShowForm(false);
      toast({
        title: "Flota creada",
        description: `La flota "${data.name}" ha sido creada exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al crear flota",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleUpdate = async (data: FleetInput) => {
    if (!editingFleet) return;

    try {
      const response = await fetch(`/api/fleets/${editingFleet.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId ?? "",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al actualizar flota");
      }

      await fetchFleets();
      setEditingFleet(null);
      toast({
        title: "Flota actualizada",
        description: `La flota "${data.name}" ha sido actualizada exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al actualizar flota",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const fleet = fleets.find((f) => f.id === id);

    try {
      const response = await fetch(`/api/fleets/${id}`, {
        method: "DELETE",
        headers: {
          "x-company-id": companyId ?? "",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || error.details || "Error al desactivar la flota",
        );
      }

      await fetchFleets();
      toast({
        title: "Flota desactivada",
        description: fleet
          ? `La flota "${fleet.name}" ha sido desactivada.`
          : "La flota ha sido desactivada.",
      });
    } catch (err) {
      toast({
        title: "Error al desactivar flota",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (!isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (showForm || editingFleet) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-6xl">
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
              initialData={
                editingFleet
                  ? {
                      ...editingFleet,
                      type: (editingFleet.type as FleetInput["type"]) || null,
                    }
                  : undefined
              }
              vehicles={vehicles}
              users={users}
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
                    Descripción
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
                  <tr
                    key={fleet.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-foreground">
                      {fleet.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs truncate">
                      {fleet.description || "-"}
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingFleet(fleet)}
                        disabled={deletingId === fleet.id}
                      >
                        Editar
                      </Button>
                      {fleet.active && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={deletingId === fleet.id}
                            >
                              {deletingId === fleet.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                ¿Desactivar flota?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción desactivará la flota{" "}
                                <strong>{fleet.name}</strong>. Los vehículos y
                                conductores asignados no se verán afectados.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(fleet.id)}
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
        )}
      </div>
    </div>
  );
}

export default function FleetsPage() {
  return (
    <ProtectedPage requiredPermission="fleets:VIEW">
      <FleetsPageContent />
    </ProtectedPage>
  );
}
