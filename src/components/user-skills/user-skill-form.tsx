"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserSkillInput } from "@/lib/validations/user-skill";
import { isExpired, isExpiringSoon } from "@/lib/validations/user-skill";

interface UserSkillFormProps {
  onSubmit: (data: UserSkillInput) => Promise<void>;
  initialData?: Partial<UserSkillInput>;
  users: Array<{ id: string; name: string; identification: string | null }>;
  skills: Array<{ id: string; code: string; name: string; category: string }>;
  submitLabel?: string;
  onCancel?: () => void;
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
  onCancel,
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
  const expiryStatus = !formData.expiresAt
    ? null
    : isExpired(formData.expiresAt)
      ? "expired"
      : isExpiringSoon(formData.expiresAt)
        ? "expiring_soon"
        : "valid";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const validationErrors: Record<string, string> = {};
    if (!formData.userId) validationErrors.userId = "Usuario es requerido";
    if (!formData.skillId) validationErrors.skillId = "Habilidad es requerida";
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit(formData);
    } catch (error: unknown) {
      const err = error as {
        details?: Array<{ path?: string[]; field?: string; message: string }>;
        error?: string;
      };
      if (err.details && Array.isArray(err.details)) {
        const fieldErrors: Record<string, string> = {};
        err.details.forEach((e) => {
          const fieldName = e.path?.[0] || e.field || "form";
          fieldErrors[fieldName] = e.message;
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
          <Select
            value={formData.userId}
            onValueChange={(value) => updateField("userId", value)}
            disabled={isSubmitting || !!initialData?.userId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar usuario" />
            </SelectTrigger>
            <SelectContent>
              {users.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  No hay usuarios disponibles
                </SelectItem>
              ) : (
                users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                    {user.identification ? ` (${user.identification})` : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {errors.userId && (
            <p className="text-sm text-destructive">{errors.userId}</p>
          )}
        </div>

        {/* Skill Selection */}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="skillId">Habilidad *</Label>
          <Select
            value={formData.skillId}
            onValueChange={(value) => updateField("skillId", value)}
            disabled={isSubmitting || !!initialData?.skillId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar habilidad" />
            </SelectTrigger>
            <SelectContent>
              {skills.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  No hay habilidades disponibles
                </SelectItem>
              ) : (
                skills.map((skill) => (
                  <SelectItem key={skill.id} value={skill.id}>
                    {skill.code} - {skill.name} (
                    {getSkillCategoryLabel(skill.category)})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {errors.skillId && (
            <p className="text-sm text-destructive">{errors.skillId}</p>
          )}
        </div>

        {/* Obtained At */}
        <div className="space-y-2">
          <Label htmlFor="obtainedAt">Fecha de Obtención</Label>
          <DatePicker
            id="obtainedAt"
            value={formData.obtainedAt ? new Date(formData.obtainedAt) : null}
            onChange={(date) =>
              updateField("obtainedAt", date ? date.toISOString() : "")
            }
            placeholder="Seleccionar fecha"
            disabled={isSubmitting}
          />
          {errors.obtainedAt && (
            <p className="text-sm text-destructive">{errors.obtainedAt}</p>
          )}
        </div>

        {/* Expires At */}
        <div className="space-y-2">
          <Label htmlFor="expiresAt">Fecha de Vencimiento</Label>
          <DatePicker
            id="expiresAt"
            value={formData.expiresAt ? new Date(formData.expiresAt) : null}
            onChange={(date) =>
              updateField("expiresAt", date ? date.toISOString() : "")
            }
            placeholder="Sin vencimiento"
            disabled={isSubmitting}
          />
          {errors.expiresAt && (
            <p className="text-sm text-destructive">{errors.expiresAt}</p>
          )}
          {expiryStatus === "expired" && (
            <p className="text-sm text-destructive font-medium">
              ¡Habilidad vencida!
            </p>
          )}
          {expiryStatus === "expiring_soon" && (
            <p className="text-sm text-orange-500 font-medium">
              La habilidad vence en menos de 30 días.
            </p>
          )}
        </div>

        {/* Active status */}
        <div className="space-y-2 sm:col-span-2">
          <Label>Estado del Registro</Label>
          <div className="flex items-center gap-2">
            <Checkbox
              id="active"
              checked={formData.active}
              onCheckedChange={(checked) =>
                updateField("active", checked === true)
              }
              disabled={isSubmitting}
            />
            <Label htmlFor="active" className="text-sm cursor-pointer">
              {formData.active ? "Activo" : "Inactivo"}
            </Label>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t">
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
    </form>
  );
}
