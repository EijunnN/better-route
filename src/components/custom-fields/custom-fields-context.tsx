"use client";

import { createContext, use, useCallback, useState, type ReactNode } from "react";
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
  number: "Numero",
  select: "Seleccion",
  date: "Fecha",
  currency: "Moneda",
  phone: "Telefono",
  email: "Email",
  boolean: "Si/No",
};

export const FIELD_ENTITY_LABELS: Record<FieldEntity, string> = {
  orders: "Pedidos",
  route_stops: "Paradas de ruta",
};

interface CustomFieldsState {
  definitions: FieldDefinition[];
  isLoading: boolean;
  selectedDefinition: FieldDefinition | null;
  showDialog: boolean;
  dialogMode: "create" | "edit";
}

interface CustomFieldsActions {
  createDefinition: (data: FieldDefinitionInput) => Promise<void>;
  updateDefinition: (id: string, data: FieldDefinitionInput) => Promise<void>;
  deleteDefinition: (id: string) => Promise<void>;
  openCreateDialog: () => void;
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

  const definitionsUrl = companyId ? `/api/companies/${companyId}/field-definitions` : null;

  const {
    data: definitions = [],
    isLoading,
    mutate: mutateDefinitions,
  } = useApiData<FieldDefinition[]>(definitionsUrl, companyId);

  const createDefinition = useCallback(
    async (data: FieldDefinitionInput) => {
      if (!companyId) return;
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
    },
    [companyId, mutateDefinitions, toast]
  );

  const updateDefinition = useCallback(
    async (id: string, data: FieldDefinitionInput) => {
      if (!companyId) return;
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
    },
    [companyId, mutateDefinitions, toast]
  );

  const deleteDefinition = useCallback(
    async (id: string) => {
      if (!companyId) return;
      const response = await fetch(`/api/companies/${companyId}/field-definitions/${id}`, {
        method: "DELETE",
        headers: { "x-company-id": companyId },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Error al eliminar campo" }));
        throw new Error(error.error || "Error al eliminar campo");
      }
      await mutateDefinitions();
      toast({ title: "Campo eliminado", description: "El campo ha sido eliminado." });
    },
    [companyId, mutateDefinitions, toast]
  );

  const openCreateDialog = useCallback(() => {
    setSelectedDefinition(null);
    setDialogMode("create");
    setShowDialog(true);
  }, []);

  const openEditDialog = useCallback((definition: FieldDefinition) => {
    setSelectedDefinition(definition);
    setDialogMode("edit");
    setShowDialog(true);
  }, []);

  const closeDialog = useCallback(() => {
    setShowDialog(false);
    setSelectedDefinition(null);
  }, []);

  const refreshDefinitions = useCallback(() => {
    mutateDefinitions();
  }, [mutateDefinitions]);

  const contextState: CustomFieldsState = {
    definitions: Array.isArray(definitions) ? [...definitions].sort((a, b) => a.position - b.position) : [],
    isLoading,
    selectedDefinition,
    showDialog,
    dialogMode,
  };

  const contextActions: CustomFieldsActions = {
    createDefinition,
    updateDefinition,
    deleteDefinition,
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
