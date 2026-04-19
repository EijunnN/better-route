"use client";

import { useState } from "react";
import { ArrowDown, GitBranch, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/auth/can";
import { WorkflowStateCard } from "./workflow-state-card";
import { WorkflowStateDialog } from "./workflow-state-dialog";
import { WorkflowTransitionsEditor } from "./workflow-transitions-editor";
import { useWorkflow } from "./workflow-context";

export function WorkflowPipelineView({
  onChangeTemplate,
}: {
  onChangeTemplate: () => void;
}) {
  const { state } = useWorkflow();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transitionsExpanded, setTransitionsExpanded] = useState(false);

  const toggleExpand = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="flex flex-col">
      {/* Sticky header — matches /configuracion. */}
      <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
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
            <Can perm="company:update">
              <Button size="sm" onClick={() => setAddDialogOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Agregar estado
              </Button>
            </Can>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
        <section aria-label="Pipeline de estados">
          <div className="space-y-0">
            {state.states.map((ws, idx) => (
              <div key={ws.id}>
                <WorkflowStateCard
                  workflowState={ws}
                  isExpanded={expandedId === ws.id}
                  onToggleExpand={() => toggleExpand(ws.id)}
                />
                {idx < state.states.length - 1 && (
                  <div className="flex justify-center py-1">
                    <ArrowDown
                      className="h-4 w-4 text-muted-foreground/40"
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {state.states.length >= 2 && (
          <WorkflowTransitionsEditor
            expanded={transitionsExpanded}
            onToggle={() => setTransitionsExpanded((v) => !v)}
          />
        )}

        {/* Summary strip — quick-glance count of requirements across states. */}
        <RequirementsSummary />
      </div>

      <WorkflowStateDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        editingState={null}
      />
    </div>
  );
}

/**
 * Compact footer showing how many states need photo / signature / notes /
 * reason. Helps the planner verify at a glance that the workflow is
 * well-formed ("at least one FAILED state with reason required").
 */
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
