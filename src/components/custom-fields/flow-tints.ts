import type { FieldType } from "./custom-fields-context";

/**
 * Tailwind className combos for each field type. Used by the type chip,
 * the wizard's type picker, and the FlowRow's type icon badge.
 *
 * Keeping these in a single map (instead of repeating colour strings
 * across components) means a future palette adjustment is one edit.
 */
export const FIELD_TYPE_TINT: Record<FieldType, string> = {
  text: "text-slate-700 bg-slate-100 dark:text-slate-300 dark:bg-slate-800/50",
  number: "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/40",
  select:
    "text-purple-700 bg-purple-100 dark:text-purple-300 dark:bg-purple-900/40",
  date: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40",
  currency:
    "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40",
  phone: "text-cyan-700 bg-cyan-100 dark:text-cyan-300 dark:bg-cyan-900/40",
  email: "text-pink-700 bg-pink-100 dark:text-pink-300 dark:bg-pink-900/40",
  boolean:
    "text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/40",
};

/**
 * Origin (entity) tint — blue for "tu equipo" (orders), emerald for
 * "el conductor" (route_stops). These two get more visual weight than
 * the field-type tints because the origin decision is the most
 * important mental model in the redesign.
 */
export const ENTITY_TINT = {
  orders: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    fg: "text-blue-700 dark:text-blue-300",
    label: "Tu equipo",
    sublabel: "Al cargar el pedido",
  },
  route_stops: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    fg: "text-emerald-700 dark:text-emerald-300",
    label: "El conductor",
    sublabel: "Al cerrar la entrega",
  },
} as const;

/**
 * Free-text concepts already owned by Política de entrega. Same
 * blacklist as field-definition-dialog uses — kept here so wizard
 * Step 3 can flag overlap proactively.
 */
export const POLICY_OVERLAP_KEYWORDS = [
  "motivo",
  "foto",
  "firma",
  "nota",
  "observacion",
  "estado",
];

export function detectPolicyOverlap(label: string): string | null {
  const normalized = label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return POLICY_OVERLAP_KEYWORDS.find((k) => normalized.includes(k)) ?? null;
}

export function labelToCode(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Sample value per type for the in-wizard mini previews and the
 * sidebar's flow visualization.
 */
export function sampleValueShort(type: FieldType): string {
  return (
    {
      currency: "$12.500",
      number: "3",
      select: "Express",
      date: "21/05",
      phone: "+54…",
      email: "cli@ej…",
      boolean: "Sí",
      text: "Ref-123",
    } satisfies Record<FieldType, string>
  )[type];
}
