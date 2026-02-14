"use client";

import { Loader2, Trash2, Upload } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserForm } from "@/components/users/user-form";
import { UserImportDialog } from "@/components/users/user-import-dialog";
import type { CreateUserInput } from "@/lib/validations/user";
import {
  DRIVER_STATUS_LABELS,
  isExpired,
  isExpiringSoon,
  ROLE_LABELS,
} from "@/lib/validations/user";
import { useUsers, ROLE_TABS, STATUS_COLOR_CLASSES, type User } from "./users-context";

// Helper functions
const getLicenseStatusColor = (expiryDate: string | null | undefined) => {
  if (!expiryDate) return "text-muted-foreground";
  if (isExpired(expiryDate)) return "text-destructive";
  if (isExpiringSoon(expiryDate)) return "text-orange-500";
  return "text-muted-foreground";
};

const getLicenseStatusLabel = (expiryDate: string | null | undefined) => {
  if (!expiryDate) return "-";
  if (isExpired(expiryDate)) return "Vencida";
  if (isExpiringSoon(expiryDate)) return "Pronto a vencer";
  return new Date(expiryDate).toLocaleDateString();
};

export function UsersListView() {
  const { state, actions, meta, derived } = useUsers();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestión de Usuarios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administre los usuarios del sistema
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => actions.setShowImportDialog(true)}
            disabled={meta.isSystemAdmin && !meta.effectiveCompanyId}
          >
            <Upload className="h-4 w-4 mr-2" />
            Importar CSV
          </Button>
          <Button
            onClick={() => actions.setShowForm(true)}
            disabled={meta.isSystemAdmin && !meta.effectiveCompanyId}
          >
            Nuevo Usuario
          </Button>
        </div>
      </div>

      {/* Role Tabs */}
      <Tabs value={state.activeTab} onValueChange={actions.setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          {ROLE_TABS.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {state.isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      ) : derived.filteredUsers.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center shadow-sm">
          <p className="text-muted-foreground">
            No hay usuarios registrados. Cree el primer usuario.
          </p>
        </div>
      ) : (
        <UsersTable />
      )}

      {/* Import Dialog */}
      <UserImportDialog
        open={state.showImportDialog}
        onOpenChange={actions.setShowImportDialog}
        onImportComplete={actions.fetchUsers}
        companyId={meta.effectiveCompanyId}
      />
    </div>
  );
}

function UsersTable() {
  const { state, actions, derived } = useUsers();

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Nombre
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Usuario
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Contacto
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Rol
              </th>
              {(state.activeTab === "all" || state.activeTab === "CONDUCTOR") && (
                <>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Licencia
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Vencimiento
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Estado
                  </th>
                </>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Activo
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {derived.filteredUsers.map((user) => (
              <UserRow key={user.id} user={user} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({ user }: { user: User }) {
  const { state, actions } = useUsers();
  const showDriverColumns = state.activeTab === "all" || state.activeTab === "CONDUCTOR";

  return (
    <tr className="hover:bg-muted/50 transition-colors">
      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-foreground">
        {user.name}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-sm text-muted-foreground">
        @{user.username}
      </td>
      <td className="px-4 py-4 text-sm text-muted-foreground">
        <div>{user.email}</div>
        {user.phone && <div className="text-xs">{user.phone}</div>}
      </td>
      <td className="whitespace-nowrap px-4 py-4">
        <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold">
          {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role}
        </span>
      </td>
      {showDriverColumns && (
        <>
          <td className="px-4 py-4 text-sm text-muted-foreground">
            {user.role === "CONDUCTOR" ? (
              <>
                <div>{user.licenseNumber || "-"}</div>
                {user.licenseCategories && (
                  <div className="text-xs">{user.licenseCategories}</div>
                )}
              </>
            ) : (
              <span className="text-muted-foreground/50">-</span>
            )}
          </td>
          <td className="whitespace-nowrap px-4 py-4 text-sm">
            {user.role === "CONDUCTOR" ? (
              <span className={getLicenseStatusColor(user.licenseExpiry)}>
                {getLicenseStatusLabel(user.licenseExpiry)}
              </span>
            ) : (
              <span className="text-muted-foreground/50">-</span>
            )}
          </td>
          <td className="whitespace-nowrap px-4 py-4">
            {user.role === "CONDUCTOR" && user.driverStatus ? (
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  STATUS_COLOR_CLASSES[user.driverStatus] || "bg-gray-100 text-gray-800"
                }`}
              >
                {DRIVER_STATUS_LABELS[user.driverStatus as keyof typeof DRIVER_STATUS_LABELS] ||
                  user.driverStatus}
              </span>
            ) : (
              <span className="text-muted-foreground/50">-</span>
            )}
          </td>
        </>
      )}
      <td className="whitespace-nowrap px-4 py-4 text-sm">
        {user.active ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Activo
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
            Inactivo
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => actions.handleEditUser(user)}
          disabled={state.deletingId === user.id}
        >
          Editar
        </Button>
        {user.active && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={state.deletingId === user.id}
              >
                {state.deletingId === user.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Desactivar usuario?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción desactivará al usuario <strong>{user.name}</strong>. No podrá
                  acceder al sistema.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => actions.handleDelete(user.id)}
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
}

export function UsersFormView() {
  const { state, actions, meta } = useUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {state.editingUser ? "Editar Usuario" : "Nuevo Usuario"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {state.editingUser
            ? "Actualice la información del usuario"
            : "Complete el formulario para crear un nuevo usuario"}
        </p>
      </div>
      <UserForm
        onSubmit={state.editingUser ? actions.handleUpdate : actions.handleCreate}
        onCancel={actions.cancelForm}
        initialData={
          state.editingUser
            ? {
                name: state.editingUser.name,
                email: state.editingUser.email,
                username: state.editingUser.username,
                role: state.editingUser.role as CreateUserInput["role"],
                phone: state.editingUser.phone,
                identification: state.editingUser.identification,
                birthDate: state.editingUser.birthDate,
                photo: state.editingUser.photo,
                licenseNumber: state.editingUser.licenseNumber,
                licenseExpiry: state.editingUser.licenseExpiry,
                licenseCategories: state.editingUser.licenseCategories,
                certifications: state.editingUser.certifications,
                driverStatus: state.editingUser.driverStatus as CreateUserInput["driverStatus"],
                primaryFleetId: state.editingUser.primaryFleetId,
                active: state.editingUser.active,
              }
            : undefined
        }
        fleets={state.fleets}
        roles={state.roles}
        initialRoleIds={state.editingUserRoleIds}
        submitLabel={state.editingUser ? "Actualizar" : "Crear"}
        isEditing={!!state.editingUser}
        companyId={meta.effectiveCompanyId ?? undefined}
      />
    </div>
  );
}
