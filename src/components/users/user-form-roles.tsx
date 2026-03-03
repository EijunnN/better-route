"use client";

import { Shield, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useUserForm } from "./user-form-context";

export function UserFormRoles() {
  const { state, actions, meta, derived } = useUserForm();
  const {
    isSubmitting,
    selectedRoleIds,
    expandedRoleId,
    rolePermissions,
    isLoadingAllPermissions,
  } = state;
  const { toggleRole, handleExpandRole } = actions;
  const { roles } = meta;
  const { showRolesSection } = derived;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Roles
        </CardTitle>
        {showRolesSection && (
          <CardDescription className="text-xs">
            Roles adicionales
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {!showRolesSection ? (
          <p className="text-xs text-muted-foreground">
            No hay roles personalizados disponibles.
          </p>
        ) : (
          <div className="space-y-2">
            {isLoadingAllPermissions && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted border-t-primary" />
                Cargando...
              </div>
            )}
            {roles.map((role) => {
              const isSelected = selectedRoleIds.includes(role.id);
              const permissions = rolePermissions[role.id];
              const totalPermissions = permissions
                ? Object.values(permissions)
                    .flat()
                    .filter((p) => p.enabled).length
                : role.permissionsCount || 0;

              return (
                <div
                  key={role.id}
                  className={`rounded-lg border p-2 cursor-pointer transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "hover:border-muted-foreground/50"
                  }`}
                  onClick={() => handleExpandRole(role.id)}
                >
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={isSelected}
                      onCheckedChange={() => toggleRole(role.id)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={isSubmitting}
                      className="scale-90"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{role.name}</span>
                      <p className="text-xs text-muted-foreground">
                        {totalPermissions} permisos
                      </p>
                    </div>
                    {isSelected && (
                      <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>

                  {expandedRoleId === role.id && permissions && (
                    <div className="mt-2 pt-2 border-t space-y-1 max-h-40 overflow-y-auto">
                      {Object.entries(permissions).map(([category, perms]) => (
                        <div key={category}>
                          <p className="text-xs font-medium text-muted-foreground uppercase">
                            {category}
                          </p>
                          {perms
                            .filter((p) => p.enabled)
                            .map((perm) => (
                              <p key={perm.id} className="text-xs pl-2">
                                • {perm.name}
                              </p>
                            ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {selectedRoleIds.length > 0 && (
              <p className="text-xs text-muted-foreground pt-2">
                {selectedRoleIds.length} rol
                {selectedRoleIds.length > 1 ? "es" : ""} asignado
                {selectedRoleIds.length > 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
