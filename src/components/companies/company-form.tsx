"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CompanyInput } from "@/lib/validations/company";

interface CompanyFormProps {
  onSubmit: (data: CompanyInput) => Promise<void>;
  initialData?: Partial<CompanyInput>;
  submitLabel?: string;
}

const COUNTRIES = [
  { code: "US", name: "Estados Unidos" },
  { code: "MX", name: "México" },
  { code: "AR", name: "Argentina" },
  { code: "CO", name: "Colombia" },
  { code: "CL", name: "Chile" },
  { code: "PE", name: "Perú" },
  { code: "ES", name: "España" },
];

const CURRENCIES = [
  { code: "USD", name: "Dólar estadounidense" },
  { code: "EUR", name: "Euro" },
  { code: "MXN", name: "Peso mexicano" },
  { code: "ARS", name: "Peso argentino" },
  { code: "COP", name: "Peso colombiano" },
  { code: "CLP", name: "Peso chileno" },
];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Santiago",
  "America/Lima",
  "Europe/Madrid",
];

const DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "31/12/2024" },
  { value: "MM/DD/YYYY", label: "12/31/2024" },
  { value: "YYYY-MM-DD", label: "2024-12-31" },
];

export function CompanyForm({
  onSubmit,
  initialData,
  submitLabel = "Guardar",
}: CompanyFormProps) {
  const defaultData: CompanyInput = {
    legalName: initialData?.legalName ?? "",
    commercialName: initialData?.commercialName ?? "",
    email: initialData?.email ?? "",
    phone: initialData?.phone ?? "",
    taxAddress: initialData?.taxAddress ?? "",
    country: initialData?.country ?? "US",
    timezone: initialData?.timezone ?? "UTC",
    currency: initialData?.currency ?? "USD",
    dateFormat: initialData?.dateFormat ?? "DD/MM/YYYY",
    active: initialData?.active ?? true,
  };

  const [formData, setFormData] = useState<CompanyInput>(defaultData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    try {
      await onSubmit(formData);
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
        setErrors({ form: err.error || "Error al guardar la empresa" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (
    field: keyof CompanyInput,
    value: CompanyInput[keyof CompanyInput],
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.form && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {errors.form}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="legalName">Nombre Legal *</Label>
          <Input
            id="legalName"
            value={formData.legalName}
            onChange={(e) => updateField("legalName", e.target.value)}
            disabled={isSubmitting}
            className={
              errors.legalName
                ? "border-destructive focus-visible:ring-destructive"
                : ""
            }
          />
          {errors.legalName && (
            <p className="text-sm text-destructive">{errors.legalName}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="commercialName">Nombre Comercial *</Label>
          <Input
            id="commercialName"
            value={formData.commercialName}
            onChange={(e) => updateField("commercialName", e.target.value)}
            disabled={isSubmitting}
            className={
              errors.commercialName
                ? "border-destructive focus-visible:ring-destructive"
                : ""
            }
          />
          {errors.commercialName && (
            <p className="text-sm text-destructive">{errors.commercialName}</p>
          )}
        </div>

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
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Teléfono</Label>
          <Input
            id="phone"
            value={formData.phone || ""}
            onChange={(e) => updateField("phone", e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="taxAddress">Dirección Fiscal</Label>
          <Input
            id="taxAddress"
            value={formData.taxAddress || ""}
            onChange={(e) => updateField("taxAddress", e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="country">País *</Label>
          <select
            id="country"
            value={formData.country}
            onChange={(e) => updateField("country", e.target.value)}
            disabled={isSubmitting}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors"
          >
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="currency">Moneda *</Label>
          <select
            id="currency"
            value={formData.currency}
            onChange={(e) => updateField("currency", e.target.value)}
            disabled={isSubmitting}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors"
          >
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} - {currency.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="timezone">Zona Horaria *</Label>
          <select
            id="timezone"
            value={formData.timezone}
            onChange={(e) => updateField("timezone", e.target.value)}
            disabled={isSubmitting}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dateFormat">Formato de Fecha *</Label>
          <select
            id="dateFormat"
            value={formData.dateFormat}
            onChange={(e) => updateField("dateFormat", e.target.value)}
            disabled={isSubmitting}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors"
          >
            {DATE_FORMATS.map((format) => (
              <option key={format.value} value={format.value}>
                {format.label}
              </option>
            ))}
          </select>
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
