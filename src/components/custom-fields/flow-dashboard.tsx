"use client";

import {
  Archive,
  ArchiveRestore,
  Check,
  Edit,
  Eye,
  HelpCircle,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Can } from "@/components/auth/can";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CreationWizard } from "./creation-wizard";
import { type FieldDefinition, useCustomFields } from "./custom-fields-context";
import { CustomFieldsLearn } from "./custom-fields-learn";
import { EditSheet } from "./edit-sheet";
import { FlowRow } from "./flow-row";

/**
 * "Flujo del dato" dashboard — replaces the legacy tabbed table view.
 *
 * The mental model is built from three things working together:
 *   1. Stats strip — what's already configured, at a glance.
 *   2. Legend strip — anchors the read/write/confirm vocabulary.
 *   3. Flow rows — each field rendered as Origin → Field → Destinations
 *      so the journey of the data is impossible to miss.
 *
 * Empty state falls back to the educational view (CustomFieldsLearn)
 * for first-run, so the user doesn't see a blank canvas they don't
 * understand.
 */
export function FlowDashboard() {
  const { state, actions, meta } = useCustomFields();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FieldDefinition | null>(null);
  const [showLearn, setShowLearn] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [showCode, setShowCode] = useState(false);

  if (!meta.isReady || state.isLoading) {
    return (
      <div className="flex-1 p-8">
        <div className="mx-auto flex max-w-5xl justify-center py-12">
          <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex-1 p-8">
        <div className="mx-auto max-w-5xl">
          <ErrorState
            title="Error al cargar campos personalizados"
            error={state.error}
            onRetry={actions.refreshDefinitions}
          />
        </div>
      </div>
    );
  }

  const hasAnyDefinitions = state.definitions.length > 0;

  // First-run experience: educational view replaces dashboard so a
  // brand-new operator gets the mental model before the empty canvas.
  if (!hasAnyDefinitions) {
    return (
      <div className="flex-1 p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <header className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Campos personalizados</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Antes de crear tu primer campo, leé cómo funciona el flujo
                completo.
              </p>
            </div>
          </header>
          <CustomFieldsLearn
            asEmptyState
            onPrimaryAction={() => setCreating(true)}
          />
        </div>
        <CreationWizard open={creating} onClose={() => setCreating(false)} />
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden p-8">
      {/* Subtle dot-grid backdrop — borrowed from the design. Lives
          under content and never intercepts pointer events. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in oklch, var(--foreground), transparent 92%) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />

      <div className="relative mx-auto max-w-5xl space-y-6">
        {/* Hero */}
        <div>
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-accent-foreground">
            <Sparkles className="size-3" />
            Configuración
          </span>
          <h1 className="text-[32px] font-semibold leading-[1.1] tracking-tight">
            Campos personalizados
          </h1>
          <p className="mt-1.5 max-w-[640px] text-sm leading-relaxed text-muted-foreground">
            Cada campo es un{" "}
            <strong className="text-foreground">viaje de un dato</strong>:
            alguien lo <strong className="text-foreground">escribe</strong> al
            principio, y después puede verse o llenarse en distintas pantallas.
            Configurá esos dos puntos.
          </p>
        </div>

        {/* Stats + create */}
        <div className="flex flex-wrap items-stretch gap-4">
          <Stats definitions={state.definitions} />
          <div className="flex flex-1 items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLearn(true)}
            >
              <HelpCircle className="size-3.5" />
              ¿Cómo funciona?
            </Button>
            <Can perm="company:update">
              <Button size="lg" onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                Nuevo campo
              </Button>
            </Can>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o código"
              className="h-8 w-56 pl-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              id="cf-show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <label htmlFor="cf-show-archived" className="cursor-pointer">
              Ver archivados
            </label>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              id="cf-show-code"
              checked={showCode}
              onCheckedChange={setShowCode}
            />
            <label htmlFor="cf-show-code" className="cursor-pointer">
              Mostrar código interno
            </label>
          </div>
        </div>

        {/* Lane labels — anchored above the flow table so the user
            knows what each column means without reading instructions. */}
        <div className="grid grid-cols-[200px_1fr_240px] gap-8 px-6 pb-1 pt-3 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          <div>Quién lo escribe</div>
          <div>Campo</div>
          <div>Dónde aparece</div>
        </div>

        {/* Legend — anchors the read/write/confirm vocabulary. The
            small badges on destination icons reflect this same scheme. */}
        <div className="-mt-3 flex flex-wrap items-center gap-4 px-6 pb-2 text-xs text-muted-foreground">
          <LegendChip Icon={Edit} label="escribe" hint="crea el dato" />
          <LegendChip Icon={Eye} label="ve" hint="lectura, contexto" />
          <LegendChip Icon={Check} label="confirma" hint="lo llena al cerrar" />
          <span className="ml-auto opacity-70">Tocá una fila para editar.</span>
        </div>

        <FlowList
          definitions={state.definitions}
          query={query}
          showArchived={showArchived}
          showCode={showCode}
          onEdit={setEditing}
          onArchive={actions.deleteDefinition}
          onReactivate={(def) => actions.toggleActive(def, true)}
        />
      </div>

      {/* Modals — wizard for creation, sheet for editing, learn dialog */}
      <CreationWizard open={creating} onClose={() => setCreating(false)} />
      <EditSheet
        open={editing !== null}
        field={editing}
        onClose={() => setEditing(null)}
      />
      <Dialog open={showLearn} onOpenChange={setShowLearn}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cómo funcionan los campos personalizados</DialogTitle>
          </DialogHeader>
          <CustomFieldsLearn />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stats({ definitions }: { definitions: FieldDefinition[] }) {
  const active = definitions.filter((d) => d.active);
  const stats = {
    total: active.length,
    required: active.filter((d) => d.required).length,
    orders: active.filter((d) => d.entity === "orders").length,
    stops: active.filter((d) => d.entity === "route_stops").length,
  };
  return (
    <>
      <StatCard num={stats.total} label="campos activos" />
      <StatCard num={stats.required} label="obligatorios" tone="warn" />
      <StatCard num={stats.orders} label="que llena tu equipo" tone="orders" />
      <StatCard num={stats.stops} label="que llena el conductor" tone="stops" />
    </>
  );
}

function StatCard({
  num,
  label,
  tone = "neutral",
}: {
  num: number;
  label: string;
  tone?: "neutral" | "warn" | "orders" | "stops";
}) {
  const toneClass: Record<typeof tone, string> = {
    neutral: "bg-card text-foreground border-border",
    warn: "bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40",
    orders:
      "bg-blue-50 text-blue-700 border-blue-200/60 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/40",
    stops:
      "bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40",
  };
  return (
    <div
      className={`min-w-[130px] rounded-md border px-4 py-3 ${toneClass[tone]}`}
    >
      <div className="text-[26px] font-semibold leading-none tracking-tight">
        {num}
      </div>
      <div className="mt-1 text-[11px] opacity-85">{label}</div>
    </div>
  );
}

function LegendChip({
  Icon,
  label,
  hint,
}: {
  Icon: typeof Edit;
  label: string;
  hint: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex size-[18px] items-center justify-center rounded bg-muted text-foreground">
        <Icon className="size-[11px]" />
      </span>
      <strong className="font-semibold text-foreground">{label}</strong>
      <span className="opacity-80">= {hint}</span>
    </span>
  );
}

interface FlowListProps {
  definitions: FieldDefinition[];
  query: string;
  showArchived: boolean;
  showCode: boolean;
  onEdit: (field: FieldDefinition) => void;
  onArchive: (id: string) => void;
  onReactivate: (field: FieldDefinition) => void;
}

function FlowList({
  definitions,
  query,
  showArchived,
  showCode,
  onEdit,
  onArchive,
  onReactivate,
}: FlowListProps) {
  const { active, archived } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (d: FieldDefinition) =>
      !q ||
      d.label.toLowerCase().includes(q) ||
      d.code.toLowerCase().includes(q);

    const sortByEntityThenPosition = (
      a: FieldDefinition,
      b: FieldDefinition,
    ) => {
      if (a.entity !== b.entity) return a.entity === "orders" ? -1 : 1;
      return a.position - b.position;
    };

    return {
      active: definitions
        .filter((d) => d.active && matches(d))
        .sort(sortByEntityThenPosition),
      archived: definitions
        .filter((d) => !d.active && matches(d))
        .sort(sortByEntityThenPosition),
    };
  }, [definitions, query]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {active.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            {query
              ? `No hay campos activos que coincidan con "${query}".`
              : "No hay campos activos."}
          </div>
        ) : (
          active.map((field, i) => (
            <FlowRow
              key={field.id}
              field={field}
              isLast={i === active.length - 1}
              showCode={showCode}
              onEdit={() => onEdit(field)}
              onArchive={() => onArchive(field.id)}
            />
          ))
        )}
      </div>

      {showArchived && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Archive className="size-3.5" />
            <span>Archivados ({archived.length})</span>
          </div>
          {archived.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border bg-card opacity-70">
              {archived.map((field, i) => (
                <ArchivedRow
                  key={field.id}
                  field={field}
                  isLast={i === archived.length - 1}
                  onReactivate={() => onReactivate(field)}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-muted-foreground">
              No hay campos archivados.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function ArchivedRow({
  field,
  isLast,
  onReactivate,
}: {
  field: FieldDefinition;
  isLast: boolean;
  onReactivate: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between px-6 py-3 ${
        isLast ? "" : "border-b border-border"
      }`}
    >
      <div>
        <div className="text-sm font-medium">{field.label}</div>
        <div className="font-mono text-[11px] text-muted-foreground">
          {field.code}
        </div>
      </div>
      <Can perm="company:update">
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          onClick={onReactivate}
          title="Reactivar"
        >
          <ArchiveRestore className="size-3.5" />
        </Button>
      </Can>
    </div>
  );
}
