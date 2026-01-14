"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UserSkillInput } from "@/lib/validations/user-skill";
import { isExpired, isExpiringSoon } from "@/lib/validations/user-skill";

interface UserSkillFormProps {
  onSubmit: (data: UserSkillInput) => Promise<void>;
  initialData?: Partial<UserSkillInput>;
  users: Array<{ id: string; name: string; identification: string | null }>;
  skills: Array<{ id: string; code: string; name: string; category: string }>;
  submitLabel?: string;
}

const VEHICLE_SKILL_CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: "Equipamiento",
  TEMPERATURE: "Temperatura",
  CERTIFICATIONS: "Certificaciones",
  SPECIAL: "Especiales",
};

export function UserSkillForm({
  onSubmit,
  initialData,
  users,
  skills,
  submitLabel = "Guardar",
}: UserSkillFormProps) {
  const defaultData: UserSkillInput = {
    userId: initialData?.userId ?? users[0]?.id ?? "",
    skillId: initialData?.skillId ?? skills[0]?.id ?? "",
    obtainedAt: initialData?.obtainedAt ?? new Date().toISOString(),
    expiresAt: initialData?.expiresAt ?? "",
    active: initialData?.active ?? true,
  };

  const [formData, setFormData] = useState<UserSkillInput>(defaultData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate expiry status for alert display
  const expiryStatus = useMemo(() => {
    if (!formData.expiresAt) return null;
    if (isExpired(formData.expiresAt)) return "expired";
    if (isExpiringSoon(formData.expiresAt)) return "expiring_soon";
    return "valid";
  }, [formData.expiresAt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsSubmitting(true);

    try {
      await onSubmit(formData);
    } catch (error: unknown) {
      const err = error as {
        details?: Array<{ path: string[]; message: string }>;
        error?: string;
      };
      if (err.details) {
        const fieldErrors: Record<string, string> = {};
        err.details.forEach((e) => {
          fieldErrors[e.path[0]] = e.message;
        });
        setErrors(fieldErrors);
      } else {
        setErrors({
          form: err.error || "Error al guardar la habilidad del usuario",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (
    field: keyof UserSkillInput,
    value: UserSkillInput[keyof UserSkillInput],
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

  const getSkillCategoryLabel = (category: string) => {
    return VEHICLE_SKILL_CATEGORY_LABELS[category] || category;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.form && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {errors.form}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* User Selection */}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="userId">Usuario (Conductor) *</Label>
          <select
            id="userId"
            value={formData.userId}
            onChange={(e) => updateField("userId", e.target.value)}
            disabled={isSubmitting || !!initialData?.userId}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors"
          >
            {users.length === 0 ? (
              <option value="">No hay usuarios disponibles</option>
            ) : (
              users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                  {user.identification ? ` (${user.identification})` : ""}
                </option>
              ))
            )}
          </select>
          {errors.userId && (
            <p className="text-sm text-destructive">{errors.userId}</p>
          )}
        </div>

        {/* Skill Selection */}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="skillId">Habilidad *</Label>
          <select
            id="skillId"
            value={formData.skillId}
            onChange={(e) => updateField("skillId", e.target.value)}
            disabled={isSubmitting || !!initialData?.skillId}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-colors"
          >
            {skills.length === 0 ? (
              <option value="">No hay habilidades disponibles</option>
            ) : (
              skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.code} - {skill.name} (
                  {getSkillCategoryLabel(skill.category)})
                </option>
              ))
            )}
          </select>
          {errors.skillId && (
            <p className="text-sm text-destructive">{errors.skillId}</p>
          )}
        </div>

        {/* Obtained At */}
        <div className="space-y-2">
          <Label htmlFor="obtainedAt">Fecha de Obtencion</Label>
          <Input
            id="obtainedAt"
            type="datetime-local"
            value={formData.obtainedAt ? formData.obtainedAt.slice(0, 16) : ""}
            onChange={(e) => updateField("obtainedAt", e.target.value)}
            disabled={isSubmitting}
            className={
              errors.obtainedAt
                ? "border-destructive focus-visible:ring-destructive"
                : ""
            }
          />
          {errors.obtainedAt && (
            <p className="text-sm text-destructive">{errors.obtainedAt}</p>
          )}
        </div>

        {/* Expires At */}
        <div className="space-y-2">
          <Label htmlFor="expiresAt">Fecha de Vencimiento</Label>
          <Input
            id="expiresAt"
            type="datetime-local"
            value={formData.expiresAt ? formData.expiresAt.slice(0, 16) : ""}
            onChange={(e) => updateField("expiresAt", e.target.value || "")}
            disabled={isSubmitting}
            className={
              errors.expiresAt
                ? "border-destructive focus-visible:ring-destructive"
                : ""
            }
          />
          {errors.expiresAt && (
            <p className="text-sm text-destructive">{errors.expiresAt}</p>
          )}
          {expiryStatus === "expired" && (
            <p className="text-sm text-destructive font-medium">
              Habilidad vencida!
            </p>
          )}
          {expiryStatus === "expiring_soon" && (
            <p className="text-sm text-orange-500 font-medium">
              La habilidad vence en menos de 30 dias.
            </p>
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
