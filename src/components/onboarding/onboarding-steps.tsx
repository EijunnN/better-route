"use client";

import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  Globe,
  Loader2,
  MapPin,
  Route,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ==========================================
// Step Indicator
// ==========================================

interface StepIndicatorProps {
  currentStep: number;
}

const steps = [
  { icon: Sparkles, label: "Bienvenida" },
  { icon: Building2, label: "Empresa" },
  { icon: CheckCircle2, label: "Listo" },
];

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-3">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;

        return (
          <div key={step.label} className="flex items-center gap-3">
            {index > 0 && (
              <div
                className={`h-px w-8 transition-colors ${
                  isCompleted ? "bg-primary" : "bg-border"
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span
                className={`text-xs ${
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==========================================
// Welcome Step
// ==========================================

interface WelcomeStepProps {
  onNext: () => void;
}

const features = [
  {
    icon: Route,
    title: "Optimizacion de Rutas",
    description: "Algoritmos avanzados para planificar las rutas mas eficientes",
  },
  {
    icon: Truck,
    title: "Gestion de Flota",
    description: "Control completo de vehiculos, conductores y flotas",
  },
  {
    icon: TrendingUp,
    title: "Monitoreo en Tiempo Real",
    description: "Seguimiento GPS y alertas para operaciones en vivo",
  },
];

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-foreground">
          Bienvenido a BetterRoute
        </h2>
        <p className="text-sm text-muted-foreground">
          Configura tu empresa para comenzar a optimizar tus operaciones de
          logistica.
        </p>
      </div>

      <div className="grid gap-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.title}
              className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{feature.title}</p>
                <p className="text-xs text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <Button onClick={onNext} className="w-full font-semibold">
        Comenzar
      </Button>
    </div>
  );
}

// ==========================================
// Company Form Step
// ==========================================

interface CompanyFormStepProps {
  onSubmit: (data: CompanyFormData) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export interface CompanyFormData {
  legalName: string;
  commercialName: string;
  email: string;
  country: string;
  timezone: string;
  currency: string;
}

const COUNTRIES = [
  { code: "PE", name: "Peru" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" },
  { code: "BR", name: "Brasil" },
  { code: "EC", name: "Ecuador" },
  { code: "BO", name: "Bolivia" },
  { code: "US", name: "Estados Unidos" },
];

const TIMEZONES = [
  { value: "America/Lima", label: "Lima (UTC-5)" },
  { value: "America/Santiago", label: "Santiago (UTC-3/-4)" },
  { value: "America/Bogota", label: "Bogota (UTC-5)" },
  { value: "America/Mexico_City", label: "Ciudad de Mexico (UTC-6)" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (UTC-3)" },
  { value: "America/Sao_Paulo", label: "Sao Paulo (UTC-3)" },
  { value: "America/Guayaquil", label: "Guayaquil (UTC-5)" },
  { value: "America/La_Paz", label: "La Paz (UTC-4)" },
  { value: "America/New_York", label: "New York (UTC-5)" },
  { value: "UTC", label: "UTC" },
];

const CURRENCIES = [
  { code: "PEN", name: "Sol Peruano (PEN)" },
  { code: "CLP", name: "Peso Chileno (CLP)" },
  { code: "COP", name: "Peso Colombiano (COP)" },
  { code: "MXN", name: "Peso Mexicano (MXN)" },
  { code: "ARS", name: "Peso Argentino (ARS)" },
  { code: "BRL", name: "Real Brasileno (BRL)" },
  { code: "USD", name: "Dolar (USD)" },
];

export function CompanyFormStep({
  onSubmit,
  isLoading,
  error,
}: CompanyFormStepProps) {
  const [form, setForm] = useState<CompanyFormData>({
    legalName: "",
    commercialName: "",
    email: "",
    country: "PE",
    timezone: "America/Lima",
    currency: "PEN",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.legalName.trim()) errors.legalName = "Nombre legal es requerido";
    if (!form.commercialName.trim())
      errors.commercialName = "Nombre comercial es requerido";
    if (!form.email.trim()) errors.email = "Correo es requerido";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errors.email = "Correo invalido";
    if (!form.country) errors.country = "Pais es requerido";

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(form);
  };

  const updateField = (field: keyof CompanyFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold text-foreground">
          Datos de la Empresa
        </h2>
        <p className="text-sm text-muted-foreground">
          Ingresa los datos de tu empresa para configurar el sistema.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Legal Name */}
        <div className="space-y-1.5">
          <Label htmlFor="legalName">
            Razon Social <span className="text-destructive">*</span>
          </Label>
          <Input
            id="legalName"
            placeholder="Empresa S.A.C."
            value={form.legalName}
            onChange={(e) => updateField("legalName", e.target.value)}
            className={fieldErrors.legalName ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {fieldErrors.legalName && (
            <p className="text-xs text-destructive">{fieldErrors.legalName}</p>
          )}
        </div>

        {/* Commercial Name */}
        <div className="space-y-1.5">
          <Label htmlFor="commercialName">
            Nombre Comercial <span className="text-destructive">*</span>
          </Label>
          <Input
            id="commercialName"
            placeholder="Mi Empresa"
            value={form.commercialName}
            onChange={(e) => updateField("commercialName", e.target.value)}
            className={
              fieldErrors.commercialName ? "border-destructive" : ""
            }
            disabled={isLoading}
          />
          {fieldErrors.commercialName && (
            <p className="text-xs text-destructive">
              {fieldErrors.commercialName}
            </p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="companyEmail">
            Correo de la Empresa <span className="text-destructive">*</span>
          </Label>
          <Input
            id="companyEmail"
            type="email"
            placeholder="contacto@empresa.com"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            className={fieldErrors.email ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {fieldErrors.email && (
            <p className="text-xs text-destructive">{fieldErrors.email}</p>
          )}
        </div>

        {/* Country + Timezone row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>
              <Globe className="inline h-3.5 w-3.5 mr-1" />
              Pais
            </Label>
            <Select
              value={form.country}
              onValueChange={(v) => updateField("country", v)}
              disabled={isLoading}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              <MapPin className="inline h-3.5 w-3.5 mr-1" />
              Zona Horaria
            </Label>
            <Select
              value={form.timezone}
              onValueChange={(v) => updateField("timezone", v)}
              disabled={isLoading}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Currency */}
        <div className="space-y-1.5">
          <Label>Moneda</Label>
          <Select
            value={form.currency}
            onValueChange={(v) => updateField("currency", v)}
            disabled={isLoading}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="submit"
          className="w-full font-semibold"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creando empresa...
            </>
          ) : (
            <>
              <Building2 className="mr-2 h-4 w-4" />
              Crear Empresa
            </>
          )}
        </Button>
      </form>
    </div>
  );
}

// ==========================================
// Success Step
// ==========================================

interface SuccessStepProps {
  companyName: string;
  rolesCount: number;
  permissionsCount: number;
  onFinish: () => void;
}

export function SuccessStep({
  companyName,
  rolesCount,
  permissionsCount,
  onFinish,
}: SuccessStepProps) {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--chart-2))]/10">
        <CheckCircle2 className="h-8 w-8 text-[hsl(var(--chart-2))]" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold text-foreground">
          Configuracion Completa
        </h2>
        <p className="text-sm text-muted-foreground">
          Tu empresa ha sido creada exitosamente.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-left space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <span className="text-sm">
            Empresa: <strong>{companyName}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm">
            <strong>{rolesCount}</strong> roles del sistema creados
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <span className="text-sm">
            <strong>{permissionsCount}</strong> permisos configurados
          </span>
        </div>
      </div>

      {/* Next steps */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-left">
        <p className="text-sm font-medium mb-2">Proximos pasos:</p>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>1. Crear flotas para organizar tus vehiculos</li>
          <li>2. Registrar vehiculos y conductores</li>
          <li>3. Importar pedidos y optimizar rutas</li>
        </ul>
      </div>

      <Button onClick={onFinish} className="w-full font-semibold">
        Ir al Dashboard
      </Button>
    </div>
  );
}
