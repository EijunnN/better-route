"use client";

import { useState } from "react";
import {
  Camera,
  FileSignature,
  MessageCircle,
  NotepadText,
  Pencil,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useWorkflow, type WorkflowState, type SystemState } from "./workflow-context";
import { WorkflowStateDialog } from "./workflow-state-dialog";

const SYSTEM_STATE_LABELS: Record<SystemState, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En progreso",
  COMPLETED: "Completado",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
};

const SYSTEM_STATE_COLORS: Record<SystemState, string> = {
  PENDING: "bg-gray-100 text-gray-800 dark:bg-gray-800/30 dark:text-gray-400",
  IN_PROGRESS: "bg-blue-100 text-blue-800 dark:bg-blue-800/30 dark:text-blue-400",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-400",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-800/30 dark:text-red-400",
  CANCELLED: "bg-amber-100 text-amber-800 dark:bg-amber-800/30 dark:text-amber-400",
};

export function WorkflowDashboardView() {
  const { state, meta } = useWorkflow();

  if (!meta.isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 bg-background p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Estados de entrega</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure los estados y transiciones del workflow de entrega
          </p>
        </div>

        {state.isLoadingStates ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        ) : (
          <>
            <WorkflowStatesSection />
            <WorkflowTransitionsSection />
          </>
        )}
      </div>
    </div>
  );
}

function WorkflowStatesSection() {
  const { state } = useWorkflow();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingState, setEditingState] = useState<WorkflowState | null>(null);

  const handleEdit = (ws: WorkflowState) => {
    setEditingState(ws);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingState(null);
    setDialogOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg font-semibold">Estados</CardTitle>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Agregar estado
          </Button>
        </CardHeader>
        <CardContent>
          {state.states.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No hay estados configurados. Agregue el primer estado de entrega.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {state.states.map((ws) => (
                <WorkflowStateRow key={ws.id} workflowState={ws} onEdit={handleEdit} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <WorkflowStateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingState={editingState}
      />
    </>
  );
}

function WorkflowStateRow({
  workflowState,
  onEdit,
}: {
  workflowState: WorkflowState;
  onEdit: (ws: WorkflowState) => void;
}) {
  const { actions } = useWorkflow();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await actions.deleteState(workflowState.id);
    } catch {
      // toast handled in context
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/30">
      <span className="text-xs font-mono text-muted-foreground w-6 text-center">
        {workflowState.position}
      </span>

      <span
        className="h-3.5 w-3.5 rounded-full shrink-0"
        style={{ backgroundColor: workflowState.color }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{workflowState.label}</span>
          <span className="text-xs font-mono text-muted-foreground">{workflowState.code}</span>
        </div>
      </div>

      <Badge variant="secondary" className={`text-[11px] ${SYSTEM_STATE_COLORS[workflowState.systemState]}`}>
        {SYSTEM_STATE_LABELS[workflowState.systemState]}
      </Badge>

      <div className="flex items-center gap-1.5">
        {workflowState.requiresPhoto && (
          <span title="Requiere foto"><Camera className="h-3.5 w-3.5 text-muted-foreground" /></span>
        )}
        {workflowState.requiresReason && (
          <span title="Requiere motivo"><MessageCircle className="h-3.5 w-3.5 text-muted-foreground" /></span>
        )}
        {workflowState.requiresSignature && (
          <span title="Requiere firma"><FileSignature className="h-3.5 w-3.5 text-muted-foreground" /></span>
        )}
        {workflowState.requiresNotes && (
          <span title="Requiere notas"><NotepadText className="h-3.5 w-3.5 text-muted-foreground" /></span>
        )}
      </div>

      {workflowState.isTerminal && (
        <Badge variant="outline" className="text-[11px]">Terminal</Badge>
      )}
      {workflowState.isDefault && (
        <Badge variant="outline" className="text-[11px] border-primary/50 text-primary">Por defecto</Badge>
      )}

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(workflowState)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar estado</AlertDialogTitle>
              <AlertDialogDescription>
                Esta accion eliminara el estado <strong>{workflowState.label}</strong> y todas sus transiciones asociadas. Esta accion no se puede deshacer.
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
    </div>
  );
}

function WorkflowTransitionsSection() {
  const { state, actions } = useWorkflow();
  const [updatingCells, setUpdatingCells] = useState<Set<string>>(new Set());

  if (state.states.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Transiciones permitidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Necesita al menos 2 estados para configurar transiciones.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const findTransition = (fromId: string, toId: string) => {
    return state.transitions.find((t) => t.fromStateId === fromId && t.toStateId === toId);
  };

  const handleToggle = async (fromId: string, toId: string) => {
    const cellKey = `${fromId}-${toId}`;
    setUpdatingCells((prev) => new Set(prev).add(cellKey));

    try {
      const existing = findTransition(fromId, toId);
      if (existing) {
        await actions.deleteTransition(existing.id);
      } else {
        await actions.createTransition(fromId, toId);
      }
    } catch {
      // toast handled in context
    } finally {
      setUpdatingCells((prev) => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Transiciones permitidas</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b p-2 text-left text-xs font-medium text-muted-foreground w-40">
                  De / A
                </th>
                {state.states.map((toState) => (
                  <th key={toState.id} className="border-b p-2 text-center text-xs font-medium min-w-[80px]">
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: toState.color }}
                      />
                      <span className="truncate max-w-[70px]">{toState.label}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.states.map((fromState) => {
                const isFromTerminal = fromState.isTerminal;
                return (
                  <tr key={fromState.id} className="hover:bg-muted/30">
                    <td className="border-b p-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: fromState.color }}
                        />
                        <span className="font-medium truncate">{fromState.label}</span>
                      </div>
                    </td>
                    {state.states.map((toState) => {
                      const isSelf = fromState.id === toState.id;
                      const isDisabled = isSelf || isFromTerminal;
                      const transition = findTransition(fromState.id, toState.id);
                      const cellKey = `${fromState.id}-${toState.id}`;
                      const isUpdating = updatingCells.has(cellKey);

                      return (
                        <td key={toState.id} className="border-b p-2 text-center">
                          {isDisabled ? (
                            <span className="text-muted-foreground/30">--</span>
                          ) : isUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                          ) : (
                            <Checkbox
                              checked={!!transition}
                              onCheckedChange={() => handleToggle(fromState.id, toState.id)}
                              className="mx-auto"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Los estados terminales no pueden tener transiciones de salida. La diagonal esta bloqueada (un estado no puede transicionar a si mismo).
        </p>
      </CardContent>
    </Card>
  );
}
