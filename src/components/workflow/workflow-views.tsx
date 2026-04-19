"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { useCan } from "@/components/auth/can";
import { WorkflowPipelineView } from "./workflow-pipeline-view";
import { WorkflowTemplatePicker } from "./workflow-template-picker";
import { useWorkflow } from "./workflow-context";

/**
 * Orchestrator for the `/workflow` page. Chooses between:
 *   - template picker (no states yet, or user asked to change template)
 *   - pipeline view (normal editing of states + transitions).
 *
 * Read-only users (lack `company:update`) also see the pipeline view, but
 * every mutating action inside it is gated via <Can>.
 */
export function WorkflowDashboardView() {
  const { state, actions, meta } = useWorkflow();
  const canEdit = useCan("company:update");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  if (!meta.isReady || (state.isLoadingStates && state.states.length === 0)) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="mx-auto w-full max-w-4xl p-8">
        <ErrorState
          title="Error al cargar flujo de entregas"
          error={state.error}
          onRetry={actions.refreshStates}
        />
      </div>
    );
  }

  const hasStates = state.states.length > 0;

  // Users without edit access and no states yet see a gentle empty state
  // instead of a template picker full of disabled buttons.
  if (!hasStates && !canEdit) {
    return (
      <div className="mx-auto w-full max-w-4xl p-8 text-center">
        <h1 className="text-xl font-semibold">Flujo de entregas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta empresa todavía no tiene un flujo configurado. Contacta al
          administrador para que lo configure.
        </p>
      </div>
    );
  }

  if (!hasStates || showTemplatePicker) {
    return (
      <WorkflowTemplatePicker
        hasExistingStates={hasStates}
        existingCount={state.states.length}
        onCancel={hasStates ? () => setShowTemplatePicker(false) : undefined}
      />
    );
  }

  return (
    <WorkflowPipelineView
      onChangeTemplate={() => setShowTemplatePicker(true)}
    />
  );
}
