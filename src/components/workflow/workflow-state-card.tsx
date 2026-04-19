"use client";

import { useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileSignature,
  Loader2,
  MessageCircle,
  NotepadText,
  Pencil,
  Play,
  SkipForward,
  Trash2,
  XCircle,
} from "lucide-react";
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
import { Card } from "@/components/ui/card";
import { WorkflowStateDialog } from "./workflow-state-dialog";
import type { SystemState, WorkflowState } from "./workflow-context";
import { useWorkflow } from "./workflow-context";

const SYSTEM_STATE_LABELS: Record<SystemState, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En progreso",
  COMPLETED: "Completado",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
};

const SYSTEM_STATE_ICONS: Record<SystemState, typeof Clock> = {
  PENDING: Clock,
  IN_PROGRESS: Play,
  COMPLETED: CheckCircle2,
  FAILED: XCircle,
  CANCELLED: SkipForward,
};

const SYSTEM_STATE_BADGE_COLORS: Record<SystemState, string> = {
  PENDING: "bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-400",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-800/40 dark:text-blue-400",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-800/40 dark:text-green-400",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-800/40 dark:text-red-400",
  CANCELLED: "bg-amber-100 text-amber-700 dark:bg-amber-800/40 dark:text-amber-400",
};

const REQUIREMENTS = [
  { key: "requiresPhoto" as const, icon: Camera, label: "Foto" },
  { key: "requiresSignature" as const, icon: FileSignature, label: "Firma" },
  { key: "requiresNotes" as const, icon: NotepadText, label: "Notas" },
  { key: "requiresReason" as const, icon: MessageCircle, label: "Motivo" },
];

export function WorkflowStateCard({
  workflowState,
  isExpanded,
  onToggleExpand,
}: {
  workflowState: WorkflowState;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const { state, actions } = useWorkflow();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Transitions outgoing from this state
  const outgoing = state.transitions
    .filter((t) => t.fromStateId === workflowState.id)
    .map((t) => state.states.find((s) => s.id === t.toStateId))
    .filter((s): s is WorkflowState => !!s);

  const activeRequirements = REQUIREMENTS.filter((r) => workflowState[r.key]);
  const SystemIcon = SYSTEM_STATE_ICONS[workflowState.systemState];

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
    <Card
      className={`transition-all ${
        isExpanded ? "ring-1 ring-primary/30" : "hover:bg-muted/30"
      }`}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 p-4 text-left"
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
      >
        <span
          className="h-3.5 w-3.5 shrink-0 rounded-full"
          style={{ backgroundColor: workflowState.color }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {workflowState.label}
        </span>

        <div className="flex shrink-0 items-center gap-2">
          {activeRequirements.length > 0 && (
            <div className="flex items-center gap-1" aria-label="Requerimientos">
              {activeRequirements.map((r) => (
                <r.icon
                  key={r.key}
                  className="h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
              ))}
            </div>
          )}
          {workflowState.isTerminal && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              Terminal
            </Badge>
          )}
          {workflowState.isDefault && (
            <Badge
              variant="outline"
              className="border-primary/50 px-1.5 py-0 text-[10px] text-primary"
            >
              Default
            </Badge>
          )}
          <Badge
            variant="secondary"
            className={`px-1.5 py-0 text-[10px] ${SYSTEM_STATE_BADGE_COLORS[workflowState.systemState]}`}
          >
            {SYSTEM_STATE_LABELS[workflowState.systemState]}
          </Badge>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="space-y-4 border-t px-4 pb-4 pt-3">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
            <DetailRow
              label="Código"
              value={
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {workflowState.code}
                </code>
              }
            />
            <DetailRow
              label="Estado del sistema"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <SystemIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  {SYSTEM_STATE_LABELS[workflowState.systemState]}
                </span>
              }
            />
            <DetailRow
              label="Posición"
              value={<span className="tabular-nums">{workflowState.position}</span>}
            />
            <DetailRow
              label="Requerimientos"
              value={
                activeRequirements.length === 0 ? (
                  <span className="text-muted-foreground">Ninguno</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {activeRequirements.map((r) => (
                      <Badge key={r.key} variant="secondary" className="gap-1">
                        <r.icon className="h-3 w-3" />
                        {r.label}
                      </Badge>
                    ))}
                  </div>
                )
              }
            />
          </dl>

          {workflowState.requiresReason &&
            workflowState.reasonOptions.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs font-medium">Motivos disponibles</p>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {workflowState.reasonOptions.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              </div>
            )}

          <div>
            <p className="mb-2 text-xs font-medium">Puede transicionar a</p>
            {outgoing.length === 0 ? (
              <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5" />
                Sin transiciones configuradas
                {!workflowState.isTerminal && (
                  <span>· Configura desde &ldquo;Transiciones permitidas&rdquo;</span>
                )}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {outgoing.map((s) => (
                  <Badge key={s.id} variant="outline" className="gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                      aria-hidden="true"
                    />
                    {s.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <Can perm="company:update" fallback={<div />}>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                    )}
                    Eliminar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminar estado</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción eliminará el estado{" "}
                      <strong>{workflowState.label}</strong> y todas sus
                      transiciones asociadas. No se puede deshacer.
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
            </Can>

            <Can perm="company:update">
              <Button
                size="sm"
                onClick={() => setEditDialogOpen(true)}
                disabled={isDeleting}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Editar
              </Button>
            </Can>
          </div>
        </div>
      )}

      <WorkflowStateDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editingState={workflowState}
      />
    </Card>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
