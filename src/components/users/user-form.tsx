"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreateUserInput } from "@/lib/validations/user";
import { isExpired, isExpiringSoon } from "@/lib/validations/user";

interface UserFormProps {
  onSubmit: (data: CreateUserInput) => Promise<void>;
  initialData?: Partial<CreateUserInput>;
  fleets: Array<{ id: string; name: string }>;
  submitLabel?: string;
  isEditing?: boolean;
}

const USER_ROLES = [
  { value: "ADMIN", label: "Administrador" },
  { value: "CONDUCTOR", label: "Conductor" },
  { value: "AGENTE_SEGUIMIENTO", label: "Agente de Seguimiento" },
  { value: "PLANIFICADOR", label: "Planificador" },
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

    // Prepare submit data
    const submitData: CreateUserInput = {
      ...formData,
      licenseCategories: isConductor
        ? selectedLicenseCategories.join(", ")
        : null,
      // Clear driver fields if not a conductor
      identification: isConductor ? formData.identification : null,
      licenseNumber: isConductor ? formData.licenseNumber : null,
      licenseExpiry: isConductor ? formData.licenseExpiry : null,
      driverStatus: isConductor ? formData.driverStatus : null,
      primaryFleetId: isConductor ? formData.primaryFleetId : null,
    };

    try {
      await onSubmit(submitData);
    } catch (error: any) {
      if (error.details) {
        const fieldErrors: Record<string, string> = {};
        error.details.forEach((err: any) => {
          fieldErrors[err.path[0]] = err.message;
        });
        setErrors(fieldErrors);
      } else {
        setErrors({ form: error.error || "Error al guardar el usuario" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (field: keyof CreateUserInput, value: any) => {
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
            <Label htmlFor="role">Rol *</Label>
            <select
              id="role"
              value={formData.role}
              onChange={(e) => updateField("role", e.target.value)}
              disabled={isSubmitting}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors"
            >
              {USER_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
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

      {/* Driver-specific fields - Only show if role is CONDUCTOR */}
      {isConductor && (
        <div className="space-y-4 border-t pt-6">
          <h3 className="text-lg font-medium">Información de Conductor</h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Primary Fleet Selection */}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="primaryFleetId">Flota Principal</Label>
              <select
                id="primaryFleetId"
                value={formData.primaryFleetId ?? ""}
                onChange={(e) =>
                  updateField("primaryFleetId", e.target.value || null)
                }
                disabled={isSubmitting}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors"
              >
                <option value="">Sin flota asignada</option>
                {fleets.map((fleet) => (
                  <option key={fleet.id} value={fleet.id}>
                    {fleet.name}
                  </option>
                ))}
              </select>
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
              <select
                id="driverStatus"
                value={formData.driverStatus ?? "AVAILABLE"}
                onChange={(e) => updateField("driverStatus", e.target.value)}
                disabled={isSubmitting}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors"
              >
                {DRIVER_STATUS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
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
        <div className="flex items-center gap-2">
          <input
            id="active"
            type="checkbox"
            checked={formData.active}
            onChange={(e) => updateField("active", e.target.checked)}
            disabled={isSubmitting}
            className="h-4 w-4 rounded border-input bg-background text-primary focus:ring-2 focus:ring-ring"
          />
          <span className="text-sm text-muted-foreground">
            {formData.active ? "Activo" : "Inactivo"}
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
