"use client";

import {
  Eye,
  Smartphone,
  FileSpreadsheet,
  Package,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Type,
  Hash,
  List,
  Calendar,
  DollarSign,
  Phone,
  Mail,
  ToggleLeft,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  type FieldDefinition,
  type FieldType,
  FIELD_TYPE_LABELS,
} from "./custom-fields-context";
import { DynamicFieldRenderer } from "./dynamic-field-renderer";

const FIELD_TYPE_ICON: Record<FieldType, typeof Type> = {
  text: Type,
  number: Hash,
  select: List,
  date: Calendar,
  currency: DollarSign,
  phone: Phone,
  email: Mail,
  boolean: ToggleLeft,
};

interface FieldFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition: FieldDefinition | null;
}

/**
 * Concrete, per-field "where does this show up" view. Instead of explaining
 * the feature in abstract, this dialog answers "for THIS field with THIS
 * configuration, exactly where will it appear and who fills it?".
 *
 * Builds the surfaces dynamically from the definition's flags so the user
 * sees the real impact of their toggles.
 */
export function FieldFlowDialog({
  open,
  onOpenChange,
  definition,
}: FieldFlowDialogProps) {
  if (!definition) return null;

  const TypeIcon = FIELD_TYPE_ICON[definition.fieldType] ?? Type;
  const isOrders = definition.entity === "orders";
  const filledByLabel = isOrders ? "Tu equipo" : "El conductor";
  const filledWhenLabel = isOrders
    ? "Al crear o editar el pedido"
    : "En la app, al cerrar la entrega";

  const surfaces: Surface[] = [];

  // Where it gets filled (always one of two)
  if (isOrders) {
    surfaces.push({
      icon: Package,
      title: "Formulario de pedido",
      where: "Pantalla /pedidos → botón Nuevo o editar",
      role: "filled",
      detail: `Tu equipo lo encuentra en el formulario al crear o editar un pedido${
        definition.required ? ". Es obligatorio: no se podrá guardar sin completarlo." : "."
      }`,
    });
  } else {
    surfaces.push({
      icon: Smartphone,
      title: "App del conductor — diálogo de cierre de entrega",
      where: "App móvil → al marcar la parada como completada",
      role: "filled",
      detail: `El conductor lo llena al actualizar el estado de la parada${
        definition.required
          ? ". Es obligatorio: no podrá marcar la entrega como completada hasta llenarlo."
          : "."
      }`,
    });
  }

  // Where it gets DISPLAYED (visibility toggles)
  if (definition.showInList && isOrders) {
    surfaces.push({
      icon: Eye,
      title: "Tabla de pedidos",
      where: "Pantalla /pedidos → lista principal",
      role: "shown",
      detail:
        "Aparece como columna en la lista de pedidos. Útil para verlo de un vistazo sin abrir cada pedido.",
    });
  }

  if (definition.showInMobile) {
    surfaces.push({
      icon: Smartphone,
      title: "App del conductor",
      where: "App móvil → detalle de la parada",
      role: "shown",
      detail: isOrders
        ? "El conductor lee este dato como contexto de la entrega (ej: monto a cobrar, instrucciones)."
        : "El conductor ve el valor que cargó previamente (cuando abre la entrega ya completada).",
    });
  }

  if (definition.showInCsv) {
    surfaces.push({
      icon: FileSpreadsheet,
      title: "Importar / exportar CSV",
      where: "Plantilla descargable + carga masiva",
      role: "shown",
      detail:
        "Se mapea automáticamente como columna en plantillas de importación CSV. Permite carga masiva desde Excel, y queda incluido en exportaciones.",
    });
  }

  // Monitoring / driver-route detail (route_stops always visible there if filled)
  if (!isOrders) {
    surfaces.push({
      icon: MapPin,
      title: "Monitoreo en tiempo real",
      where: "Pantalla /monitoring → detalle del conductor → lista de paradas",
      role: "shown",
      detail:
        "Cuando el conductor lo llena, aparece bajo cada parada en el panel de monitoreo. Permite al operador validar lo capturado en la entrega.",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TypeIcon className="h-4 w-4 text-muted-foreground" />
            <span>{definition.label}</span>
            <Badge variant="secondary" className="text-[10px]">
              {FIELD_TYPE_LABELS[definition.fieldType]}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Mostramos exactamente en qué pantallas aparece este campo según su
            configuración actual y cómo se ve.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Quick summary chips */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              <div>
                <span className="text-muted-foreground">¿Quién lo llena? </span>
                <span className="font-medium text-foreground">{filledByLabel}</span>
              </div>
              <div>
                <span className="text-muted-foreground">¿Cuándo? </span>
                <span className="font-medium text-foreground">{filledWhenLabel}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Código interno: </span>
                <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono">
                  {definition.code}
                </code>
              </div>
            </div>

            {definition.required && (
              <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 pt-1 border-t border-amber-500/20">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  <strong>Obligatorio.</strong>{" "}
                  {isOrders
                    ? "El pedido no se puede guardar sin este dato."
                    : "El conductor no puede cerrar la entrega sin este dato."}
                </span>
              </div>
            )}
          </div>

          {/* Live preview of the renderer */}
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Cómo se ve el campo</h3>
            <div className="rounded-md border bg-background p-4">
              <DynamicFieldRenderer definition={definition} value={null} onChange={() => {}} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Esta es la representación real que el usuario ve al llenar el campo.
            </p>
          </section>

          {/* Surfaces — where it lives */}
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Dónde aparece</h3>
            <div className="space-y-2">
              {surfaces.map((surface, idx) => (
                <SurfaceRow key={idx} surface={surface} />
              ))}
            </div>
          </section>

          {/* Hidden surfaces (educational: what would change if user toggled them) */}
          {(!definition.showInList && isOrders) ||
          !definition.showInMobile ||
          !definition.showInCsv ? (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Pantallas donde NO aparece
              </h3>
              <div className="space-y-1.5">
                {!definition.showInList && isOrders && (
                  <HiddenRow
                    icon={Eye}
                    title="Tabla de pedidos"
                    hint="Activá 'Tabla de pedidos' al editar el campo para verlo como columna en /pedidos."
                  />
                )}
                {!definition.showInMobile && (
                  <HiddenRow
                    icon={Smartphone}
                    title="App del conductor"
                    hint="Activá 'App del conductor' para que el conductor pueda verlo o llenarlo en la app."
                  />
                )}
                {!definition.showInCsv && (
                  <HiddenRow
                    icon={FileSpreadsheet}
                    title="Importar / exportar CSV"
                    hint="Activá 'Importar y exportar' para mapear este campo a una columna CSV."
                  />
                )}
              </div>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Surface {
  icon: typeof Eye;
  title: string;
  where: string;
  role: "filled" | "shown";
  detail: string;
}

function SurfaceRow({ surface }: { surface: Surface }) {
  const Icon = surface.icon;
  const isFilled = surface.role === "filled";
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${
              isFilled
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            }`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{surface.title}</span>
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  isFilled
                    ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                    : "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                }`}
              >
                {isFilled ? (
                  <>
                    <span className="mr-1">●</span>Se llena aquí
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-2.5 w-2.5 mr-1" />Se muestra aquí
                  </>
                )}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{surface.where}</p>
            <p className="text-xs text-foreground mt-1.5 leading-relaxed">{surface.detail}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HiddenRow({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Eye;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed p-2.5 opacity-70">
      <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
