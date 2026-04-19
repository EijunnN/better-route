"use client";

import { AlertCircle, Loader2, Trash2 } from "lucide-react";
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
import { Can } from "@/components/auth/can";
import { CompanyForm } from "./company-form";
import { useCompanies, type Company } from "./companies-context";

export function CompaniesListView() {
  const { state, actions } = useCompanies();

  if (state.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-12 text-center">
        <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Error al cargar empresas</h3>
        <p className="text-muted-foreground mb-4">No se pudieron cargar las empresas. Por favor, intente nuevamente.</p>
        <Button onClick={() => actions.mutate()} variant="outline">
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-background p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gestión de Empresas</h1>
            <p className="mt-1 text-sm text-muted-foreground">Administre las empresas inquilinas del sistema</p>
          </div>
          <Can perm="company:create">
            <Button onClick={() => actions.setShowForm(true)}>Nueva Empresa</Button>
          </Can>
        </div>

        {state.companies.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
            <p className="text-muted-foreground">No hay empresas registradas. Cree la primera empresa.</p>
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
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">País</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Estado</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {state.companies.map((company) => (
                  <CompanyRow key={company.id} company={company} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CompanyRow({ company }: { company: Company }) {
  const { state, actions } = useCompanies();
  const isDeleting = state.deletingId === company.id;

  return (
    <tr className={`transition-colors ${isDeleting ? "opacity-50" : "hover:bg-muted/50"}`}>
      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-foreground">{company.legalName}</td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">{company.commercialName}</td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">{company.email}</td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">{company.country}</td>
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
        <Can perm="company:update">
          <Button variant="ghost" size="sm" onClick={() => actions.setEditingCompany(company)} disabled={isDeleting}>
            Editar
          </Button>
        </Can>
        {company.active && (
          <Can perm="company:delete">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Desactivar empresa?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción desactivará la empresa <strong>{company.commercialName}</strong>. Los usuarios de esta empresa no
                    podrán acceder al sistema.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => actions.handleDelete(company.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Desactivar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Can>
        )}
      </td>
    </tr>
  );
}

export function CompaniesFormView() {
  const { state, actions } = useCompanies();

  return (
    <div className="flex-1 bg-background p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{state.editingCompany ? "Editar Empresa" : "Nueva Empresa"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.editingCompany ? "Actualice la información de la empresa" : "Complete el formulario para crear una nueva empresa"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <CompanyForm
            onSubmit={state.editingCompany ? actions.handleUpdate : actions.handleCreate}
            initialData={
              state.editingCompany
                ? {
                    ...state.editingCompany,
                    phone: state.editingCompany.phone ?? undefined,
                    taxAddress: state.editingCompany.taxAddress ?? undefined,
                  }
                : undefined
            }
            submitLabel={state.editingCompany ? "Actualizar" : "Crear"}
          />
          <div className="mt-4">
            <Button type="button" variant="outline" onClick={actions.cancelForm}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
