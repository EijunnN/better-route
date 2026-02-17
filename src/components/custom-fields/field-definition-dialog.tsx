"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  ArrowLeft,
  Type,
  Hash,
  List,
  Calendar,
  DollarSign,
  Phone,
  Mail,
  ToggleLeft,
  Eye,
  Smartphone,
  FileSpreadsheet,
  Package,
  MapPin,
} from "lucide-react";
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
  type FieldDefinition,
  type FieldDefinitionInput,
  type FieldType,
  type FieldEntity,
} from "./custom-fields-context";
import { DynamicFieldRenderer } from "./dynamic-field-renderer";

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

interface FieldTypeOption {
  value: FieldType;
  label: string;
  description: string;
  icon: typeof Type;
  bgClass: string;
  defaultPlaceholder: string;
  defaultShowInList: boolean;
  defaultShowInMobile: boolean;
  defaultShowInCsv: boolean;
}

const FIELD_TYPE_OPTIONS: FieldTypeOption[] = [
  {
    value: "text",
    label: "Texto",
    description: "Texto libre, referencias, nombres",
    icon: Type,
    bgClass: "bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800",
    defaultPlaceholder: "Ingrese texto",
    defaultShowInList: false,
    defaultShowInMobile: true,
    defaultShowInCsv: true,
  },
  {
    value: "number",
    label: "Numero",
    description: "Cantidades, medidas, conteos",
    icon: Hash,
    bgClass: "bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800",
    defaultPlaceholder: "0",
    defaultShowInList: false,
    defaultShowInMobile: true,
    defaultShowInCsv: true,
  },
  {
    value: "select",
    label: "Seleccion",
    description: "Lista de opciones predefinidas",
    icon: List,
    bgClass: "bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800",
    defaultPlaceholder: "Seleccione una opcion",
    defaultShowInList: true,
    defaultShowInMobile: true,
    defaultShowInCsv: true,
  },
  {
    value: "date",
    label: "Fecha",
    description: "Fechas de vencimiento, programacion",
    icon: Calendar,
    bgClass: "bg-amber-100 dark:bg-amber-800/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800",
    defaultPlaceholder: "dd/mm/aaaa",
    defaultShowInList: false,
    defaultShowInMobile: true,
    defaultShowInCsv: false,
  },
  {
    value: "currency",
    label: "Moneda",
    description: "Montos, cobros, valores monetarios",
    icon: DollarSign,
    bgClass: "bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800",
    defaultPlaceholder: "$0.00",
    defaultShowInList: true,
    defaultShowInMobile: true,
    defaultShowInCsv: true,
  },
  {
    value: "phone",
    label: "Telefono",
    description: "Numeros de contacto",
    icon: Phone,
    bgClass: "bg-cyan-100 dark:bg-cyan-800/50 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-200 dark:hover:bg-cyan-800",
    defaultPlaceholder: "+51 999 999 999",
    defaultShowInList: false,
    defaultShowInMobile: true,
    defaultShowInCsv: false,
  },
  {
    value: "email",
    label: "Email",
    description: "Correos electronicos",
    icon: Mail,
    bgClass: "bg-pink-100 dark:bg-pink-800/50 text-pink-700 dark:text-pink-300 hover:bg-pink-200 dark:hover:bg-pink-800",
    defaultPlaceholder: "correo@ejemplo.com",
    defaultShowInList: false,
    defaultShowInMobile: true,
    defaultShowInCsv: false,
  },
  {
    value: "boolean",
    label: "Si/No",
    description: "Opciones binarias, confirmaciones",
    icon: ToggleLeft,
    bgClass: "bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800",
    defaultPlaceholder: "",
    defaultShowInList: false,
    defaultShowInMobile: true,
    defaultShowInCsv: false,
  },
];

const ENTITY_OPTIONS: { value: FieldEntity; label: string; description: string; icon: typeof Package }[] = [
  { value: "orders", label: "En los pedidos", description: "Se muestra al crear y gestionar pedidos", icon: Package },
  { value: "route_stops", label: "En las entregas", description: "Lo completa el conductor en cada entrega", icon: MapPin },
];

const VISIBILITY_TOGGLES = [
  { key: "showInList" as const, icon: Eye, label: "Tabla de pedidos", shortLabel: "Tabla" },
  { key: "showInMobile" as const, icon: Smartphone, label: "App del conductor", shortLabel: "App" },
  { key: "showInCsv" as const, icon: FileSpreadsheet, label: "Importar y exportar", shortLabel: "CSV" },
];

