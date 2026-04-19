"use client";

import { Loader2, Trash2 } from "lucide-react";
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
import { Can } from "@/components/auth/can";
import { ErrorState } from "@/components/ui/error-state";
import { FleetForm } from "./fleet-form";
import { useFleets, type Fleet } from "./fleets-context";
import type { FleetInput } from "@/lib/validations/fleet";

export function FleetsListView() {
  const { state, actions } = useFleets();

  return (
    <div className="flex-1 bg-background p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gestión de Flotas</h1>
            <p className="mt-1 text-sm text-muted-foreground">Administre las flotas de vehículos y conductores</p>
          </div>
          <Can perm="fleet:create">
            <Button onClick={() => actions.setShowForm(true)}>Nueva Flota</Button>
          </Can>
        </div>

        {state.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        ) : state.error ? (
          <ErrorState title="Error al cargar flotas" error={state.error} onRetry={actions.fetchFleets} />
        ) : state.fleets.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
            <p className="text-muted-foreground">No hay flotas registradas. Cree la primera flota.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Descripción</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Estado</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {state.fleets.map((fleet) => (
                  <FleetRow key={fleet.id} fleet={fleet} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FleetRow({ fleet }: { fleet: Fleet }) {
  const { state, actions } = useFleets();

  return (
    <tr className="hover:bg-muted/50 transition-colors">
      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-foreground">{fleet.name}</td>
      <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs truncate">{fleet.description || "-"}</td>
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
        <Can perm="fleet:update">
          <Button variant="ghost" size="sm" onClick={() => actions.setEditingFleet(fleet)} disabled={state.deletingId === fleet.id}>
            Editar
          </Button>
        </Can>
        {fleet.active && (
          <Can perm="fleet:delete">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={state.deletingId === fleet.id}
                >
                  {state.deletingId === fleet.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Desactivar flota?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción desactivará la flota <strong>{fleet.name}</strong>. Los vehículos y conductores asignados no se verán
                    afectados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => actions.handleDelete(fleet.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Desactivar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Can>
        )}
      </td>
    </tr>
  );
}

export function FleetsFormView() {
  const { state, actions } = useFleets();

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{state.editingFleet ? "Editar Flota" : "Nueva Flota"}</h1>
          <p className="text-xs text-muted-foreground">
            {state.editingFleet ? "Actualice la información de la flota" : "Complete el formulario para crear una nueva flota"}
          </p>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <FleetForm
          onSubmit={state.editingFleet ? actions.handleUpdate : actions.handleCreate}
          initialData={
            state.editingFleet
              ? { ...state.editingFleet, type: (state.editingFleet.type as FleetInput["type"]) || null }
              : undefined
          }
          vehicles={state.vehicles}
          users={state.users}
          submitLabel={state.editingFleet ? "Actualizar" : "Crear"}
          onCancel={actions.cancelForm}
        />
      </div>
    </div>
  );
}
