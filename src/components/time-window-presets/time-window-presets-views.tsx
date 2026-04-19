"use client";

import { AlertCircle, Loader2, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/auth/can";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TimeWindowPresetForm } from "./time-window-preset-form";
import { useTimeWindowPresets, TYPE_LABELS, STRICTNESS_LABELS, type TimeWindowPreset } from "./time-window-presets-context";

export function TimeWindowPresetsListView() {
  const { state, actions } = useTimeWindowPresets();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Presets de Ventanas de Tiempo</h1>
          <p className="text-muted-foreground mt-1">
            Administre configuraciones reutilizables de ventanas de tiempo para programación de entregas
          </p>
        </div>
        <Can perm="time_window_preset:create">
          <Button onClick={() => actions.setShowForm(true)}>Crear Preset</Button>
        </Can>
      </div>

      {state.isLoading ? (
        <Card>
          <CardContent className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : state.error ? (
        <ErrorState title="Error al cargar presets" error={state.error} onRetry={actions.fetchPresets} />
      ) : state.presets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No hay presets de ventanas de tiempo registrados.</p>
            <p className="text-sm text-muted-foreground mt-1">Cree su primer preset para comenzar.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Ventana de Tiempo</TableHead>
                <TableHead>Rigurosidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.presets.map((preset) => (
                <TimeWindowPresetRow key={preset.id} preset={preset} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {state.showForm && (
        <TimeWindowPresetForm
          onSubmit={state.editingPreset ? actions.handleUpdate : actions.handleCreate}
          initialData={state.editingPreset || undefined}
          submitLabel={state.editingPreset ? "Actualizar" : "Crear Preset"}
          onCancel={actions.cancelForm}
        />
      )}
    </div>
  );
}

function TimeWindowPresetRow({ preset }: { preset: TimeWindowPreset }) {
  const { state, actions } = useTimeWindowPresets();

  return (
    <TableRow className={state.deletingId === preset.id ? "opacity-50" : ""}>
      <TableCell className="font-medium">{preset.name}</TableCell>
      <TableCell>
        <Badge variant="secondary">{TYPE_LABELS[preset.type] || preset.type}</Badge>
      </TableCell>
      <TableCell className="font-mono text-sm">{actions.formatTimeDisplay(preset)}</TableCell>
      <TableCell>
        <Badge
          variant={preset.strictness === "HARD" ? "destructive" : "outline"}
          className={
            preset.strictness === "SOFT"
              ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400"
              : ""
          }
        >
          {STRICTNESS_LABELS[preset.strictness] || preset.strictness}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant={preset.active ? "default" : "secondary"}
          className={
            preset.active ? "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400" : ""
          }
        >
          {preset.active ? "Activo" : "Inactivo"}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Can perm="time_window_preset:update">
          <Button variant="ghost" size="sm" onClick={() => actions.handleEdit(preset)} disabled={state.deletingId === preset.id}>
            Editar
          </Button>
        </Can>
        <Can perm="time_window_preset:delete">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={state.deletingId === preset.id}
              >
                {state.deletingId === preset.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar preset?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción eliminará permanentemente el preset <strong>{preset.name}</strong>. Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => actions.handleDelete(preset.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Can>
      </TableCell>
    </TableRow>
  );
}
