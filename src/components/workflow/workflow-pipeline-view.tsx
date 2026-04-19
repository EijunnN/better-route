"use client";

import { GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/auth/can";
import { WorkflowFlowView } from "./workflow-flow-view";
import { useWorkflow } from "./workflow-context";

/**
 * Pipeline view — the canvas IS the editor. Every create/edit/delete happens
 * inside WorkflowFlowView:
 *   - "+ Agregar estado" button sits in the canvas (top-right Panel).
 *   - Click a node to edit it.
 *   - Drag from a node's right handle to another's left handle to create
 *     a transition.
 *   - Hover an edge to reveal a trash button; press Delete to remove a
 *     selected edge or node.
 * The sticky header kept here only carries the title and the "Cambiar
 * plantilla" escape hatch.
 */
export function WorkflowPipelineView({
  onChangeTemplate,
}: {
  onChangeTemplate: () => void;
}) {
  const { state } = useWorkflow();

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <GitBranch className="h-5 w-5" />
              Flujo de entregas
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {state.states.length} estado
              {state.states.length === 1 ? "" : "s"} · {state.transitions.length}{" "}
              transición
              {state.transitions.length === 1 ? "" : "es"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Can perm="company:update">
              <Button variant="outline" size="sm" onClick={onChangeTemplate}>
                Cambiar plantilla
              </Button>
            </Can>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
        <WorkflowFlowView />
        <RequirementsSummary />
        <HelpFootnote />
      </div>
    </div>
  );
}

function RequirementsSummary() {
  const { state } = useWorkflow();
  const counts = {
    photo: state.states.filter((s) => s.requiresPhoto).length,
    signature: state.states.filter((s) => s.requiresSignature).length,
    notes: state.states.filter((s) => s.requiresNotes).length,
    reason: state.states.filter((s) => s.requiresReason).length,
  };
  const total = state.states.length;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
      <span className="font-medium">Requerimientos del flujo:</span>
      <Badge variant="outline" className="gap-1">
        Foto: <strong>{counts.photo}</strong>/{total}
      </Badge>
      <Badge variant="outline" className="gap-1">
        Firma: <strong>{counts.signature}</strong>/{total}
      </Badge>
      <Badge variant="outline" className="gap-1">
        Notas: <strong>{counts.notes}</strong>/{total}
      </Badge>
      <Badge variant="outline" className="gap-1">
        Motivo: <strong>{counts.reason}</strong>/{total}
      </Badge>
    </div>
  );
}

function HelpFootnote() {
  return (
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      <span className="font-medium text-foreground/70">
        Cómo usar el canvas:
      </span>{" "}
      clic en un nodo para editarlo · arrastrar desde el punto derecho de un
      nodo hasta otro para crear una transición · hover sobre una línea para
      borrarla · tecla Delete sobre nodo o línea seleccionados para
      eliminar · botón «+ Agregar estado» arriba a la derecha del canvas.
    </p>
  );
}
