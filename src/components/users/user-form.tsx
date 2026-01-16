"use client";

import { ChevronDown, Shield, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  initialData?: Partial<CreateUserInput>;
  fleets: Array<{ id: string; name: string }>;
  roles?: CustomRole[];
  initialRoleIds?: string[];
  submitLabel?: string;
  isEditing?: boolean;
}

const USER_ROLES = [
  { value: "ADMIN_SISTEMA", label: "Administrador del Sistema" },
  { value: "ADMIN_FLOTA", label: "Administrador de Flota" },
  { value: "PLANIFICADOR", label: "Planificador" },
  { value: "MONITOR", label: "Monitor" },
  { value: "CONDUCTOR", label: "Conductor" },
];

const DRIVER_STATUS = [
  { value: "AVAILABLE", label: "Disponible" },
  { value: "ASSIGNED", label: "Asignado" },
  { value: "IN_ROUTE", label: "En Ruta" },
  { value: "ON_PAUSE", label: "En Pausa" },
  { value: "COMPLETED", label: "Completado" },
  { value: "UNAVAILABLE", label: "No Disponible" },
  { value: "ABSENT", label: "Ausente" },
];

const LICENSE_CATEGORIES = [
  { value: "A", label: "A" },
  { value: "A1", label: "A1" },
  { value: "A2", label: "A2" },
  { value: "A3", label: "A3" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "C1", label: "C1" },
  { value: "CE", label: "CE" },
  { value: "D", label: "D" },
  { value: "D1", label: "D1" },
  { value: "DE", label: "DE" },
];

