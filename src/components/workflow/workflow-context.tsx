"use client";

import { createContext, use, useCallback, type ReactNode } from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useApiData } from "@/hooks/use-api";
import { useToast } from "@/hooks/use-toast";

// Types matching the DB schema
export type SystemState = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface WorkflowState {
  id: string;
  companyId: string;
  code: string;
  label: string;
  systemState: SystemState;
  color: string;
  position: number;
  isDefault: boolean;
  isTerminal: boolean;
  requiresReason: boolean;
  reasonOptions: string[];
  requiresPhoto: boolean;
  requiresSignature: boolean;
  requiresNotes: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTransition {
  id: string;
  companyId: string;
  fromStateId: string;
  toStateId: string;
  createdAt: string;
}

export interface WorkflowStateInput {
  code: string;
  label: string;
  systemState: SystemState;
  color: string;
  position: number;
  isDefault: boolean;
  isTerminal: boolean;
  requiresReason: boolean;
  reasonOptions: string[];
  requiresPhoto: boolean;
  requiresSignature: boolean;
  requiresNotes: boolean;
}

interface WorkflowContextState {
  states: WorkflowState[];
  transitions: WorkflowTransition[];
  isLoadingStates: boolean;
  isLoadingTransitions: boolean;
}

interface WorkflowActions {
  createState: (data: WorkflowStateInput) => Promise<void>;
  updateState: (id: string, data: WorkflowStateInput) => Promise<void>;
  deleteState: (id: string) => Promise<void>;
  createTransition: (fromStateId: string, toStateId: string) => Promise<void>;
  deleteTransition: (id: string) => Promise<void>;
  refreshStates: () => void;
  refreshTransitions: () => void;
}

interface WorkflowMeta {
  companyId: string | null;
  isReady: boolean;
}

interface WorkflowContextValue {
  state: WorkflowContextState;
  actions: WorkflowActions;
  meta: WorkflowMeta;
}

const WorkflowContext = createContext<WorkflowContextValue | undefined>(undefined);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const { effectiveCompanyId: companyId, isReady } = useCompanyContext();
  const { toast } = useToast();

  const statesUrl = companyId ? `/api/companies/${companyId}/workflow-states` : null;
  const transitionsUrl = companyId ? `/api/companies/${companyId}/workflow-transitions` : null;

  const {
    data: states = [],
    isLoading: isLoadingStates,
    mutate: mutateStates,
  } = useApiData<WorkflowState[]>(statesUrl, companyId);

  const {
    data: transitions = [],
    isLoading: isLoadingTransitions,
    mutate: mutateTransitions,
  } = useApiData<WorkflowTransition[]>(transitionsUrl, companyId);

  const createState = useCallback(
    async (data: WorkflowStateInput) => {
      if (!companyId) return;
      const response = await fetch(`/api/companies/${companyId}/workflow-states`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-company-id": companyId },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Error al crear estado" }));
        throw new Error(error.error || "Error al crear estado");
      }
      await mutateStates();
      toast({ title: "Estado creado", description: `El estado "${data.label}" ha sido creado.` });
    },
    [companyId, mutateStates, toast]
  );

  const updateState = useCallback(
    async (id: string, data: WorkflowStateInput) => {
      if (!companyId) return;
      const response = await fetch(`/api/companies/${companyId}/workflow-states/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-company-id": companyId },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Error al actualizar estado" }));
        throw new Error(error.error || "Error al actualizar estado");
      }
      await mutateStates();
      toast({ title: "Estado actualizado", description: `El estado "${data.label}" ha sido actualizado.` });
    },
    [companyId, mutateStates, toast]
  );

  const deleteState = useCallback(
    async (id: string) => {
      if (!companyId) return;
      const response = await fetch(`/api/companies/${companyId}/workflow-states/${id}`, {
        method: "DELETE",
        headers: { "x-company-id": companyId },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Error al eliminar estado" }));
        throw new Error(error.error || "Error al eliminar estado");
      }
      await Promise.all([mutateStates(), mutateTransitions()]);
      toast({ title: "Estado eliminado", description: "El estado ha sido eliminado." });
    },
    [companyId, mutateStates, mutateTransitions, toast]
  );

  const createTransition = useCallback(
    async (fromStateId: string, toStateId: string) => {
      if (!companyId) return;
      const response = await fetch(`/api/companies/${companyId}/workflow-transitions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-company-id": companyId },
        body: JSON.stringify({ fromStateId, toStateId }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Error al crear transicion" }));
        throw new Error(error.error || "Error al crear transicion");
      }
      await mutateTransitions();
    },
    [companyId, mutateTransitions]
  );

  const deleteTransition = useCallback(
    async (id: string) => {
      if (!companyId) return;
      const response = await fetch(`/api/companies/${companyId}/workflow-transitions/${id}`, {
        method: "DELETE",
        headers: { "x-company-id": companyId },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Error al eliminar transicion" }));
        throw new Error(error.error || "Error al eliminar transicion");
      }
      await mutateTransitions();
    },
    [companyId, mutateTransitions]
  );

  const refreshStates = useCallback(() => {
    mutateStates();
  }, [mutateStates]);

  const refreshTransitions = useCallback(() => {
    mutateTransitions();
  }, [mutateTransitions]);

  const contextState: WorkflowContextState = {
    states: Array.isArray(states) ? [...states].sort((a, b) => a.position - b.position) : [],
    transitions: Array.isArray(transitions) ? transitions : [],
    isLoadingStates,
    isLoadingTransitions,
  };

  const contextActions: WorkflowActions = {
    createState,
    updateState,
    deleteState,
    createTransition,
    deleteTransition,
    refreshStates,
    refreshTransitions,
  };

  const contextMeta: WorkflowMeta = { companyId, isReady };

  return (
    <WorkflowContext value={{ state: contextState, actions: contextActions, meta: contextMeta }}>
      {children}
    </WorkflowContext>
  );
}

export function useWorkflow(): WorkflowContextValue {
  const context = use(WorkflowContext);
  if (context === undefined) {
    throw new Error("useWorkflow must be used within a WorkflowProvider");
  }
  return context;
}
