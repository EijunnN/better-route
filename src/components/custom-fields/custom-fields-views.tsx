"use client";

import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Eye,
  Smartphone,
  FileSpreadsheet,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  useCustomFields,
  FIELD_TYPE_LABELS,
  FIELD_ENTITY_LABELS,
  type FieldDefinition,
} from "./custom-fields-context";
import { FieldDefinitionDialog } from "./field-definition-dialog";

export function CustomFieldsDashboardView() {
  const { state, meta, actions } = useCustomFields();

  if (!meta.isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (state.isLoading) {
    return (
      <div className="flex-1 bg-background p-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        </div>
      </div>
    );
  }

  const hasDefinitions = state.definitions.length > 0;

  return (
    <div className="flex-1 bg-background p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Campos personalizados</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasDefinitions
                ? `${state.definitions.length} campos configurados`
                : "Define campos adicionales para tus pedidos y paradas"}
            </p>
          </div>
          <Button size="sm" onClick={actions.openCreateDialog}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo campo
          </Button>
        </div>

        {/* Content */}
        {hasDefinitions ? (
          <DefinitionsTable definitions={state.definitions} />
        ) : (
          <EmptyState />
        )}
      </div>

      <FieldDefinitionDialog />
    </div>
  );
}

function EmptyState() {
  const { actions } = useCustomFields();

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center text-center py-12 space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ListChecks className="h-6 w-6" />
        </div>
        <div>
          <h3 className="font-semibold">Sin campos personalizados</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Los campos personalizados te permiten agregar informacion adicional a tus pedidos
            y paradas de ruta, como referencias, tipos de servicio, montos, etc.
          </p>
        </div>
        <Button size="sm" onClick={actions.openCreateDialog}>
          <Plus className="h-4 w-4 mr-1.5" />
          Crear primer campo
        </Button>
      </CardContent>
    </Card>
  );
}

function DefinitionsTable({ definitions }: { definitions: FieldDefinition[] }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-medium text-muted-foreground">Campo</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Tipo</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Entidad</th>
              <th className="text-center p-3 font-medium text-muted-foreground">Requerido</th>
              <th className="text-center p-3 font-medium text-muted-foreground">Visibilidad</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {definitions.map((def) => (
              <DefinitionRow key={def.id} definition={def} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DefinitionRow({ definition }: { definition: FieldDefinition }) {
  const { actions } = useCustomFields();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await actions.deleteDefinition(definition.id);
    } catch {
      // toast in context
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/30">
      <td className="p-3">
        <div>
          <span className="font-medium">{definition.label}</span>
          <span className="block text-xs text-muted-foreground font-mono">{definition.code}</span>
        </div>
      </td>
      <td className="p-3">
        <Badge variant="secondary" className="text-[11px]">
          {FIELD_TYPE_LABELS[definition.fieldType]}
        </Badge>
      </td>
      <td className="p-3">
        <span className="text-xs text-muted-foreground">
          {FIELD_ENTITY_LABELS[definition.entity]}
        </span>
      </td>
      <td className="p-3 text-center">
        {definition.required && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600">
            Requerido
          </Badge>
        )}
      </td>
      <td className="p-3">
        <div className="flex items-center justify-center gap-1.5">
          {definition.showInList && (
            <span title="Visible en listado" className="text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
            </span>
          )}
          {definition.showInMobile && (
            <span title="Visible en movil" className="text-muted-foreground">
              <Smartphone className="h-3.5 w-3.5" />
            </span>
          )}
          {definition.showInCsv && (
            <span title="Incluido en CSV" className="text-muted-foreground">
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </td>
      <td className="p-3">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => actions.openEditDialog(definition)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar campo</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta accion eliminara el campo{" "}
                  <strong>{definition.label}</strong> y todos los datos asociados.
                  Esta accion no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </td>
    </tr>
  );
}