export function FieldDefinitionDialog() {
  const { state, actions } = useCustomFields();
  const { showDialog, dialogMode, selectedDefinition, definitions } = state;
  const isEdit = dialogMode === "edit" && !!selectedDefinition;

  const [step, setStep] = useState<1 | 2>(isEdit ? 2 : 1);
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
  const [previewValue, setPreviewValue] = useState<unknown>(null);

  useEffect(() => {
    if (showDialog) {
      if (isEdit && selectedDefinition) {
        setStep(2);
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
        setStep(1);
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
      setPreviewValue(null);
    }
  }, [showDialog, isEdit, selectedDefinition, definitions]);

  const handlePickType = (option: FieldTypeOption) => {
    const nextPosition = definitions.length > 0
      ? Math.max(...definitions.map((d) => d.position)) + 1
      : 0;

    setFormData((p) => ({
      ...p,
      fieldType: option.value,
      placeholder: option.defaultPlaceholder,
      showInList: option.defaultShowInList,
      showInMobile: option.defaultShowInMobile,
      showInCsv: option.defaultShowInCsv,
      position: p.position || nextPosition,
    }));
    setPreviewValue(null);
    setStep(2);
  };

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

  // Build a preview FieldDefinition from current form data
  const previewDefinition: FieldDefinition = {
    id: "preview",
    companyId: "",
    entity: formData.entity,
    code: formData.code || "preview",
    label: formData.label || "Campo de ejemplo",
    fieldType: formData.fieldType,
    required: formData.required,
    placeholder: formData.placeholder || null,
    options: formData.fieldType === "select"
      ? optionsText.split("\n").map((s) => s.trim()).filter(Boolean)
      : null,
    defaultValue: formData.defaultValue || null,
    position: formData.position,
    showInList: formData.showInList,
    showInMobile: formData.showInMobile,
    showInCsv: formData.showInCsv,
    validationRules: null,
    active: true,
    createdAt: "",
    updatedAt: "",
  };

  const selectedTypeOption = FIELD_TYPE_OPTIONS.find((o) => o.value === formData.fieldType);

  return (
    <Dialog open={showDialog} onOpenChange={(open) => !open && actions.closeDialog()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        {step === 1 && !isEdit ? (
          <>
            <DialogHeader>
              <DialogTitle>Nuevo campo personalizado</DialogTitle>
              <DialogDescription>
                Que tipo de campo necesitas?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-2">
              {FIELD_TYPE_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handlePickType(option)}
                    className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${option.bgClass}`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{option.label}</div>
                      <div className="text-xs opacity-75">{option.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {isEdit ? "Editar campo personalizado" : "Configura tu campo"}
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? "Modifica la configuracion del campo."
                  : "Ajusta los valores preconfigurados o dejalo como esta."}
              </DialogDescription>
            </DialogHeader>

            {!isEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="w-fit -mt-2"
                onClick={() => setStep(1)}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Cambiar tipo
              </Button>
            )}

            <div className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* Type badge */}
              {selectedTypeOption && (
                <div className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${selectedTypeOption.bgClass}`}>
                  <selectedTypeOption.icon className="h-3.5 w-3.5" />
                  {selectedTypeOption.label}
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

              {/* Entity - visual selector */}
              <div className="space-y-1.5">
                <Label className="text-xs">Donde se usa este campo?</Label>
                <div className="grid grid-cols-1 gap-2">
                  {ENTITY_OPTIONS.map((ent) => {
                    const isActive = formData.entity === ent.value;
                    return (
                      <button
                        key={ent.value}
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, entity: ent.value }))}
                        disabled={isSubmitting}
                        className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                          isActive
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <ent.icon className="h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{ent.label}</div>
                          <div className="text-[11px] opacity-75">{ent.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Placeholder */}
              <div className="space-y-1">
                <Label className="text-xs">Texto de ayuda</Label>
                <Input
                  value={formData.placeholder ?? ""}
                  onChange={(e) => setFormData((p) => ({ ...p, placeholder: e.target.value }))}
                  placeholder="Lo que ve el usuario antes de escribir"
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

              {/* Visibility toggles */}
              <div className="space-y-1.5">
                <Label className="text-xs">Donde se muestra?</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  {VISIBILITY_TOGGLES.map((v) => {
                    const isActive = formData[v.key];
                    return (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => setFormData((p) => ({ ...p, [v.key]: !p[v.key] }))}
                        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                          isActive
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                        disabled={isSubmitting}
                      >
                        <v.icon className="h-3.5 w-3.5" />
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Required */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.required}
                    onCheckedChange={(v) => setFormData((p) => ({ ...p, required: v }))}
                    disabled={isSubmitting}
                  />
                  <Label className="text-sm cursor-pointer">Obligatorio</Label>
                </div>
                {formData.required && (
                  <p className="text-[11px] text-muted-foreground pl-9">
                    {formData.entity === "route_stops"
                      ? "El conductor no podra completar la entrega sin llenar este campo"
                      : "No se podra guardar el pedido sin completar este campo"}
                  </p>
                )}
              </div>

              {/* Live preview */}
              {formData.label && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Vista previa</Label>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <DynamicFieldRenderer
                      definition={previewDefinition}
                      value={previewValue}
                      onChange={setPreviewValue}
                    />
                  </div>
                </div>
              )}

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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
