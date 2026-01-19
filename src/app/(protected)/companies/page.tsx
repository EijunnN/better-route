"use client";

import useSWR from "swr";
import { useState } from "react";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { ProtectedPage } from "@/components/auth/protected-page";
import { CompanyForm } from "@/components/companies/company-form";
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
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { CompanyInput } from "@/lib/validations/company";

interface Company {
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

function CompaniesPageContent() {
  const {
    data: companies = [],
    isLoading,
    error,
    mutate,
  } = useSWR("/api/companies", fetcher, {
    revalidateOnFocus: false,
  });
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();

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
      toast({
        title: "Empresa creada",
        description: `La empresa "${data.commercialName}" ha sido creada exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al crear empresa",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleUpdate = async (data: CompanyInput) => {
    if (!editingCompany) return;

    // Optimistic update
    const optimisticData = companies.map((c) =>
      c.id === editingCompany.id ? { ...c, ...data } : c,
    );

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
        {
          optimisticData,
          rollbackOnError: true,
          revalidate: false,
        },
      );

      setEditingCompany(null);
      toast({
        title: "Empresa actualizada",
        description: `La empresa "${data.commercialName}" ha sido actualizada exitosamente.`,
      });
    } catch (err) {
      toast({
        title: "Error al actualizar empresa",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
      throw err;
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const company = companies.find((c) => c.id === id);

    // Optimistic update - mark as inactive
    const optimisticData = companies.map((c) =>
      c.id === id ? { ...c, active: false } : c,
    );

    try {
      await mutate(
        async () => {
          const response = await fetch(`/api/companies/${id}`, {
            method: "DELETE",
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Error al desactivar empresa");
          }

          return fetcher("/api/companies");
        },
        {
          optimisticData,
          rollbackOnError: true,
          revalidate: false,
        },
      );

      toast({
        title: "Empresa desactivada",
        description: company
          ? `La empresa "${company.commercialName}" ha sido desactivada.`
          : "La empresa ha sido desactivada.",
      });
    } catch (err) {
      toast({
        title: "Error al desactivar empresa",
        description:
          err instanceof Error ? err.message : "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (showForm || editingCompany) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">
              {editingCompany ? "Editar Empresa" : "Nueva Empresa"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {editingCompany
                ? "Actualice la información de la empresa"
                : "Complete el formulario para crear una nueva empresa"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <CompanyForm
              onSubmit={editingCompany ? handleUpdate : handleCreate}
              initialData={
                editingCompany
                  ? {
                      ...editingCompany,
                      phone: editingCompany.phone ?? undefined,
                      taxAddress: editingCompany.taxAddress ?? undefined,
                    }
                  : undefined
              }
              submitLabel={editingCompany ? "Actualizar" : "Crear"}
            />
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingCompany(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Gestión de Empresas
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Administre las empresas inquilinas del sistema
            </p>
          </div>
          <Button onClick={() => setShowForm(true)}>Nueva Empresa</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Error al cargar empresas
            </h3>
            <p className="text-muted-foreground mb-4">
              No se pudieron cargar las empresas. Por favor, intente nuevamente.
            </p>
            <Button onClick={() => mutate()} variant="outline">
              Reintentar
            </Button>
          </div>
        ) : companies.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
            <p className="text-muted-foreground">
              No hay empresas registradas. Cree la primera empresa.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Nombre Legal
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Nombre Comercial
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    País
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {companies.map((company) => {
                  const isDeleting = deletingId === company.id;

                  return (
                    <tr
                      key={company.id}
                      className={`transition-colors ${isDeleting ? "opacity-50" : "hover:bg-muted/50"}`}
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-foreground">
                        {company.legalName}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                        {company.commercialName}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                        {company.email}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                        {company.country}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 text-xs font-semibold ${
                            company.active
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {company.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingCompany(company)}
                          disabled={isDeleting}
                        >
                          Editar
                        </Button>
                        {company.active && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={isDeleting}
                              >
                                {isDeleting ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  ¿Desactivar empresa?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta acción desactivará la empresa{" "}
                                  <strong>{company.commercialName}</strong>. Los
                                  usuarios de esta empresa no podrán acceder al
                                  sistema.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(company.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Desactivar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CompaniesPage() {
  return (
    <ProtectedPage requiredPermission="companies:VIEW">
      <CompaniesPageContent />
    </ProtectedPage>
  );
}
