"use client";

import { createContext, use, useState, type ReactNode } from "react";
import useSWR from "swr";
import { useToast } from "@/hooks/use-toast";
import type { CompanyInput } from "@/lib/validations/company";

export interface Company {
  id: string;
  legalName: string;
  commercialName: string;
  email: string;
  phone: string | null;
  taxAddress: string | null;
  country: string;
  timezone: string;
  currency: string;
  dateFormat: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const fetcher = async (url: string): Promise<Company[]> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch");
  const data = await response.json();
  return data.data || [];
};

export interface CompaniesState {
  companies: Company[];
  isLoading: boolean;
  error: Error | undefined;
  showForm: boolean;
  editingCompany: Company | null;
  deletingId: string | null;
}

export interface CompaniesActions {
  handleCreate: (data: CompanyInput) => Promise<void>;
  handleUpdate: (data: CompanyInput) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  setShowForm: (show: boolean) => void;
  setEditingCompany: (company: Company | null) => void;
  cancelForm: () => void;
  mutate: () => void;
}

interface CompaniesContextValue {
  state: CompaniesState;
  actions: CompaniesActions;
}

const CompaniesContext = createContext<CompaniesContextValue | undefined>(undefined);

export function CompaniesProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { data: companies = [], isLoading, error, mutate } = useSWR("/api/companies", fetcher, { revalidateOnFocus: false });

  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async (data: CompanyInput) => {
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al crear empresa");
      }
      await mutate();
      setShowForm(false);
      toast({ title: "Empresa creada", description: `La empresa "${data.commercialName}" ha sido creada exitosamente.` });
    } catch (err) {
      toast({
        title: "Error al crear empresa",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleUpdate = async (data: CompanyInput) => {
    if (!editingCompany) return;
    const optimisticData = companies.map((c) => (c.id === editingCompany.id ? { ...c, ...data } : c));
    try {
      await mutate(
        async () => {
          const response = await fetch(`/api/companies/${editingCompany.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Error al actualizar empresa");
          }
          return fetcher("/api/companies");
        },
        { optimisticData, rollbackOnError: true, revalidate: false }
      );
      setEditingCompany(null);
      toast({ title: "Empresa actualizada", description: `La empresa "${data.commercialName}" ha sido actualizada exitosamente.` });
    } catch (err) {
      toast({
        title: "Error al actualizar empresa",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const company = companies.find((c) => c.id === id);
    const optimisticData = companies.map((c) => (c.id === id ? { ...c, active: false } : c));
    try {
      await mutate(
        async () => {
          const response = await fetch(`/api/companies/${id}`, { method: "DELETE" });
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Error al desactivar empresa");
          }
          return fetcher("/api/companies");
        },
        { optimisticData, rollbackOnError: true, revalidate: false }
      );
      toast({
        title: "Empresa desactivada",
        description: company ? `La empresa "${company.commercialName}" ha sido desactivada.` : "La empresa ha sido desactivada.",
      });
    } catch (err) {
      toast({
        title: "Error al desactivar empresa",
        description: err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingCompany(null);
  };

  const state: CompaniesState = { companies, isLoading, error, showForm, editingCompany, deletingId };
  const actions: CompaniesActions = {
    handleCreate,
    handleUpdate,
    handleDelete,
    setShowForm,
    setEditingCompany,
    cancelForm,
    mutate,
  };

  return <CompaniesContext value={{ state, actions }}>{children}</CompaniesContext>;
}

export function useCompanies(): CompaniesContextValue {
  const context = use(CompaniesContext);
  if (context === undefined) {
    throw new Error("useCompanies must be used within a CompaniesProvider");
  }
  return context;
}
