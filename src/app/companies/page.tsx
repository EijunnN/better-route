"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CompanyForm } from "@/components/companies/company-form";
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

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  const fetchCompanies = async () => {
    try {
      const response = await fetch("/api/companies");
      const data = await response.json();
      setCompanies(data.data || []);
    } catch (error) {
      console.error("Error fetching companies:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleCreate = async (data: CompanyInput) => {
    const response = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    await fetchCompanies();
    setShowForm(false);
  };

  const handleUpdate = async (data: CompanyInput) => {
    if (!editingCompany) return;

    const response = await fetch(`/api/companies/${editingCompany.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    await fetchCompanies();
    setEditingCompany(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de desactivar esta empresa?")) return;

    const response = await fetch(`/api/companies/${id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      await fetchCompanies();
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
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
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
                {companies.map((company) => (
                  <tr key={company.id} className="hover:bg-muted/50 transition-colors">
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
                      <button
                        onClick={() => setEditingCompany(company)}
                        className="text-muted-foreground hover:text-foreground mr-4 transition-colors"
                      >
                        Editar
                      </button>
                      {company.active && (
                        <button
                          onClick={() => handleDelete(company.id)}
                          className="text-destructive hover:text-destructive/80 transition-colors"
                        >
                          Desactivar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
