"use client";

import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ProtectedPage } from "@/components/auth/protected-page";
import {
  TimeWindowPresetForm,
  type TimeWindowPresetFormData,
} from "@/components/time-window-presets/time-window-preset-form";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useToast } from "@/hooks/use-toast";
import type {
  TIME_WINDOW_STRICTNESS,
  TIME_WINDOW_TYPES,
} from "@/lib/validations/time-window-preset";

interface TimeWindowPreset {
  id: string;
  name: string;
  type: (typeof TIME_WINDOW_TYPES)[number];
  startTime: string | null;
  endTime: string | null;
  exactTime: string | null;
  toleranceMinutes: number | null;
  strictness: (typeof TIME_WINDOW_STRICTNESS)[number];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  SHIFT: "Turno",
  RANGE: "Rango",
  EXACT: "Exacto",
};

const STRICTNESS_LABELS: Record<string, string> = {
  HARD: "Estricto",
  SOFT: "Flexible",
};

function TimeWindowPresetsPageContent() {
  const { effectiveCompanyId: companyId, isReady } = useCompanyContext();
  const { toast } = useToast();
  const [presets, setPresets] = useState<TimeWindowPreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPreset, setEditingPreset] = useState<TimeWindowPreset | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchPresets = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/time-window-presets", {
        headers: { "x-company-id": companyId ?? "" },
      });
      const result = await response.json();
      setPresets(result.data || []);
    } catch (error) {
      console.error("Error al cargar presets:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los presets",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const handleCreate = async (data: TimeWindowPresetFormData) => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/time-window-presets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId ?? "",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al crear el preset");
      }

      await fetchPresets();
      setShowForm(false);
      toast({
        title: "Preset creado",
        description: `El preset "${data.name}" ha sido creado exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al crear preset",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleUpdate = async (data: TimeWindowPresetFormData) => {
    if (!editingPreset || !companyId) return;

    try {
      const response = await fetch(
        `/api/time-window-presets/${editingPreset.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-company-id": companyId ?? "",
          },
          body: JSON.stringify({ ...data, id: editingPreset.id }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al actualizar el preset");
      }

      await fetchPresets();
      setEditingPreset(null);
      setShowForm(false);
      toast({
        title: "Preset actualizado",
        description: `El preset "${data.name}" ha sido actualizado exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al actualizar preset",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleEdit = (preset: TimeWindowPreset) => {
    setEditingPreset(preset);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!companyId) return;
    setDeletingId(id);
    const preset = presets.find((p) => p.id === id);

    try {
      const response = await fetch(`/api/time-window-presets/${id}`, {
        method: "DELETE",
        headers: { "x-company-id": companyId ?? "" },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al eliminar el preset");
      }

      await fetchPresets();
      toast({
        title: "Preset eliminado",
        description: preset
          ? `El preset "${preset.name}" ha sido eliminado.`
          : "El preset ha sido eliminado.",
      });
    } catch (err) {
      toast({
        title: "Error al eliminar preset",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingPreset(null);
  };

  const formatTimeDisplay = (preset: TimeWindowPreset) => {
    if (preset.type === "EXACT") {
      return `${preset.exactTime} ±${preset.toleranceMinutes}min`;
    }
    return `${preset.startTime} - ${preset.endTime}`;
  };

  if (!isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Presets de Ventanas de Tiempo
          </h1>
          <p className="text-muted-foreground mt-1">
            Administre configuraciones reutilizables de ventanas de tiempo para
            programación de entregas
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>Crear Preset</Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : presets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No hay presets de ventanas de tiempo registrados.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Cree su primer preset para comenzar.
            </p>
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
              {presets.map((preset) => (
                <TableRow
                  key={preset.id}
                  className={deletingId === preset.id ? "opacity-50" : ""}
                >
                  <TableCell className="font-medium">{preset.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {TYPE_LABELS[preset.type] || preset.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatTimeDisplay(preset)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        preset.strictness === "HARD" ? "destructive" : "outline"
                      }
                      className={
                        preset.strictness === "SOFT"
                          ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400"
                          : ""
                      }
                    >
                      {STRICTNESS_LABELS[preset.strictness] ||
                        preset.strictness}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={preset.active ? "default" : "secondary"}
                      className={
                        preset.active
                          ? "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400"
                          : ""
                      }
                    >
                      {preset.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(preset)}
                      disabled={deletingId === preset.id}
                    >
                      Editar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={deletingId === preset.id}
                        >
                          {deletingId === preset.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Eliminar preset?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción eliminará permanentemente el preset{" "}
                            <strong>{preset.name}</strong>. Esta acción no se
                            puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(preset.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {showForm && (
        <TimeWindowPresetForm
          onSubmit={editingPreset ? handleUpdate : handleCreate}
          initialData={editingPreset || undefined}
          submitLabel={editingPreset ? "Actualizar" : "Crear Preset"}
          onCancel={handleCloseForm}
        />
      )}
    </div>
  );
}

export default function TimeWindowPresetsPage() {
  return (
    <ProtectedPage requiredPermission="time_window_presets:VIEW">
      <TimeWindowPresetsPageContent />
    </ProtectedPage>
  );
}
