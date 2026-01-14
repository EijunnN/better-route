"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DriverInput } from "@/lib/validations/driver";
import { isExpired, isExpiringSoon } from "@/lib/validations/driver";

interface DriverFormProps {
  onSubmit: (data: DriverInput) => Promise<void>;
  initialData?: Partial<DriverInput>;
  fleets: Array<{ id: string; name: string }>;
  submitLabel?: string;
}

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
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "C1", label: "C1" },
  { value: "CE", label: "CE" },
  { value: "D", label: "D" },
  { value: "D1", label: "D1" },
  { value: "DE", label: "DE" },
];

export function DriverForm({
  onSubmit,
  initialData,
  fleets,
  submitLabel = "Guardar",
}: DriverFormProps) {
  const defaultData: DriverInput = {
    fleetId: initialData?.fleetId ?? fleets[0]?.id ?? "",
    name: initialData?.name ?? "",
    identification: initialData?.identification ?? "",
    email: initialData?.email ?? "",
    phone: initialData?.phone ?? "",
    birthDate: initialData?.birthDate ?? "",
    photo: initialData?.photo ?? "",
    licenseNumber: initialData?.licenseNumber ?? "",
    licenseExpiry: initialData?.licenseExpiry ?? "",
    licenseCategories: initialData?.licenseCategories ?? "",
    certifications: initialData?.certifications ?? "",
    status: initialData?.status ?? "AVAILABLE",
    active: initialData?.active ?? true,
  };

  const [formData, setFormData] = useState<DriverInput>(defaultData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedLicenseCategories, setSelectedLicenseCategories] = useState<
    string[]
  >(initialData?.licenseCategories?.split(",").map((c) => c.trim()) || []);

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

    // Join selected license categories
    const submitData: DriverInput = {
      ...formData,
      licenseCategories: selectedLicenseCategories.join(", "),
    };

    try {
      await onSubmit(submitData);
    } catch (error) {
      const err = error as {
        details?: Array<{ path: string[]; message: string }>;
        error?: string;
      };
      if (err.details) {
        const fieldErrors: Record<string, string> = {};
        for (const detail of err.details) {
          fieldErrors[detail.path[0]] = detail.message;
        }
        setErrors(fieldErrors);
      } else {
        setErrors({ form: err.error || "Error al guardar el conductor" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (
    field: keyof DriverInput,
    value: DriverInput[keyof DriverInput],
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.form && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {errors.form}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Fleet Selection */}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="fleetId">Flota *</Label>
          <select
            id="fleetId"
            value={formData.fleetId}
            onChange={(e) => updateField("fleetId", e.target.value)}
            disabled={isSubmitting}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors"
          >
            {fleets.length === 0 ? (
              <option value="">No hay flotas disponibles</option>
            ) : (
              fleets.map((fleet) => (
                <option key={fleet.id} value={fleet.id}>
                  {fleet.name}
                </option>
              ))
            )}
          </select>
          {errors.fleetId && (
            <p className="text-sm text-destructive">{errors.fleetId}</p>
          )}
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Nombre Completo *</Label>
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

        {/* Identification */}
        <div className="space-y-2">
          <Label htmlFor="identification">Identificación *</Label>
          <Input
            id="identification"
            value={formData.identification}
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
            <p className="text-sm text-destructive">{errors.identification}</p>
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

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="phone">Teléfono</Label>
          <Input
            id="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            disabled={isSubmitting}
            className={
              errors.phone
                ? "border-destructive focus-visible:ring-destructive"
                : ""
            }
            placeholder="Ej: +1234567890"
          />
          {errors.phone && (
            <p className="text-sm text-destructive">{errors.phone}</p>
          )}
        </div>

        {/* Birth Date */}
        <div className="space-y-2">
          <Label htmlFor="birthDate">Fecha de Nacimiento</Label>
          <Input
            id="birthDate"
            type="date"
            value={formData.birthDate ? formData.birthDate.slice(0, 10) : ""}
            onChange={(e) => updateField("birthDate", e.target.value || "")}
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
            onChange={(e) => updateField("photo", e.target.value || "")}
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
            value={formData.licenseNumber}
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
            <p className="text-sm text-destructive">{errors.licenseNumber}</p>
          )}
        </div>

        {/* License Expiry */}
        <div className="space-y-2">
          <Label htmlFor="licenseExpiry">Vencimiento de Licencia *</Label>
          <Input
            id="licenseExpiry"
            type="datetime-local"
            value={
              formData.licenseExpiry ? formData.licenseExpiry.slice(0, 16) : ""
            }
            onChange={(e) => updateField("licenseExpiry", e.target.value)}
            disabled={isSubmitting}
            className={
              errors.licenseExpiry
                ? "border-destructive focus-visible:ring-destructive"
                : ""
            }
          />
          {errors.licenseExpiry && (
            <p className="text-sm text-destructive">{errors.licenseExpiry}</p>
          )}
          {licenseStatus === "expired" && (
            <p className="text-sm text-destructive font-medium">
              ⚠️ ¡Licencia vencida! El conductor será marcado como NO DISPONIBLE.
            </p>
          )}
          {licenseStatus === "expiring_soon" && (
            <p className="text-sm text-orange-500 font-medium">
              ⚠️ La licencia vence en menos de 30 días.
            </p>
          )}
        </div>

        {/* Status */}
        <div className="space-y-2">
          <Label htmlFor="status">Estado *</Label>
          <select
            id="status"
            value={formData.status}
            onChange={(e) => updateField("status", e.target.value)}
            disabled={isSubmitting}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors"
          >
            {DRIVER_STATUS.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
          {errors.status && (
            <p className="text-sm text-destructive">{errors.status}</p>
          )}
        </div>

        {/* License Categories */}
        <div className="space-y-2 sm:col-span-2">
          <Label>Categorías de Licencia *</Label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {LICENSE_CATEGORIES.map((category) => (
              <div key={category.value} className="flex items-center gap-2">
                <input
                  id={`license-${category.value}`}
                  type="checkbox"
                  checked={selectedLicenseCategories.includes(category.value)}
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
              updateField("certifications", e.target.value || "")
            }
            disabled={isSubmitting}
            rows={3}
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors resize-y"
            placeholder="Ej: Certificación de carga peligrosa, Primeros auxilios, etc."
          />
          {errors.certifications && (
            <p className="text-sm text-destructive">{errors.certifications}</p>
          )}
        </div>

        {/* Active status */}
        <div className="space-y-2 sm:col-span-2">
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
      </div>

      <div className="flex justify-end gap-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
