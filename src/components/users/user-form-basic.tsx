"use client";

import { Info } from "lucide-react";
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
import { useUserForm } from "./user-form-context";

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

export function UserFormBasic() {
  const { state, actions, meta } = useUserForm();
  const { formData, errors, isSubmitting } = state;
  const { updateField } = actions;
  const { isEditing } = meta;

  return (
    <div className="space-y-4 mt-4">
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
            <p className="text-xs text-destructive">{errors.name}</p>
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
            <p className="text-xs text-destructive">{errors.email}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="username" className="text-xs">
            Usuario *
          </Label>
          <Input
            id="username"
            value={formData.username}
            onChange={(e) => updateField("username", e.target.value)}
            disabled={isSubmitting}
            className={errors.username ? "border-destructive" : ""}
            placeholder="juan_perez"
          />
          {errors.username && (
            <p className="text-xs text-destructive">{errors.username}</p>
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
            onChange={(e) => updateField("password", e.target.value)}
            disabled={isSubmitting}
            className={errors.password ? "border-destructive" : ""}
            placeholder={isEditing ? "••••••••" : "Mín. 8 caracteres"}
          />
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password}</p>
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
          {formData.role && ROLE_PERMISSIONS_INFO[formData.role] && (
            <p className="text-xs text-muted-foreground flex items-start gap-1 mt-1">
              <Info className="size-3 mt-0.5 shrink-0" />
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
            onChange={(e) => updateField("phone", e.target.value || null)}
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
            onCheckedChange={(checked) => updateField("active", checked)}
            disabled={isSubmitting}
          />
          <Label htmlFor="active" className="text-sm cursor-pointer">
            {formData.active ? "Activo" : "Inactivo"}
          </Label>
        </div>
      </div>
    </div>
  );
}
