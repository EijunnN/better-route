"use client";

import {
  Plus,
  ArrowRight,
  Package,
  MapPin,
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
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Can } from "@/components/auth/can";

/**
 * Educational view for the custom-fields module.
 * Used in two surfaces:
 *  1. As the full-screen empty state (when the company has zero active fields).
 *  2. Inside a Dialog opened from the "¿Cómo funciona?" header button.
 *
 * The content is identical in both surfaces — the only difference is layout
 * (the empty-state version owns its own container and primary CTA, the modal
 * version is laid out by the parent Dialog).
 */
interface CustomFieldsLearnProps {
  /** When true, render with the empty-state container + bottom CTA. */
  asEmptyState?: boolean;
  /** Called when the user clicks "Crear mi primer campo" — wired by parent. */
  onPrimaryAction?: () => void;
}

export function CustomFieldsLearn({
  asEmptyState = false,
  onPrimaryAction,
}: CustomFieldsLearnProps) {
  const content = (
    <div className="space-y-8">
      {/* What & Why */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">¿Qué son los campos personalizados?</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Información extra que tu negocio necesita capturar en cada pedido o
          en cada entrega, más allá de los datos básicos del sistema (dirección,
          cliente, peso). Los definís una sola vez acá y aparecen automáticamente
          en los lugares donde elijas: el formulario de pedido, la app del
          conductor, los CSV de importación.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Sin esta feature</strong>, todo
          lo que no encaja en los campos básicos termina en el campo "notas"
          como texto libre — imposible de validar, importar masivamente, o
          mostrar como columna. <strong className="text-foreground">Con campos
          personalizados</strong>, capturás datos estructurados con el tipo
          correcto (número, fecha, opciones), validados, y enchufados al flujo.
        </p>
      </section>

      {/* End-to-end flow diagram */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Cómo funciona el flujo completo</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FlowStep
            number={1}
            title="Definís el campo"
            body="Acá. Elegís el tipo (texto, número, moneda, fecha, etc.), si es obligatorio, y dónde se muestra."
            tone="primary"
          />
          <FlowStep
            number={2}
            title="Se llena en su momento"
            body="Tu equipo lo completa al cargar el pedido, o el conductor lo llena en la app cuando hace la entrega."
            tone="secondary"
          />
          <FlowStep
            number={3}
            title="Lo ves donde lo necesites"
            body="En la tabla de pedidos como columna, en reportes CSV, en el detalle del pedido, en la app del conductor."
            tone="success"
          />
        </div>
      </section>

      {/* Pedidos vs Entregas */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Pedidos vs Entregas — ¿cuál elegir?</h2>
        <p className="text-xs text-muted-foreground">
          Esta es la decisión más importante al crear un campo. Depende de
          quién lo llena y cuándo.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ComparisonCard
            icon={Package}
            title="Pedidos"
            who="Lo llena tu equipo"
            when="Al crear o editar un pedido (panel web o importación CSV)"
            examples={[
              "Referencia interna del cliente",
              "Tipo de servicio (Express / Estándar)",
              "Monto a cobrar",
              "Instrucciones especiales",
            ]}
            tone="orders"
          />
          <ComparisonCard
            icon={MapPin}
            title="Entregas"
            who="Lo llena el conductor"
            when="En la app, al llegar a la parada o al cerrar la entrega"
            examples={[
              "Firma del cliente recibida",
              "Foto del paquete entregado",
              "Nombre de quién recibió",
              "Motivo de no entrega",
            ]}
            tone="route_stops"
          />
        </div>
      </section>

      {/* Casos de uso reales */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Casos reales que resuelve</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <UseCase
            title="Cobranza contra entrega"
            problem="Necesito que el conductor cobre $X al entregar y confirme que cobró."
            solution={[
              { label: "Campo Pedido", value: 'Tipo: Moneda — "Monto a cobrar"' },
              { label: "Campo Entrega", value: 'Tipo: Sí/No — "Cobrado", obligatorio' },
            ]}
          />
          <UseCase
            title="Trazabilidad por cliente"
            problem="Cada cliente me da su propio número de orden de compra y necesito mantenerlo."
            solution={[
              { label: "Campo Pedido", value: 'Tipo: Texto — "OC del cliente", visible en tabla y CSV' },
            ]}
          />
          <UseCase
            title="Confirmación firmada"
            problem="Necesito prueba de que el cliente recibió el paquete."
            solution={[
              { label: "Campo Entrega", value: 'Tipo: Texto — "Quién recibió" (DNI / nombre), obligatorio' },
            ]}
          />
          <UseCase
            title="Programación por franja"
            problem="Algunos clientes piden ventana específica más allá del time window estándar."
            solution={[
              { label: "Campo Pedido", value: 'Tipo: Selección — "Franja preferida" (mañana/tarde/noche)' },
            ]}
          />
        </div>
      </section>

      {/* Tipos disponibles */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Tipos de campo disponibles</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <TypeCard icon={Type} label="Texto" description="Referencias, nombres, notas cortas" />
          <TypeCard icon={Hash} label="Número" description="Cantidades, conteos" />
          <TypeCard icon={List} label="Selección" description="Lista cerrada de opciones" />
          <TypeCard icon={Calendar} label="Fecha" description="Vencimientos, programación" />
          <TypeCard icon={DollarSign} label="Moneda" description="Montos a cobrar" />
          <TypeCard icon={Phone} label="Teléfono" description="Contactos secundarios" />
          <TypeCard icon={Mail} label="Email" description="Avisos a destinatarios" />
          <TypeCard icon={ToggleLeft} label="Sí/No" description="Confirmaciones" />
        </div>
      </section>

      {/* Visibility explained */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Visibilidad — dónde aparece cada campo</h2>
        <p className="text-xs text-muted-foreground">
          Al crear un campo elegís en qué pantallas del sistema aparece. Estas
          tres opciones son independientes — podés activar las que tengan sentido.
        </p>
        <div className="space-y-2">
          <VisibilityRow
            icon={Eye}
            title="Tabla de pedidos"
            body="Aparece como columna en /pedidos. Útil cuando el dato es relevante de un vistazo (Ej: monto a cobrar, OC del cliente)."
          />
          <VisibilityRow
            icon={Smartphone}
            title="App del conductor"
            body="El conductor lo ve en su pantalla al abrir la entrega. Si es de tipo Entrega, lo llena ahí mismo. Si es de tipo Pedido, lo lee como contexto."
          />
          <VisibilityRow
            icon={FileSpreadsheet}
            title="Importar y exportar CSV"
            body="Se mapea automáticamente como columna en plantillas de importación. Permite cargar datos masivos desde Excel."
          />
        </div>
      </section>

      {/* Required + behavior */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Obligatorio — qué pasa cuando lo activás</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Si es campo de Pedido</span>
              </div>
              <p className="text-xs text-muted-foreground">
                El sistema bloquea el guardado del pedido hasta que se complete.
                También bloquea filas del CSV que no traigan el dato.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Si es campo de Entrega</span>
              </div>
              <p className="text-xs text-muted-foreground">
                El conductor no puede marcar la parada como completada en la app
                hasta que llene este campo. Útil para forzar firmas, fotos, etc.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Notes */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Notas importantes</h2>
        <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
          <li>
            Los cambios se aplican <strong className="text-foreground">solo a
            pedidos creados a partir del cambio</strong>. Los pedidos viejos no
            se modifican retroactivamente.
          </li>
          <li>
            Archivar un campo no borra los datos históricos — solo deja de
            mostrar el campo en formularios nuevos. Podés reactivarlo en
            cualquier momento.
          </li>
          <li>
            El <strong className="text-foreground">código</strong> del campo
            (ej: <code className="text-[11px] bg-muted px-1 rounded">monto_cobrar</code>)
            es el identificador estable que se usa internamente y en CSV.
            Cambiar la etiqueta visible no cambia el código.
          </li>
        </ul>
      </section>
    </div>
  );

  if (!asEmptyState) {
    return content;
  }

  return (
    <Card className="border-dashed">
      <CardContent className="p-6 sm:p-8">
        {content}
        <div className="mt-8 flex justify-center">
          <Can perm="company:update">
            <Button onClick={onPrimaryAction}>
              <Plus className="h-4 w-4 mr-1.5" />
              Crear mi primer campo
            </Button>
          </Can>
        </div>
      </CardContent>
    </Card>
  );
}

interface FlowStepProps {
  number: number;
  title: string;
  body: string;
  tone: "primary" | "secondary" | "success";
}

function FlowStep({ number, title, body, tone }: FlowStepProps) {
  const toneClass = {
    primary: "bg-primary/10 text-primary border-primary/30",
    secondary: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  }[tone];

  return (
    <div className="relative">
      <div className={`rounded-lg border p-4 h-full ${toneClass}`}>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl font-bold leading-none">{number}</span>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <p className="text-xs leading-relaxed opacity-90">{body}</p>
      </div>
      <ArrowRight className="hidden sm:block absolute -right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 last:hidden" />
    </div>
  );
}

interface ComparisonCardProps {
  icon: typeof Package;
  title: string;
  who: string;
  when: string;
  examples: string[];
  tone: "orders" | "route_stops";
}

function ComparisonCard({ icon: Icon, title, who, when, examples, tone }: ComparisonCardProps) {
  const toneClass =
    tone === "orders"
      ? "border-blue-500/30 bg-blue-500/5"
      : "border-emerald-500/30 bg-emerald-500/5";
  return (
    <Card className={toneClass}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <div className="space-y-1 text-xs">
          <div>
            <span className="text-muted-foreground">¿Quién? </span>
            <span className="font-medium text-foreground">{who}</span>
          </div>
          <div>
            <span className="text-muted-foreground">¿Cuándo? </span>
            <span className="text-foreground">{when}</span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Ejemplos</p>
          <ul className="space-y-0.5 text-xs">
            {examples.map((ex) => (
              <li key={ex} className="flex items-start gap-1.5">
                <span className="text-muted-foreground">•</span>
                <span className="text-foreground">{ex}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

interface UseCaseProps {
  title: string;
  problem: string;
  solution: { label: string; value: string }[];
}

function UseCase({ title, problem, solution }: UseCaseProps) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Problema
          </p>
          <p className="text-xs text-foreground italic">"{problem}"</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Configuración
          </p>
          <ul className="space-y-1 mt-1">
            {solution.map((s) => (
              <li key={s.label} className="text-xs">
                <Badge variant="secondary" className="text-[10px] mr-1.5">
                  {s.label}
                </Badge>
                <span className="text-muted-foreground">{s.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

interface TypeCardProps {
  icon: typeof Type;
  label: string;
  description: string;
}

function TypeCard({ icon: Icon, label, description }: TypeCardProps) {
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-tight">{description}</p>
    </div>
  );
}

interface VisibilityRowProps {
  icon: typeof Eye;
  title: string;
  body: string;
}

function VisibilityRow({ icon: Icon, title, body }: VisibilityRowProps) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{body}</p>
      </div>
    </div>
  );
}

// Re-exported icons used by the flow dialog
export { CheckCircle2, AlertCircle };