export function UserForm({
  onSubmit,
  initialData,
  fleets,
  roles = [],
  initialRoleIds = [],
  submitLabel = "Guardar",
  isEditing = false,
}: UserFormProps) {
  const defaultData: CreateUserInput = {
    name: initialData?.name ?? "",
    email: initialData?.email ?? "",
    username: initialData?.username ?? "",
    password: "",
    role: initialData?.role ?? "CONDUCTOR",
    phone: initialData?.phone ?? "",
    // Driver-specific fields
    identification: initialData?.identification ?? "",
    birthDate: initialData?.birthDate ?? null,
    photo: initialData?.photo ?? "",
    licenseNumber: initialData?.licenseNumber ?? "",
    licenseExpiry: initialData?.licenseExpiry ?? null,
    licenseCategories: initialData?.licenseCategories ?? "",
    certifications: initialData?.certifications ?? "",
    driverStatus: initialData?.driverStatus ?? "AVAILABLE",
    primaryFleetId: initialData?.primaryFleetId ?? (fleets[0]?.id || null),
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
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(initialRoleIds);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [rolePermissions, setRolePermissions] = useState<Record<string, GroupedPermissions>>({});
  const [loadingPermissions, setLoadingPermissions] = useState<string | null>(null);

  // Fetch permissions for a role when expanded
  const fetchRolePermissions = useCallback(async (roleId: string) => {
    if (rolePermissions[roleId]) return; // Already fetched

    setLoadingPermissions(roleId);
    try {
      const response = await fetch(`/api/roles/${roleId}/permissions`);
      if (response.ok) {
        const data = await response.json();
        setRolePermissions(prev => ({
          ...prev,
          [roleId]: data.permissions || {}
        }));
      }
    } catch (error) {
      console.error("Error fetching role permissions:", error);
    } finally {
      setLoadingPermissions(null);
    }
  }, [rolePermissions]);

  // Handle role expansion
  const handleExpandRole = useCallback((roleId: string) => {
    if (expandedRoleId === roleId) {
      setExpandedRoleId(null);
    } else {
      setExpandedRoleId(roleId);
      fetchRolePermissions(roleId);
    }
  }, [expandedRoleId, fetchRolePermissions]);

  // Check if current role is CONDUCTOR
  const isConductor = formData.role === "CONDUCTOR";

  // Calculate license status for alert display
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

    // Helper to convert empty strings to null
    const emptyToNull = (value: string | null | undefined): string | null => {
      if (value === undefined || value === null || value.trim() === "") {
        return null;
      }
      return value;
    };

    // Prepare submit data
    const submitData: CreateUserInput = {
      ...formData,
      // Convert empty strings to null for optional fields
      phone: emptyToNull(formData.phone),
      photo: emptyToNull(formData.photo),
      birthDate: emptyToNull(formData.birthDate),
      certifications: emptyToNull(formData.certifications),
      licenseCategories: isConductor
        ? (selectedLicenseCategories.length > 0 ? selectedLicenseCategories.join(", ") : null)
        : null,
      // Clear driver fields if not a conductor
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
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const toggleLicenseCategory = (category: string) => {
    setSelectedLicenseCategories((prev) => {
      if (prev.includes(category)) {
        return prev.filter((c) => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      if (prev.includes(roleId)) {
        return prev.filter((id) => id !== roleId);
      } else {
        return [...prev, roleId];
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.form && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {errors.form}
        </div>
      )}

      {/* Basic User Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Información del Usuario</h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
              disabled={isSubmitting}
              className={
                errors.name
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
              placeholder="Ej: Juan Pérez"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Correo Electrónico *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => updateField("email", e.target.value)}
              disabled={isSubmitting}
              className={
                errors.email
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
              placeholder="Ej: juan.perez@empresa.com"
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email}</p>
            )}
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">Nombre de Usuario *</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => updateField("username", e.target.value)}
              disabled={isSubmitting}
              className={
                errors.username
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
              placeholder="Ej: juan_perez"
            />
            <p className="text-xs text-muted-foreground">
              Solo letras, números y guiones bajos
            </p>
            {errors.username && (
              <p className="text-sm text-destructive">{errors.username}</p>
            )}
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label htmlFor="role">Rol Base *</Label>
            <Select
              value={formData.role}
              onValueChange={(value) => updateField("role", value)}
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar rol" />
              </SelectTrigger>
              <SelectContent>
                {USER_ROLES.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.role && (
              <p className="text-sm text-destructive">{errors.role}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono (opcional)</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone ?? ""}
              onChange={(e) => updateField("phone", e.target.value || null)}
              disabled={isSubmitting}
              className={
                errors.phone
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
              placeholder="Ej: +51 999 999 999"
            />
            {errors.phone && (
              <p className="text-sm text-destructive">{errors.phone}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password">
              Contraseña {isEditing ? "(dejar vacío para mantener)" : "*"}
            </Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => updateField("password", e.target.value)}
              disabled={isSubmitting}
              className={
                errors.password
                  ? "border-destructive focus-visible:ring-destructive"
                  : ""
              }
              placeholder={isEditing ? "••••••••" : "Mínimo 8 caracteres"}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password}</p>
            )}
          </div>
        </div>
      </div>

      {/* Custom Roles Assignment */}
      {roles.length > 0 && (
        <Card className="border-t-0 rounded-t-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Roles y Permisos
            </CardTitle>
            <CardDescription>
              Active los roles que desea asignar al usuario. Expanda cada rol para ver sus permisos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {roles.map((role) => {
              const isSelected = selectedRoleIds.includes(role.id);
              const isExpanded = expandedRoleId === role.id;
              const permissions = rolePermissions[role.id];
              const isLoading = loadingPermissions === role.id;
              const totalPermissions = permissions
                ? Object.values(permissions).flat().filter(p => p.enabled).length
                : role.permissionsCount || 0;

              return (
                <div
                  key={role.id}
                  className={`rounded-lg border transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  {/* Role Header */}
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Switch
                        checked={isSelected}
                        onCheckedChange={() => toggleRole(role.id)}
                        disabled={isSubmitting}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{role.name}</span>
                          {role.isSystem && (
                            <Badge variant="secondary" className="text-xs">
                              Sistema
                            </Badge>
                          )}
                          {isSelected && (
                            <Badge variant="default" className="text-xs">
                              <ShieldCheck className="h-3 w-3 mr-1" />
                              Activo
                            </Badge>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {role.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExpandRole(role.id)}
                      className="ml-2"
                    >
                      <span className="text-xs text-muted-foreground mr-1">
                        {totalPermissions} permisos
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </Button>
                  </div>

                  {/* Permissions Panel (Collapsible) */}
                  {isExpanded && (
                    <div className="border-t px-4 py-3 bg-muted/30">
                      {isLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
                          <span className="ml-2 text-sm text-muted-foreground">Cargando permisos...</span>
                        </div>
                      ) : permissions && Object.keys(permissions).length > 0 ? (
                        <div className="space-y-4">
                          {Object.entries(permissions).map(([category, perms]) => {
                            const enabledCount = perms.filter(p => p.enabled).length;
                            return (
                              <div key={category}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    {category}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {enabledCount}/{perms.length}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {perms.map((perm) => (
                                    <div
                                      key={perm.id}
                                      className={`flex items-center gap-2 text-sm p-2 rounded ${
                                        perm.enabled
                                          ? "bg-green-50 dark:bg-green-900/20"
                                          : "bg-muted/50"
                                      }`}
                                    >
                                      <div className={`h-2 w-2 rounded-full ${
                                        perm.enabled
                                          ? "bg-green-500"
                                          : "bg-muted-foreground/30"
                                      }`} />
                                      <span className={perm.enabled ? "" : "text-muted-foreground"}>
                                        {perm.name}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-2">
                          Este rol no tiene permisos configurados.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {selectedRoleIds.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                No hay roles adicionales asignados. El usuario tendrá los permisos del rol base.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Driver-specific fields - Only show if role is CONDUCTOR */}
      {isConductor && (
        <div className="space-y-4 border-t pt-6">
          <h3 className="text-lg font-medium">Información de Conductor</h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Primary Fleet Selection */}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="primaryFleetId">Flota Principal</Label>
              <Select
                value={formData.primaryFleetId ?? "none"}
                onValueChange={(value) =>
                  updateField("primaryFleetId", value === "none" ? null : value)
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin flota asignada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin flota asignada</SelectItem>
                  {fleets.map((fleet) => (
                    <SelectItem key={fleet.id} value={fleet.id}>
                      {fleet.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.primaryFleetId && (
                <p className="text-sm text-destructive">
                  {errors.primaryFleetId}
                </p>
              )}
            </div>

            {/* Identification */}
            <div className="space-y-2">
              <Label htmlFor="identification">Identificación *</Label>
              <Input
                id="identification"
                value={formData.identification ?? ""}
                onChange={(e) => updateField("identification", e.target.value)}
                disabled={isSubmitting}
                className={
                  errors.identification
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }
                placeholder="Ej: 12345678"
              />
              {errors.identification && (
                <p className="text-sm text-destructive">
                  {errors.identification}
                </p>
              )}
            </div>

            {/* Birth Date */}
            <div className="space-y-2">
              <Label htmlFor="birthDate">Fecha de Nacimiento</Label>
              <Input
                id="birthDate"
                type="date"
                value={
                  formData.birthDate ? formData.birthDate.slice(0, 10) : ""
                }
                onChange={(e) =>
                  updateField(
                    "birthDate",
                    e.target.value ? `${e.target.value}T00:00:00.000Z` : null,
                  )
                }
                disabled={isSubmitting}
                className={
                  errors.birthDate
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }
              />
              {errors.birthDate && (
                <p className="text-sm text-destructive">{errors.birthDate}</p>
              )}
            </div>

            {/* Photo URL */}
            <div className="space-y-2">
              <Label htmlFor="photo">URL de Fotografía</Label>
              <Input
                id="photo"
                type="url"
                value={formData.photo ?? ""}
                onChange={(e) => updateField("photo", e.target.value || null)}
                disabled={isSubmitting}
                className={
                  errors.photo
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }
                placeholder="Ej: https://ejemplo.com/foto.jpg"
              />
              {errors.photo && (
                <p className="text-sm text-destructive">{errors.photo}</p>
              )}
            </div>

            {/* License Number */}
            <div className="space-y-2">
              <Label htmlFor="licenseNumber">Número de Licencia *</Label>
              <Input
                id="licenseNumber"
                value={formData.licenseNumber ?? ""}
                onChange={(e) => updateField("licenseNumber", e.target.value)}
                disabled={isSubmitting}
                className={
                  errors.licenseNumber
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }
                placeholder="Ej: LIC-12345"
              />
              {errors.licenseNumber && (
                <p className="text-sm text-destructive">
                  {errors.licenseNumber}
                </p>
              )}
            </div>

            {/* License Expiry */}
            <div className="space-y-2">
              <Label htmlFor="licenseExpiry">Vencimiento de Licencia *</Label>
              <Input
                id="licenseExpiry"
                type="datetime-local"
                value={
                  formData.licenseExpiry
                    ? formData.licenseExpiry.slice(0, 16)
                    : ""
                }
                onChange={(e) =>
                  updateField(
                    "licenseExpiry",
                    e.target.value ? `${e.target.value}:00.000Z` : null,
                  )
                }
                disabled={isSubmitting}
                className={
                  errors.licenseExpiry
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }
              />
              {errors.licenseExpiry && (
                <p className="text-sm text-destructive">
                  {errors.licenseExpiry}
                </p>
              )}
              {licenseStatus === "expired" && (
                <p className="text-sm text-destructive font-medium">
                  La licencia está vencida. El conductor será marcado como NO
                  DISPONIBLE.
                </p>
              )}
              {licenseStatus === "expiring_soon" && (
                <p className="text-sm text-orange-500 font-medium">
                  La licencia vence en menos de 30 días.
                </p>
              )}
            </div>

            {/* Driver Status */}
            <div className="space-y-2">
              <Label htmlFor="driverStatus">Estado de Conductor</Label>
              <Select
                value={formData.driverStatus ?? "AVAILABLE"}
                onValueChange={(value) => updateField("driverStatus", value)}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                  {DRIVER_STATUS.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.driverStatus && (
                <p className="text-sm text-destructive">
                  {errors.driverStatus}
                </p>
              )}
            </div>

            {/* License Categories */}
            <div className="space-y-2 sm:col-span-2">
              <Label>Categorías de Licencia</Label>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {LICENSE_CATEGORIES.map((category) => (
                  <div key={category.value} className="flex items-center gap-2">
                    <input
                      id={`license-${category.value}`}
                      type="checkbox"
                      checked={selectedLicenseCategories.includes(
                        category.value,
                      )}
                      onChange={() => toggleLicenseCategory(category.value)}
                      disabled={isSubmitting}
                      className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
                    />
                    <Label
                      htmlFor={`license-${category.value}`}
                      className="text-sm cursor-pointer"
                    >
                      {category.label}
                    </Label>
                  </div>
                ))}
              </div>
              {errors.licenseCategories && (
                <p className="text-sm text-destructive">
                  {errors.licenseCategories}
                </p>
              )}
            </div>

            {/* Certifications */}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="certifications">Certificaciones</Label>
              <textarea
                id="certifications"
                value={formData.certifications ?? ""}
                onChange={(e) =>
                  updateField("certifications", e.target.value || null)
                }
                disabled={isSubmitting}
                rows={3}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors resize-y"
                placeholder="Ej: Certificación de carga peligrosa, Primeros auxilios, etc."
              />
              {errors.certifications && (
                <p className="text-sm text-destructive">
                  {errors.certifications}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active status */}
      <div className="space-y-2 border-t pt-6">
        <Label htmlFor="active">Estado del Registro</Label>
        <div className="flex items-center gap-3">
          <Switch
            id="active"
            checked={formData.active}
            onCheckedChange={(checked) => updateField("active", checked)}
            disabled={isSubmitting}
          />
          <span className="text-sm">
            {formData.active ? (
              <Badge variant="default">Activo</Badge>
            ) : (
              <Badge variant="secondary">Inactivo</Badge>
            )}
          </span>
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
