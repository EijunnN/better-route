"use client";

import { Loader2, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { useRoles, CATEGORY_LABELS } from "./roles-context";

export function RolesListView() {
  const { state, actions, meta } = useRoles();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestión de Roles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure roles y permisos personalizados para su empresa
          </p>
        </div>
        <Button onClick={() => actions.setShowForm(true)} disabled={meta.isSystemAdmin && !meta.effectiveCompanyId}>
          Nuevo Rol
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-semibold text-foreground">Roles</h2>
            </div>
            {state.isLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
              </div>
            ) : state.roles.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">No hay roles configurados</div>
            ) : (
              <div className="divide-y divide-border">
                {state.roles.map((role) => (
                  <div
                    key={role.id}
                    className={`p-4 cursor-pointer transition-colors hover:bg-muted/50 ${
                      state.selectedRole?.id === role.id ? "bg-muted" : ""
                    }`}
                    onClick={() => actions.setSelectedRole(role)}
                    onKeyDown={(e) => e.key === "Enter" && actions.setSelectedRole(role)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{role.name}</span>
                          {role.isSystem && <span className="text-xs bg-muted px-2 py-0.5 rounded">Sistema</span>}
                        </div>
                        {role.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{role.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">{role.enabledPermissionsCount} permisos activos</p>
                      </div>
                      {!role.isSystem && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={state.deletingId === role.id}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {state.deletingId === role.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar rol?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción eliminará el rol <strong>{role.name}</strong>. Los usuarios con este rol
                                perderán los permisos asociados.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => actions.handleDeleteRole(role.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-semibold text-foreground">
                {state.selectedRole ? `Permisos: ${state.selectedRole.name}` : "Seleccione un rol"}
              </h2>
              {state.selectedRole?.isSystem && (
                <p className="text-xs text-muted-foreground mt-1">Los roles del sistema no pueden ser modificados</p>
              )}
            </div>

            {!state.selectedRole ? (
              <div className="p-8 text-center text-muted-foreground">
                Seleccione un rol de la lista para ver y editar sus permisos
              </div>
            ) : state.isLoadingPermissions ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
              </div>
            ) : state.rolePermissions ? (
              <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
                {Object.entries(state.rolePermissions.permissions).map(([category, perms]) => (
                  <div key={category} className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-foreground">{CATEGORY_LABELS[category] || category}</h3>
                      {!state.selectedRole?.isSystem && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => actions.handleToggleAllInCategory(category, true)}
                            className="text-xs text-primary hover:underline"
                          >
                            Activar todos
                          </button>
                          <span className="text-muted-foreground">|</span>
                          <button
                            type="button"
                            onClick={() => actions.handleToggleAllInCategory(category, false)}
                            className="text-xs text-muted-foreground hover:underline"
                          >
                            Desactivar todos
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      {perms.map((perm) => (
                        <div key={perm.id} className="flex items-center justify-between py-1">
                          <div>
                            <span className="text-sm text-foreground">{perm.name}</span>
                            {perm.description && <p className="text-xs text-muted-foreground">{perm.description}</p>}
                          </div>
                          <Switch
                            checked={perm.enabled}
                            onCheckedChange={(checked) => actions.handleTogglePermission(perm.id, checked)}
                            disabled={state.selectedRole?.isSystem || state.savingPermission === perm.id}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {Object.keys(state.rolePermissions.permissions).length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    No hay permisos configurados en el sistema.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function RolesFormView() {
  const { state, actions } = useRoles();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nuevo Rol</h1>
        <p className="mt-1 text-sm text-muted-foreground">Cree un nuevo rol personalizado para su empresa</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <form onSubmit={actions.handleCreateRole} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1">
              Nombre del Rol *
            </label>
            <input
              type="text"
              id="name"
              value={state.formData.name}
              onChange={(e) => actions.setFormData({ ...state.formData, name: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Ej: Supervisor de Entregas"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-foreground mb-1">
              Descripción
            </label>
            <textarea
              id="description"
              value={state.formData.description}
              onChange={(e) => actions.setFormData({ ...state.formData, description: e.target.value })}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Descripción opcional del rol..."
            />
          </div>
          {state.formError && <p className="text-sm text-destructive">{state.formError}</p>}
          <div className="flex gap-3">
            <Button type="submit">Crear Rol</Button>
            <Button type="button" variant="outline" onClick={actions.resetForm}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
