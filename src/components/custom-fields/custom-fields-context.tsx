"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { useApiData } from "@/hooks/use-api";
import { useToast } from "@/hooks/use-toast";

export type FieldType = "text" | "number" | "select" | "date" | "currency" | "phone" | "email" | "boolean";
export type FieldEntity = "orders" | "route_stops";

export interface FieldDefinition {
  id: string;
  companyId: string;
  entity: FieldEntity;
  code: string;
  label: string;
  fieldType: FieldType;
  required: boolean;
  placeholder: string | null;
  options: string[] | null;
  defaultValue: string | null;
  position: number;
  showInList: boolean;
  showInMobile: boolean;
  showInCsv: boolean;
  validationRules: Record<string, unknown> | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FieldDefinitionInput {
  code: string;
  label: string;
  entity: FieldEntity;
  fieldType: FieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  defaultValue?: string;
  position: number;
  showInList: boolean;
  showInMobile: boolean;
  showInCsv: boolean;
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Texto",
  number: "Número",
  select: "Selección",
  date: "Fecha",
  currency: "Moneda",
  phone: "Teléfono",
  email: "Email",
  boolean: "Sí/No",
};

export const FIELD_ENTITY_LABELS: Record<FieldEntity, string> = {
  orders: "Pedidos",
  route_stops: "Entregas",
};

interface CustomFieldsState {
  definitions: FieldDefinition[];
  isLoading: boolean;
  error: string | null;
  isSubmitting: boolean;
  selectedDefinition: FieldDefinition | null;
  showDialog: boolean;
  dialogMode: "create" | "edit";
  /** Pre-selected entity when opening the dialog in create mode from a tab. */
  defaultEntity: FieldEntity;
}

interface CustomFieldsActions {
  createDefinition: (data: FieldDefinitionInput) => Promise<void>;
  updateDefinition: (id: string, data: FieldDefinitionInput) => Promise<void>;
  deleteDefinition: (id: string) => Promise<void>;
  toggleActive: (definition: FieldDefinition, active: boolean) => Promise<void>;
  reorder: (definition: FieldDefinition, direction: "up" | "down") => Promise<void>;
  openCreateDialog: (defaultEntity?: FieldEntity) => void;
  openEditDialog: (definition: FieldDefinition) => void;
  closeDialog: () => void;
  refreshDefinitions: () => void;
}

interface CustomFieldsMeta {
  companyId: string | null;
  isReady: boolean;
}

interface CustomFieldsContextValue {
  state: CustomFieldsState;
  actions: CustomFieldsActions;
  meta: CustomFieldsMeta;
}

const CustomFieldsContext = createContext<CustomFieldsContextValue | undefined>(undefined);

export function CustomFieldsProvider({ children }: { children: ReactNode }) {
  const { effectiveCompanyId: companyId, isReady } = useCompanyContext();
  const { toast } = useToast();

  const [selectedDefinition, setSelectedDefinition] = useState<FieldDefinition | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [defaultEntity, setDefaultEntity] = useState<FieldEntity>("orders");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const definitionsUrl = companyId ? `/api/companies/${companyId}/field-definitions` : null;

  const {
    data: definitions = [],
    isLoading,
    error: definitionsError,
    mutate: mutateDefinitions,
  } = useApiData<FieldDefinition[]>(definitionsUrl, companyId);

  const createDefinition = async (data: FieldDefinitionInput) => {
    if (!companyId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/companies/${companyId}/field-definitions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-company-id": companyId },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Error al crear campo" }));
        throw new Error(error.error || "Error al crear campo");
      }
      await mutateDefinitions();
      toast({ title: "Campo creado", description: `El campo "${data.label}" ha sido creado.` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateDefinition = async (id: string, data: FieldDefinitionInput) => {
    if (!companyId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/companies/${companyId}/field-definitions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-company-id": companyId },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Error al actualizar campo" }));
        throw new Error(error.error || "Error al actualizar campo");
      }
      await mutateDefinitions();
      toast({ title: "Campo actualizado", description: `El campo "${data.label}" ha sido actualizado.` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteDefinition = async (id: string) => {
    if (!companyId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/companies/${companyId}/field-definitions/${id}`, {
        method: "DELETE",
        headers: { "x-company-id": companyId },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Error al archivar campo" }));
        throw new Error(error.error || "Error al archivar campo");
      }
      await mutateDefinitions();
      toast({ title: "Campo archivado", description: "El campo ya no se usará en nuevos pedidos." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleActive = async (definition: FieldDefinition, active: boolean) => {
    if (!companyId) return;
    const response = await fetch(`/api/companies/${companyId}/field-definitions/${definition.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-company-id": companyId },
      body: JSON.stringify({ active }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Error al cambiar estado" }));
      throw new Error(error.error || "Error al cambiar estado");
    }
    await mutateDefinitions();
    toast({
      title: active ? "Campo reactivado" : "Campo archivado",
      description: active
        ? `"${definition.label}" vuelve a estar disponible.`
        : `"${definition.label}" ya no aparecerá en formularios nuevos.`,
    });
  };

  // Reorder swaps `position` with the previous/next sibling in the same entity.
  // Two PATCH calls because we don't have a batch endpoint — good enough for
  // a list of <50 fields and avoids adding a new API surface.
  const reorder = async (definition: FieldDefinition, direction: "up" | "down") => {
    if (!companyId) return;
    const list = Array.isArray(definitions) ? definitions : [];
    const siblings = list
      .filter((d) => d.entity === definition.entity && d.active === definition.active)
      .sort((a, b) => a.position - b.position);
    const idx = siblings.findIndex((d) => d.id === definition.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return;
    const other = siblings[swapIdx];

    const patch = async (id: string, position: number) =>
      fetch(`/api/companies/${companyId}/field-definitions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-company-id": companyId },
        body: JSON.stringify({ position }),
      });

    const [a, b] = await Promise.all([
      patch(definition.id, other.position),
      patch(other.id, definition.position),
    ]);
    if (!a.ok || !b.ok) {
      throw new Error("Error al reordenar campos");
    }
    await mutateDefinitions();
  };

  const openCreateDialog = (entity?: FieldEntity) => {
    setSelectedDefinition(null);
    setDefaultEntity(entity ?? "orders");
    setDialogMode("create");
    setShowDialog(true);
  };

  const openEditDialog = (definition: FieldDefinition) => {
    setSelectedDefinition(definition);
    setDialogMode("edit");
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setSelectedDefinition(null);
  };

  const refreshDefinitions = () => {
    mutateDefinitions();
  };

  const contextState: CustomFieldsState = {
    definitions: Array.isArray(definitions) ? [...definitions].sort((a, b) => a.position - b.position) : [],
    isLoading,
    error: definitionsError ? (definitionsError instanceof Error ? definitionsError.message : "Error al cargar campos personalizados") : null,
    isSubmitting,
    selectedDefinition,
    showDialog,
    dialogMode,
    defaultEntity,
  };

  const contextActions: CustomFieldsActions = {
    createDefinition,
    updateDefinition,
    deleteDefinition,
    toggleActive,
    reorder,
    openCreateDialog,
    openEditDialog,
    closeDialog,
    refreshDefinitions,
  };

  const contextMeta: CustomFieldsMeta = { companyId, isReady };

  return (
    <CustomFieldsContext value={{ state: contextState, actions: contextActions, meta: contextMeta }}>
      {children}
    </CustomFieldsContext>
  );
}

export function useCustomFields(): CustomFieldsContextValue {
  const context = use(CustomFieldsContext);
  if (context === undefined) {
    throw new Error("useCustomFields must be used within a CustomFieldsProvider");
  }
  return context;
}
