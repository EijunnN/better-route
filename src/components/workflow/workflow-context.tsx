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

export type TemplateType = "delivery" | "paqueteria" | "b2b";

interface TemplateStateConfig {
  code: string;
  label: string;
  systemState: SystemState;
  color: string;
  position: number;
  isDefault?: boolean;
  isTerminal?: boolean;
  requiresPhoto?: boolean;
  requiresSignature?: boolean;
  requiresNotes?: boolean;
  requiresReason?: boolean;
  reasonOptions?: string[];
}

interface TemplateConfig {
  name: string;
  description: string;
  states: TemplateStateConfig[];
  transitions: [string, string][];
}

export const WORKFLOW_TEMPLATES: Record<TemplateType, TemplateConfig> = {
  delivery: {
    name: "Delivery de ultima milla",
    description: "Entregas directas al cliente final",
    states: [
      { code: "PENDING", label: "Pendiente", systemState: "PENDING", color: "#6B7280", position: 0, isDefault: true },
      { code: "EN_CAMINO", label: "En camino", systemState: "IN_PROGRESS", color: "#3B82F6", position: 1 },
      { code: "ENTREGADO", label: "Entregado", systemState: "COMPLETED", color: "#16A34A", position: 2, isTerminal: true, requiresPhoto: true },
      { code: "NO_ENTREGADO", label: "No entregado", systemState: "FAILED", color: "#DC4840", position: 3, isTerminal: true, requiresReason: true, requiresPhoto: true, reasonOptions: ["Cliente ausente", "Direccion incorrecta", "Paquete danado", "Cliente rechazo", "Zona insegura", "Reprogramado", "Otro"] },
      { code: "OMITIDO", label: "Omitido", systemState: "CANCELLED", color: "#9CA3AF", position: 4, isTerminal: true },
    ],
    transitions: [
      ["PENDING", "EN_CAMINO"], ["PENDING", "NO_ENTREGADO"], ["PENDING", "OMITIDO"],
      ["EN_CAMINO", "ENTREGADO"], ["EN_CAMINO", "NO_ENTREGADO"], ["EN_CAMINO", "OMITIDO"], ["EN_CAMINO", "PENDING"],
      ["NO_ENTREGADO", "PENDING"], ["NO_ENTREGADO", "OMITIDO"],
    ],
  },
  paqueteria: {
    name: "Paqueteria",
    description: "Envios y paquetes con seguimiento",
    states: [
      { code: "PENDING", label: "Pendiente", systemState: "PENDING", color: "#6B7280", position: 0, isDefault: true },
      { code: "EN_TRANSITO", label: "En transito", systemState: "IN_PROGRESS", color: "#3B82F6", position: 1 },
      { code: "ENTREGA_PARCIAL", label: "Entrega parcial", systemState: "IN_PROGRESS", color: "#F59E0B", position: 2, requiresNotes: true },
      { code: "ENTREGADO", label: "Entregado", systemState: "COMPLETED", color: "#16A34A", position: 3, isTerminal: true, requiresPhoto: true, requiresSignature: true },
      { code: "DEVUELTO", label: "Devuelto", systemState: "FAILED", color: "#DC4840", position: 4, isTerminal: true, requiresReason: true, reasonOptions: ["Cliente ausente", "Direccion incorrecta", "Rechazado", "Danado", "Otro"] },
      { code: "CANCELADO", label: "Cancelado", systemState: "CANCELLED", color: "#9CA3AF", position: 5, isTerminal: true },
    ],
    transitions: [
      ["PENDING", "EN_TRANSITO"], ["PENDING", "CANCELADO"],
      ["EN_TRANSITO", "ENTREGADO"], ["EN_TRANSITO", "ENTREGA_PARCIAL"], ["EN_TRANSITO", "DEVUELTO"], ["EN_TRANSITO", "PENDING"],
      ["ENTREGA_PARCIAL", "ENTREGADO"], ["ENTREGA_PARCIAL", "DEVUELTO"],
      ["DEVUELTO", "PENDING"],
    ],
  },
  b2b: {
    name: "Distribucion B2B",
    description: "Entregas a negocios y empresas",
    states: [
      { code: "PENDING", label: "Pendiente", systemState: "PENDING", color: "#6B7280", position: 0, isDefault: true },
      { code: "DESCARGANDO", label: "Descargando", systemState: "IN_PROGRESS", color: "#3B82F6", position: 1 },
      { code: "FACTURA_FIRMADA", label: "Factura firmada", systemState: "COMPLETED", color: "#16A34A", position: 2, isTerminal: true, requiresPhoto: true },
      { code: "RECHAZO", label: "Rechazo", systemState: "FAILED", color: "#DC4840", position: 3, isTerminal: true, requiresReason: true, requiresNotes: true, reasonOptions: ["Producto incorrecto", "Cantidad incorrecta", "Danado", "Sin orden de compra", "Otro"] },
      { code: "SIN_ACCESO", label: "Sin acceso", systemState: "FAILED", color: "#F97316", position: 4, isTerminal: true, requiresReason: true, reasonOptions: ["Local cerrado", "Direccion incorrecta", "Zona restringida", "Otro"] },
    ],
    transitions: [
      ["PENDING", "DESCARGANDO"], ["PENDING", "SIN_ACCESO"],
      ["DESCARGANDO", "FACTURA_FIRMADA"], ["DESCARGANDO", "RECHAZO"], ["DESCARGANDO", "PENDING"],
      ["SIN_ACCESO", "PENDING"],
    ],
  },
};

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
  createFromTemplate: (template: TemplateType) => Promise<void>;
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

  const createFromTemplate = useCallback(
    async (templateType: TemplateType) => {
      if (!companyId) return;
      const template = WORKFLOW_TEMPLATES[templateType];

      // Delete all existing states (which cascades transitions via soft-delete)
      const currentStates = Array.isArray(states) ? states : [];
      for (const s of currentStates) {
        await fetch(`/api/companies/${companyId}/workflow-states/${s.id}`, {
          method: "DELETE",
          headers: { "x-company-id": companyId },
        });
      }

      // Create all template states
      const codeToId: Record<string, string> = {};
      for (const stateConfig of template.states) {
        const response = await fetch(`/api/companies/${companyId}/workflow-states`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-company-id": companyId },
          body: JSON.stringify({
            code: stateConfig.code,
            label: stateConfig.label,
            systemState: stateConfig.systemState,
            color: stateConfig.color,
            position: stateConfig.position,
            isDefault: stateConfig.isDefault ?? false,
            isTerminal: stateConfig.isTerminal ?? false,
            requiresPhoto: stateConfig.requiresPhoto ?? false,
            requiresSignature: stateConfig.requiresSignature ?? false,
            requiresNotes: stateConfig.requiresNotes ?? false,
            requiresReason: stateConfig.requiresReason ?? false,
            reasonOptions: stateConfig.reasonOptions ?? [],
          }),
        });
        if (!response.ok) {
          throw new Error(`Error al crear estado ${stateConfig.label}`);
        }
        const result = await response.json();
        const created = result.data;
        codeToId[stateConfig.code] = created.id;
      }

      // Create all transitions
      for (const [fromCode, toCode] of template.transitions) {
        const fromId = codeToId[fromCode];
        const toId = codeToId[toCode];
        if (fromId && toId) {
          await fetch(`/api/companies/${companyId}/workflow-transitions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-company-id": companyId },
            body: JSON.stringify({ fromStateId: fromId, toStateId: toId }),
          });
        }
      }

      await Promise.all([mutateStates(), mutateTransitions()]);
      toast({ title: "Plantilla aplicada", description: `Se configuro el flujo "${template.name}" con ${template.states.length} estados.` });
    },
    [companyId, states, mutateStates, mutateTransitions, toast]
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
    createFromTemplate,
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
