"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileQuestion,
  Loader2,
  XCircle,
} from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiData } from "@/hooks/use-api";
import {
  validateCsvHeaders,
  type ProfileField,
  type ProfileSchema,
} from "@/lib/orders/profile-schema/client";

// The API returns { schema, template } — keep a type-only description here.
interface SchemaResponse {
  schema: ProfileSchema;
  template: string;
}

interface CsvSchemaGuideProps {
  companyId: string;
  /**
   * When provided, the guide runs live validation against these headers and
   * shows which ones matched, which were unknown, and which required fields
   * are missing.
   */
  csvHeaders?: string[];
  /**
   * When true (default), renders a "Download template" button that produces
   * a file straight from the API response — no extra request needed.
   */
  showDownload?: boolean;
  /** Optional className on the outer wrapper. */
  className?: string;
}

/**
 * UI preview of the CSV import contract for a given company.
 *
 * Displays the ProfileSchema the backend returns — required fields, optional
 * fields, capacity dimensions, time-window presets, custom fields — so the
 * user knows exactly what the CSV needs BEFORE picking a file.
 *
 * When the caller passes `csvHeaders` (e.g. after parsing a dragged-in file),
 * the guide switches to validation mode and shows a status bar over each
 * field group.
 */
export function CsvSchemaGuide({
  companyId,
  csvHeaders,
  showDownload = true,
  className,
}: CsvSchemaGuideProps) {
  const { data, error, isLoading } = useApiData<SchemaResponse>(
    `/api/companies/${companyId}/csv-profile-schema`,
    companyId,
  );

  const validation = useMemo(() => {
    if (!data || !csvHeaders || csvHeaders.length === 0) return null;
    return validateCsvHeaders(csvHeaders, data.schema);
  }, [data, csvHeaders]);

  const mappedKeys = useMemo(
    () => new Set(validation ? Object.values(validation.mapping) : []),
    [validation],
  );

  if (isLoading) {
    return (
      <div className={wrapperClass(className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando esquema del CSV…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={wrapperClass(className)}>
        <div className="flex items-center gap-2 text-sm text-destructive py-4">
          <XCircle className="h-4 w-4" />
          No se pudo cargar el esquema: {error?.message ?? "error desconocido"}
        </div>
      </div>
    );
  }

  const { schema, template } = data;
  const required = schema.fields.filter((f) => f.required);
  const optional = schema.fields.filter((f) => !f.required && f.origin === "system");
  const custom = schema.fields.filter((f) => f.origin === "custom");

  return (
    <div className={wrapperClass(className)}>
      <div className="flex items-start justify-between gap-3 pb-2 border-b">
        <div>
          <h4 className="text-sm font-semibold">Columnas esperadas por tu empresa</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dimensiones activas:{" "}
            {schema.activeDimensions.length > 0
              ? schema.activeDimensions.join(" + ")
              : "ninguna"}
            {schema.timeWindowPresets.length > 0 && (
              <>
                {" · "}presets de horario:{" "}
                {schema.timeWindowPresets.map((p) => p.name).join(", ")}
              </>
            )}
          </p>
        </div>
        {showDownload && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadTemplate(template)}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Plantilla
          </Button>
        )}
      </div>

      {validation && (
        <ValidationBar
          validation={validation}
          totalRequired={required.length}
          mappedRequired={required.filter((f) => mappedKeys.has(f.key)).length}
        />
      )}

      <FieldGroup
        title="Obligatorias"
        fields={required}
        mappedKeys={mappedKeys}
        showValidation={!!validation}
        emphasis="required"
      />
      <FieldGroup
        title="Opcionales"
        fields={optional}
        mappedKeys={mappedKeys}
        showValidation={!!validation}
        emphasis="optional"
      />
      {custom.length > 0 && (
        <FieldGroup
          title={`Campos personalizados (${custom.length})`}
          fields={custom}
          mappedKeys={mappedKeys}
          showValidation={!!validation}
          emphasis="custom"
        />
      )}

      {validation && validation.extra.length > 0 && (
        <div className="pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <FileQuestion className="h-3 w-3" />
            Columnas en tu CSV que no se reconocieron
          </p>
          <div className="flex flex-wrap gap-1">
            {validation.extra.map((h) => (
              <Badge key={h} variant="outline" className="text-[11px] font-mono">
                {h}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function wrapperClass(className?: string): string {
  return `space-y-3 ${className ?? ""}`.trim();
}

function downloadTemplate(content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ordenes_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Inner components ───────────────────────────────────────────────────────

function ValidationBar({
  validation,
  totalRequired,
  mappedRequired,
}: {
  validation: ReturnType<typeof validateCsvHeaders>;
  totalRequired: number;
  mappedRequired: number;
}) {
  const missingRequired = totalRequired - mappedRequired;
  const allRequired = missingRequired === 0;
  const Icon = allRequired ? CheckCircle2 : AlertTriangle;
  const tone = allRequired
    ? "border-green-300 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800"
    : "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800";

  return (
    <div className={`rounded-md border px-3 py-2 flex items-start gap-2 ${tone}`}>
      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <div className="flex-1 text-xs">
        <p className="font-medium">
          {allRequired
            ? "Todas las columnas obligatorias están presentes"
            : `Faltan ${missingRequired} columna${missingRequired === 1 ? "" : "s"} obligatoria${
                missingRequired === 1 ? "" : "s"
              }`}
        </p>
        <p className="mt-0.5 text-[11px] opacity-80">
          {mappedRequired}/{totalRequired} obligatorias · {validation.extra.length}{" "}
          no reconocidas · {validation.ambiguous.length} aproximadas
        </p>
      </div>
    </div>
  );
}

function FieldGroup({
  title,
  fields,
  mappedKeys,
  showValidation,
  emphasis,
}: {
  title: string;
  fields: ProfileField[];
  mappedKeys: Set<string>;
  showValidation: boolean;
  emphasis: "required" | "optional" | "custom";
}) {
  if (fields.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {fields.map((f) => (
          <FieldChip
            key={f.key}
            field={f}
            mapped={showValidation ? mappedKeys.has(f.key) : undefined}
            emphasis={emphasis}
          />
        ))}
      </div>
    </div>
  );
}

function FieldChip({
  field,
  mapped,
  emphasis,
}: {
  field: ProfileField;
  mapped: boolean | undefined;
  emphasis: "required" | "optional" | "custom";
}) {
  const status: "ok" | "missing" | "neutral" =
    mapped === undefined
      ? "neutral"
      : mapped
        ? "ok"
        : emphasis === "required"
          ? "missing"
          : "neutral";

  const statusClass =
    status === "ok"
      ? "border-green-300 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800"
      : status === "missing"
        ? "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800"
        : emphasis === "required"
          ? "border-foreground/30"
          : emphasis === "custom"
            ? "border-purple-300 bg-purple-50 text-purple-800 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800"
            : "border-muted-foreground/30";

  const Icon = status === "ok" ? CheckCircle2 : status === "missing" ? XCircle : null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] ${statusClass}`}
      title={`${field.description} · ejemplo: ${field.example || "—"}`}
    >
      {Icon && <Icon className="h-3 w-3" />}
      <span className="font-mono">{field.label}</span>
      <span className="opacity-70">({field.kind})</span>
    </div>
  );
}
