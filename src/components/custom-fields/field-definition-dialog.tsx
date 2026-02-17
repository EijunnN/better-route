"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useCustomFields,
  FIELD_TYPE_LABELS,
  FIELD_ENTITY_LABELS,
  type FieldDefinition,
  type FieldDefinitionInput,
  type FieldType,
  type FieldEntity,
} from "./custom-fields-context";

function labelToCode(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function isValidCode(code: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(code);
}

export function FieldDefinitionDialog() {
  const { state, actions } = useCustomFields();
  const { showDialog, dialogMode, selectedDefinition, definitions } = state;
  const isEdit = dialogMode === "edit" && !!selectedDefinition;

  const [formData, setFormData] = useState<FieldDefinitionInput>({
    code: "",
    label: "",
    entity: "orders",
    fieldType: "text",
    required: false,
    placeholder: "",
    options: [],
    defaultValue: "",
    position: 0,
    showInList: false,
    showInMobile: true,
    showInCsv: true,
  });
  const [optionsText, setOptionsText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);

  useEffect(() => {
    if (showDialog) {
      if (isEdit && selectedDefinition) {
        setFormData({
          code: selectedDefinition.code,
          label: selectedDefinition.label,
          entity: selectedDefinition.entity,
          fieldType: selectedDefinition.fieldType,
          required: selectedDefinition.required,
          placeholder: selectedDefinition.placeholder ?? "",
          options: selectedDefinition.options ?? [],
          defaultValue: selectedDefinition.defaultValue ?? "",
          position: selectedDefinition.position,
          showInList: selectedDefinition.showInList,
          showInMobile: selectedDefinition.showInMobile,
          showInCsv: selectedDefinition.showInCsv,
        });
        setOptionsText((selectedDefinition.options ?? []).join("\n"));
        setCodeManuallyEdited(true);
      } else {
        const nextPosition = definitions.length > 0
          ? Math.max(...definitions.map((d) => d.position)) + 1
          : 0;
        setFormData({
          code: "",
          label: "",
          entity: "orders",
          fieldType: "text",
          required: false,
          placeholder: "",
          options: [],
          defaultValue: "",
          position: nextPosition,
          showInList: false,
          showInMobile: true,
          showInCsv: true,
        });
        setOptionsText("");
        setCodeManuallyEdited(false);
      }
      setError(null);
    }
  }, [showDialog, isEdit, selectedDefinition, definitions]);

  const handleLabelChange = (label: string) => {
    setFormData((p) => ({
      ...p,
      label,
      code: codeManuallyEdited ? p.code : labelToCode(label),
    }));
  };

  const handleCodeChange = (code: string) => {
    setCodeManuallyEdited(true);
    setFormData((p) => ({ ...p, code: code.toLowerCase().replace(/[^a-z0-9_]/g, "") }));
  };

  const handleSubmit = async () => {
    setError(null);

    if (!formData.label.trim()) {
      setError("El nombre es requerido");
      return;
    }

    const code = formData.code.trim() || labelToCode(formData.label);
    if (!code) {
      setError("El codigo es requerido");
      return;
    }
    if (!isValidCode(code)) {
      setError("El codigo debe empezar con letra y contener solo letras, numeros y guiones bajos");
      return;
    }

    const data: FieldDefinitionInput = {
      ...formData,
      code,
      label: formData.label.trim(),
      placeholder: formData.placeholder || undefined,
      defaultValue: formData.defaultValue || undefined,
      options: formData.fieldType === "select"
        ? optionsText.split("\n").map((s) => s.trim()).filter(Boolean)
        : undefined,
    };

    setIsSubmitting(true);
    try {
      if (isEdit && selectedDefinition) {
        await actions.updateDefinition(selectedDefinition.id, data);
      } else {
        await actions.createDefinition(data);
      }
      actions.closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={showDialog} onOpenChange={(open) => !open && actions.closeDialog()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar campo personalizado" : "Nuevo campo personalizado"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica la configuracion del campo."
              : "Define un nuevo campo personalizado para tu empresa."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Label */}
          <div className="space-y-1">
            <Label className="text-xs">Nombre *</Label>
            <Input
              value={formData.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="Ej: Referencia del cliente"
              disabled={isSubmitting}
              className="h-8 text-sm"
            />
          </div>

          {/* Code */}
          <div className="space-y-1">
            <Label className="text-xs">
              Codigo{" "}
              <span className="text-muted-foreground font-normal">
                (auto-generado si se deja vacio)
              </span>
            </Label>
            <Input
              value={formData.code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder={labelToCode(formData.label) || "referencia_cliente"}
              disabled={isSubmitting}
              className="h-8 text-sm font-mono"
            />
          </div>

          {/* Entity + Field Type row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Entidad</Label>
              <select
                value={formData.entity}
                onChange={(e) => setFormData((p) => ({ ...p, entity: e.target.value as FieldEntity }))}
                disabled={isSubmitting}
                className="w-full h-8 px-2 border rounded-md bg-background text-sm"
              >
                {(Object.entries(FIELD_ENTITY_LABELS) as [FieldEntity, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo de campo</Label>
              <select
                value={formData.fieldType}
                onChange={(e) => setFormData((p) => ({ ...p, fieldType: e.target.value as FieldType }))}
                disabled={isSubmitting}
                className="w-full h-8 px-2 border rounded-md bg-background text-sm"
              >
                {(Object.entries(FIELD_TYPE_LABELS) as [FieldType, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Placeholder */}
          <div className="space-y-1">
            <Label className="text-xs">Placeholder</Label>
            <Input
              value={formData.placeholder ?? ""}
              onChange={(e) => setFormData((p) => ({ ...p, placeholder: e.target.value }))}
              placeholder="Texto de ayuda para el usuario"
              disabled={isSubmitting}
              className="h-8 text-sm"
            />
          </div>

          {/* Options - only for select */}
          {formData.fieldType === "select" && (
            <div className="space-y-1">
              <Label className="text-xs">Opciones (una por linea)</Label>
              <textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={4}
                disabled={isSubmitting}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={"Opcion 1\nOpcion 2\nOpcion 3"}
              />
            </div>
          )}

          {/* Default value */}
          <div className="space-y-1">
            <Label className="text-xs">Valor por defecto</Label>
            <Input
              value={formData.defaultValue ?? ""}
              onChange={(e) => setFormData((p) => ({ ...p, defaultValue: e.target.value }))}
              placeholder="Opcional"
              disabled={isSubmitting}
              className="h-8 text-sm"
            />
          </div>

          {/* Position */}
          <div className="space-y-1">
            <Label className="text-xs">Posicion</Label>
            <Input
              type="number"
              min={0}
              value={formData.position}
              onChange={(e) => setFormData((p) => ({ ...p, position: parseInt(e.target.value, 10) || 0 }))}
              disabled={isSubmitting}
              className="h-8 text-sm w-24"
            />
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.required}
                onCheckedChange={(v) => setFormData((p) => ({ ...p, required: v }))}
                disabled={isSubmitting}
              />
              <Label className="text-sm cursor-pointer">Requerido</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.showInList}
                onCheckedChange={(v) => setFormData((p) => ({ ...p, showInList: v }))}
                disabled={isSubmitting}
              />
              <Label className="text-sm cursor-pointer">Mostrar en listado</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.showInMobile}
                onCheckedChange={(v) => setFormData((p) => ({ ...p, showInMobile: v }))}
                disabled={isSubmitting}
              />
              <Label className="text-sm cursor-pointer">Mostrar en movil</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.showInCsv}
                onCheckedChange={(v) => setFormData((p) => ({ ...p, showInCsv: v }))}
                disabled={isSubmitting}
              />
              <Label className="text-sm cursor-pointer">Incluir en CSV</Label>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => actions.closeDialog()}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {isSubmitting ? "Guardando..." : isEdit ? "Actualizar" : "Crear campo"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
