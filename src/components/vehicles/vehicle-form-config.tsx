"use client";

import { Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { LICENSE_CATEGORIES } from "@/lib/validations/vehicle";
import { useVehicleForm } from "./vehicle-form-context";

const SKILL_CATEGORY_LABELS: Record<string, string> = {
  EQUIPMENT: "Equipamiento",
  TEMPERATURE: "Temperatura",
  CERTIFICATIONS: "Certificaciones",
  SPECIAL: "Especial",
};

export function VehicleFormConfig() {
  const { state, actions, meta } = useVehicleForm();
  const { formData, isSubmitting, selectedSkillIds } = state;
  const { updateField, toggleSkillSelection } = actions;
  const { drivers, availableSkills } = meta;

  // Group skills by category
  const skillsByCategory = availableSkills.reduce(
    (acc, skill) => {
      const category = skill.category || "SPECIAL";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(skill);
      return acc;
    },
    {} as Record<string, typeof availableSkills>,
  );

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardContent className="pt-4 space-y-4">
          <h4 className="font-medium text-sm">Conductor Asignado</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="assignedDriverId" className="text-xs">
                Conductor
              </Label>
              <Select
                value={formData.assignedDriverId ?? "__none__"}
                onValueChange={(value) =>
                  updateField(
                    "assignedDriverId",
                    value === "__none__" ? null : value,
                  )
                }
                disabled={isSubmitting}
              >
                <SelectTrigger id="assignedDriverId">
                  <SelectValue placeholder="Sin conductor asignado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin conductor</SelectItem>
                  {drivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="licenseRequired" className="text-xs">
                Licencia mínima requerida
              </Label>
              <Select
                value={formData.licenseRequired ?? "__none__"}
                onValueChange={(value) =>
                  updateField(
                    "licenseRequired",
                    value === "__none__"
                      ? null
                      : (value as (typeof LICENSE_CATEGORIES)[number]),
                  )
                }
                disabled={isSubmitting}
              >
                <SelectTrigger id="licenseRequired">
                  <SelectValue placeholder="No requiere" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No requiere</SelectItem>
                  {LICENSE_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Categoría mínima de licencia que debe tener el conductor
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <h4 className="font-medium text-sm">Vencimientos</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="insuranceExpiry" className="text-xs">
                Seguro
              </Label>
              <DatePicker
                id="insuranceExpiry"
                value={
                  formData.insuranceExpiry
                    ? new Date(formData.insuranceExpiry)
                    : null
                }
                onChange={(date) =>
                  updateField(
                    "insuranceExpiry",
                    date ? date.toISOString().split("T")[0] : null,
                  )
                }
                placeholder="Fecha"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inspectionExpiry" className="text-xs">
                Inspección
              </Label>
              <DatePicker
                id="inspectionExpiry"
                value={
                  formData.inspectionExpiry
                    ? new Date(formData.inspectionExpiry)
                    : null
                }
                onChange={(date) =>
                  updateField(
                    "inspectionExpiry",
                    date ? date.toISOString().split("T")[0] : null,
                  )
                }
                placeholder="Fecha"
                disabled={isSubmitting}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Habilidades del Vehículo */}
      {availableSkills.length > 0 && (
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium text-sm">Habilidades del Vehículo</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Selecciona las capacidades especiales de este vehículo
            </p>

            {/* Selected skills badges */}
            {selectedSkillIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-2">
                {selectedSkillIds.map((skillId) => {
                  const skill = availableSkills.find((s) => s.id === skillId);
                  return skill ? (
                    <Badge
                      key={skillId}
                      variant="secondary"
                      className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => toggleSkillSelection(skillId)}
                    >
                      {skill.name}
                      <span className="ml-1">&times;</span>
                    </Badge>
                  ) : null;
                })}
              </div>
            )}

            {/* Skills grouped by category */}
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {Object.entries(skillsByCategory).map(([category, skills]) => (
                <div key={category}>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    {SKILL_CATEGORY_LABELS[category] || category}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {skills.map((skill) => (
                      <label
                        key={skill.id}
                        htmlFor={`skill-${skill.id}`}
                        className="flex items-center gap-2 p-2 rounded border text-sm hover:bg-accent/50 cursor-pointer"
                      >
                        <Checkbox
                          id={`skill-${skill.id}`}
                          checked={selectedSkillIds.includes(skill.id)}
                          onCheckedChange={() => toggleSkillSelection(skill.id)}
                          disabled={isSubmitting}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-normal">{skill.name}</span>
                          {skill.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {skill.description}
                            </p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {availableSkills.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No hay habilidades configuradas.
                <br />
                Configúralas en Configuración → Habilidades de Vehículos
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
