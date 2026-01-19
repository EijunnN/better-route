"use client";

import { Info, Shield, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { CreateUserInput } from "@/lib/validations/user";
import { isExpired, isExpiringSoon } from "@/lib/validations/user";

interface RolePermission {
  id: string;
  entity: string;
  action: string;
  name: string;
  description: string | null;
  enabled: boolean;
}

interface GroupedPermissions {
  [category: string]: RolePermission[];
}

interface CustomRole {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  isSystem: boolean;
  permissionsCount?: number;
}

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

const USER_ROLES = [
  { value: "ADMIN_SISTEMA", label: "Admin Sistema" },
  { value: "ADMIN_FLOTA", label: "Admin Flota" },
  { value: "PLANIFICADOR", label: "Planificador" },
  { value: "MONITOR", label: "Monitor" },
  { value: "CONDUCTOR", label: "Conductor" },
];

const ROLE_PERMISSIONS_INFO: Record<string, string> = {
  ADMIN_SISTEMA: "Acceso completo a todas las empresas y funcionalidades",
  ADMIN_FLOTA: "Gestión de flotas, vehículos y conductores",
  PLANIFICADOR: "Planificación de rutas y optimización",
  MONITOR: "Monitoreo en tiempo real",
  CONDUCTOR: "Acceso a rutas asignadas",
};

const DRIVER_STATUS = [
  { value: "AVAILABLE", label: "Disponible" },
  { value: "ASSIGNED", label: "Asignado" },
  { value: "IN_ROUTE", label: "En Ruta" },
  { value: "ON_PAUSE", label: "En Pausa" },
  { value: "UNAVAILABLE", label: "No Disponible" },
];

const LICENSE_CATEGORIES = [
  "A",
  "A1",
  "A2",
  "B",
  "C",
  "C1",
  "CE",
  "D",
  "D1",
  "DE",
];

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
  const defaultData: CreateUserInput = {
    name: initialData?.name ?? "",
    email: initialData?.email ?? "",
    username: initialData?.username ?? "",
    password: "",
    role: initialData?.role ?? "CONDUCTOR",
    phone: initialData?.phone ?? "",
    identification: initialData?.identification ?? "",
    birthDate: initialData?.birthDate ?? null,
    photo: initialData?.photo ?? "",
    licenseNumber: initialData?.licenseNumber ?? "",
    licenseExpiry: initialData?.licenseExpiry ?? null,
    licenseCategories: initialData?.licenseCategories ?? "",
    certifications: initialData?.certifications ?? "",
    driverStatus: initialData?.driverStatus ?? "AVAILABLE",
    primaryFleetId: initialData?.primaryFleetId ?? null,
    active: initialData?.active ?? true,
  };

  const [formData, setFormData] = useState<CreateUserInput>(defaultData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedLicenseCategories, setSelectedLicenseCategories] = useState<
    string[]
  >(
    initialData?.licenseCategories
      ?.split(",")
      .map((c) => c.trim())
      .filter(Boolean) || [],
  );
  const [selectedRoleIds, setSelectedRoleIds] =
    useState<string[]>(initialRoleIds);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [rolePermissions, setRolePermissions] = useState<
    Record<string, GroupedPermissions>
  >({});
  const [isLoadingAllPermissions, setIsLoadingAllPermissions] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  const showRolesColumn = formData.role !== "ADMIN_SISTEMA";
  const showRolesSection =
    roles.length > 0 && formData.role !== "ADMIN_SISTEMA";
  const isConductor = formData.role === "CONDUCTOR";

  const roleIds = useMemo(() => roles.map((r) => r.id).join(","), [roles]);

  useEffect(() => {
    if (!companyId || roles.length === 0) return;
    const fetchAllPermissions = async () => {
      setIsLoadingAllPermissions(true);
      const permissionsMap: Record<string, GroupedPermissions> = {};
      await Promise.all(
        roles.map(async (role) => {
          try {
            const response = await fetch(`/api/roles/${role.id}/permissions`, {
              headers: { "x-company-id": companyId },
            });
            if (response.ok) {
              const data = await response.json();
              permissionsMap[role.id] = data.permissions || {};
            }
          } catch (error) {
            console.error(
              `Error fetching permissions for role ${role.id}:`,
              error,
            );
          }
        }),
      );
      setRolePermissions(permissionsMap);
      setIsLoadingAllPermissions(false);
    };
    fetchAllPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, roleIds]);

  const handleExpandRole = useCallback((roleId: string) => {
    setExpandedRoleId((prev) => (prev === roleId ? null : roleId));
  }, []);

  const licenseStatus = useMemo(() => {
    if (!formData.licenseExpiry) return null;
    if (isExpired(formData.licenseExpiry)) return "expired";
    if (isExpiringSoon(formData.licenseExpiry)) return "expiring_soon";
    return "valid";
  }, [formData.licenseExpiry]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    const emptyToNull = (value: string | null | undefined): string | null => {
      if (value === undefined || value === null || value.trim() === "")
        return null;
      return value;
    };

    const submitData: CreateUserInput = {
      ...formData,
      phone: emptyToNull(formData.phone),
      photo: emptyToNull(formData.photo),
      birthDate: emptyToNull(formData.birthDate),
      certifications: emptyToNull(formData.certifications),
      licenseCategories: isConductor
        ? selectedLicenseCategories.length > 0
          ? selectedLicenseCategories.join(", ")
          : null
        : null,
      identification: isConductor ? emptyToNull(formData.identification) : null,
      licenseNumber: isConductor ? emptyToNull(formData.licenseNumber) : null,
      licenseExpiry: isConductor ? emptyToNull(formData.licenseExpiry) : null,
      driverStatus: isConductor ? formData.driverStatus : null,
      primaryFleetId: isConductor ? emptyToNull(formData.primaryFleetId) : null,
    };

    try {
      await onSubmit(submitData, selectedRoleIds);
    } catch (error: unknown) {
      const err = error as {
        details?: Array<{ path?: string[]; field?: string; message: string }>;
        error?: string;
      };
      if (err.details && Array.isArray(err.details)) {
        const fieldErrors: Record<string, string> = {};
        err.details.forEach((detail) => {
          const fieldName = detail.path?.[0] || detail.field || "form";
          fieldErrors[fieldName] = detail.message;
        });
        setErrors(fieldErrors);
      } else {
        setErrors({ form: err.error || "Error al guardar el usuario" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (
    field: keyof CreateUserInput,
    value: CreateUserInput[keyof CreateUserInput],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const n = { ...prev };
        delete n[field];
        return n;
      });
    }
  };

  const toggleLicenseCategory = (category: string) => {
    setSelectedLicenseCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category],
    );
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId],
    );
  };

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

                {/* Tab: Basic Info */}
                <TabsContent value="basic" className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="name" className="text-xs">
                        Nombre *
                      </Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        disabled={isSubmitting}
                        className={errors.name ? "border-destructive" : ""}
                        placeholder="Juan Pérez"
                      />
                      {errors.name && (
                        <p className="text-xs text-destructive">
                          {errors.name}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="email" className="text-xs">
                        Correo *
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => updateField("email", e.target.value)}
                        disabled={isSubmitting}
                        className={errors.email ? "border-destructive" : ""}
                        placeholder="juan@empresa.com"
                      />
                      {errors.email && (
                        <p className="text-xs text-destructive">
                          {errors.email}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="username" className="text-xs">
                        Usuario *
                      </Label>
                      <Input
                        id="username"
                        value={formData.username}
                        onChange={(e) =>
                          updateField("username", e.target.value)
                        }
                        disabled={isSubmitting}
                        className={errors.username ? "border-destructive" : ""}
                        placeholder="juan_perez"
                      />
                      {errors.username && (
                        <p className="text-xs text-destructive">
                          {errors.username}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="password" className="text-xs">
                        Contraseña {isEditing ? "(vacío = mantener)" : "*"}
                      </Label>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) =>
                          updateField("password", e.target.value)
                        }
                        disabled={isSubmitting}
                        className={errors.password ? "border-destructive" : ""}
                        placeholder={
                          isEditing ? "••••••••" : "Mín. 8 caracteres"
                        }
                      />
                      {errors.password && (
                        <p className="text-xs text-destructive">
                          {errors.password}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="role" className="text-xs">
                        Rol Base *
                      </Label>
                      <Select
                        value={formData.role}
                        onValueChange={(value) => updateField("role", value)}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {USER_ROLES.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {formData.role &&
                        ROLE_PERMISSIONS_INFO[formData.role] && (
                          <p className="text-xs text-muted-foreground flex items-start gap-1 mt-1">
                            <Info className="h-3 w-3 mt-0.5 shrink-0" />
                            {ROLE_PERMISSIONS_INFO[formData.role]}
                          </p>
                        )}
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="phone" className="text-xs">
                        Teléfono
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone ?? ""}
                        onChange={(e) =>
                          updateField("phone", e.target.value || null)
                        }
                        disabled={isSubmitting}
                        placeholder="+51 999 999 999"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="active"
                        checked={formData.active}
                        onCheckedChange={(checked) =>
                          updateField("active", checked)
                        }
                        disabled={isSubmitting}
                      />
                      <Label
                        htmlFor="active"
                        className="text-sm cursor-pointer"
                      >
                        {formData.active ? "Activo" : "Inactivo"}
                      </Label>
                    </div>
                  </div>
                </TabsContent>

                {/* Tab: Driver Info */}
                {isConductor && (
                  <TabsContent value="driver" className="space-y-4 mt-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="primaryFleetId" className="text-xs">
                          Flota Principal
                        </Label>
                        <Select
                          value={formData.primaryFleetId ?? "none"}
                          onValueChange={(value) =>
                            updateField(
                              "primaryFleetId",
                              value === "none" ? null : value,
                            )
                          }
                          disabled={isSubmitting}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sin flota" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin flota</SelectItem>
                            {fleets.map((fleet) => (
                              <SelectItem key={fleet.id} value={fleet.id}>
                                {fleet.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="driverStatus" className="text-xs">
                          Estado
                        </Label>
                        <Select
                          value={formData.driverStatus ?? "AVAILABLE"}
                          onValueChange={(value) =>
                            updateField("driverStatus", value)
                          }
                          disabled={isSubmitting}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DRIVER_STATUS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="identification" className="text-xs">
                          Identificación *
                        </Label>
                        <Input
                          id="identification"
                          value={formData.identification ?? ""}
                          onChange={(e) =>
                            updateField("identification", e.target.value)
                          }
                          disabled={isSubmitting}
                          className={
                            errors.identification ? "border-destructive" : ""
                          }
                          placeholder="12345678"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="birthDate" className="text-xs">
                          Fecha Nacimiento
                        </Label>
                        <Input
                          id="birthDate"
                          type="date"
                          value={
                            formData.birthDate
                              ? formData.birthDate.slice(0, 10)
                              : ""
                          }
                          onChange={(e) =>
                            updateField(
                              "birthDate",
                              e.target.value
                                ? `${e.target.value}T00:00:00.000Z`
                                : null,
                            )
                          }
                          disabled={isSubmitting}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="licenseNumber" className="text-xs">
                          Nº Licencia *
                        </Label>
                        <Input
                          id="licenseNumber"
                          value={formData.licenseNumber ?? ""}
                          onChange={(e) =>
                            updateField("licenseNumber", e.target.value)
                          }
                          disabled={isSubmitting}
                          className={
                            errors.licenseNumber ? "border-destructive" : ""
                          }
                          placeholder="LIC-12345"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="licenseExpiry" className="text-xs">
                          Vencimiento Licencia *
                        </Label>
                        <Input
                          id="licenseExpiry"
                          type="date"
                          value={
                            formData.licenseExpiry
                              ? formData.licenseExpiry.slice(0, 10)
                              : ""
                          }
                          onChange={(e) =>
                            updateField(
                              "licenseExpiry",
                              e.target.value
                                ? `${e.target.value}T00:00:00.000Z`
                                : null,
                            )
                          }
                          disabled={isSubmitting}
                          className={
                            errors.licenseExpiry ? "border-destructive" : ""
                          }
                        />
                        {licenseStatus === "expired" && (
                          <p className="text-xs text-destructive">
                            Licencia vencida
                          </p>
                        )}
                        {licenseStatus === "expiring_soon" && (
                          <p className="text-xs text-orange-500">
                            Vence pronto
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 pt-2">
                      <Label className="text-xs">Categorías de Licencia</Label>
                      <div className="flex flex-wrap gap-2">
                        {LICENSE_CATEGORIES.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => toggleLicenseCategory(cat)}
                            disabled={isSubmitting}
                            className={`px-2 py-1 text-xs rounded border transition-colors ${
                              selectedLicenseCategories.includes(cat)
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-input hover:bg-muted"
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="certifications" className="text-xs">
                        Certificaciones
                      </Label>
                      <Input
                        id="certifications"
                        value={formData.certifications ?? ""}
                        onChange={(e) =>
                          updateField("certifications", e.target.value || null)
                        }
                        disabled={isSubmitting}
                        placeholder="Carga peligrosa, Primeros auxilios..."
                      />
                    </div>
                  </TabsContent>
                )}
              </Tabs>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-4 mt-4 border-t">
                {onCancel && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    disabled={isSubmitting}
                  >
                    Cancelar
                  </Button>
                )}
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Guardando..." : submitLabel}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN - Roles */}
        {showRolesColumn && (
          <div className="lg:col-span-1">
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
                              className="scale-75"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium">
                                {role.name}
                              </span>
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
                              {Object.entries(permissions).map(
                                ([category, perms]) => (
                                  <div key={category}>
                                    <p className="text-xs font-medium text-muted-foreground uppercase">
                                      {category}
                                    </p>
                                    {perms
                                      .filter((p) => p.enabled)
                                      .map((perm) => (
                                        <p
                                          key={perm.id}
                                          className="text-xs pl-2"
                                        >
                                          • {perm.name}
                                        </p>
                                      ))}
                                  </div>
                                ),
                              )}
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
          </div>
        )}
      </div>
    </form>
  );
}
