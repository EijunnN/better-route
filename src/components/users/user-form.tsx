"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CreateUserInput } from "@/lib/validations/user";
import { UserFormActions } from "./user-form-actions";
import { UserFormBasic } from "./user-form-basic";
import {
  type CustomRole,
  UserFormProvider,
  useUserForm,
} from "./user-form-context";
import { UserFormDriver } from "./user-form-driver";
import { UserFormRoles } from "./user-form-roles";

// Re-export types for convenience
export type { CustomRole };

interface UserFormProps {
  onSubmit: (data: CreateUserInput, selectedRoleIds: string[]) => Promise<void>;
  onCancel?: () => void;
  initialData?: Partial<CreateUserInput>;
  fleets: Array<{ id: string; name: string }>;
  roles?: CustomRole[];
  initialRoleIds?: string[];
  submitLabel?: string;
  isEditing?: boolean;
  companyId?: string;
}

function UserFormContent() {
  const { state, actions, derived } = useUserForm();
  const { errors, activeTab } = state;
  const { handleSubmit, setActiveTab } = actions;
  const { showRolesColumn, isConductor } = derived;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errors.form && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errors.form}
        </div>
      )}

      <div
        className={
          showRolesColumn ? "grid grid-cols-1 lg:grid-cols-3 gap-4" : ""
        }
      >
        {/* LEFT COLUMN - User Information */}
        <div className={showRolesColumn ? "lg:col-span-2" : ""}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Información del Usuario
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
              >
                <TabsList
                  className={`grid w-full ${isConductor ? "grid-cols-2" : "grid-cols-1"}`}
                >
                  <TabsTrigger value="basic">Datos Básicos</TabsTrigger>
                  {isConductor && (
                    <TabsTrigger value="driver">Conductor</TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="basic">
                  <UserFormBasic />
                </TabsContent>

                {isConductor && (
                  <TabsContent value="driver">
                    <UserFormDriver />
                  </TabsContent>
                )}
              </Tabs>

              <UserFormActions />
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN - Roles */}
        {showRolesColumn && (
          <div className="lg:col-span-1">
            <UserFormRoles />
          </div>
        )}
      </div>
    </form>
  );
}

/**
 * UserForm - Compound Component Pattern
 *
 * Can be used in two ways:
 *
 * 1. Simple usage (default layout):
 * ```tsx
 * <UserForm onSubmit={handleSubmit} fleets={fleets} />
 * ```
 *
 * 2. Compound usage (custom layout):
 * ```tsx
 * <UserForm.Provider onSubmit={handleSubmit} fleets={fleets}>
 *   <UserForm.BasicTab />
 *   <UserForm.DriverTab />
 *   <UserForm.RolesColumn />
 *   <UserForm.Actions />
 * </UserForm.Provider>
 * ```
 */
export function UserForm({
  onSubmit,
  onCancel,
  initialData,
  fleets,
  roles = [],
  initialRoleIds = [],
  submitLabel = "Guardar",
  isEditing = false,
  companyId,
}: UserFormProps) {
  return (
    <UserFormProvider
      onSubmit={onSubmit}
      onCancel={onCancel}
      initialData={initialData}
      fleets={fleets}
      roles={roles}
      initialRoleIds={initialRoleIds}
      submitLabel={submitLabel}
      isEditing={isEditing}
      companyId={companyId}
    >
      <UserFormContent />
    </UserFormProvider>
  );
}

// Compound component exports
UserForm.Provider = UserFormProvider;
UserForm.BasicTab = UserFormBasic;
UserForm.DriverTab = UserFormDriver;
UserForm.RolesColumn = UserFormRoles;
UserForm.Actions = UserFormActions;

// Hook export for custom implementations
export { useUserForm } from "./user-form-context";
