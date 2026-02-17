"use client";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { FieldDefinition } from "./custom-fields-context";

interface DynamicFieldRendererProps {
  definition: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}

export function DynamicFieldRenderer({ definition, value, onChange, error }: DynamicFieldRendererProps) {
  const fieldId = `custom-field-${definition.code}`;

  const renderInput = () => {
    switch (definition.fieldType) {
      case "text":
        return (
          <Input
            id={fieldId}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={definition.placeholder ?? undefined}
          />
        );

      case "number":
      case "currency":
        return (
          <Input
            id={fieldId}
            type="number"
            value={(value as string | number) ?? ""}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            placeholder={definition.placeholder ?? undefined}
            step={definition.fieldType === "currency" ? "0.01" : "1"}
          />
        );

      case "select":
        return (
          <select
            id={fieldId}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className="w-full px-3 py-2 border rounded-md bg-background text-sm"
          >
            <option value="">{definition.placeholder || "Seleccionar..."}</option>
            {(definition.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      case "date":
        return (
          <Input
            id={fieldId}
            type="date"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
          />
        );

      case "boolean":
        return (
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id={fieldId}
              checked={!!value}
              onCheckedChange={(checked) => onChange(!!checked)}
            />
            <Label htmlFor={fieldId} className="text-sm cursor-pointer">
              {definition.label}
            </Label>
          </div>
        );

      case "phone":
        return (
          <Input
            id={fieldId}
            type="tel"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={definition.placeholder ?? "+51 999 999 999"}
          />
        );

      case "email":
        return (
          <Input
            id={fieldId}
            type="email"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={definition.placeholder ?? "correo@ejemplo.com"}
          />
        );

      default:
        return (
          <Input
            id={fieldId}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={definition.placeholder ?? undefined}
          />
        );
    }
  };

  return (
    <div className="space-y-1">
      {definition.fieldType !== "boolean" && (
        <Label htmlFor={fieldId}>
          {definition.label}
          {definition.required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
      )}
      {renderInput()}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
