"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Archive,
  ArchiveRestore,
  Loader2,
  Type,
  Hash,
  List,
  Calendar,
  DollarSign,
  Phone,
  Mail,
  ToggleLeft,
  Package,
  MapPin,
  ChevronUp,
  ChevronDown,
  Search,
  Eye,
  Smartphone,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Can } from "@/components/auth/can";
import { ErrorState } from "@/components/ui/error-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useCustomFields,
  FIELD_TYPE_LABELS,
  type FieldDefinition,
  type FieldEntity,
  type FieldType,
} from "./custom-fields-context";
import { FieldDefinitionDialog } from "./field-definition-dialog";

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

const FIELD_TYPE_COLOR: Record<FieldType, string> = {
  text: "text-slate-600 bg-slate-100 dark:bg-slate-800/50 dark:text-slate-300",
  number: "text-blue-600 bg-blue-100 dark:bg-blue-800/50 dark:text-blue-300",
  select: "text-purple-600 bg-purple-100 dark:bg-purple-800/50 dark:text-purple-300",
  date: "text-amber-600 bg-amber-100 dark:bg-amber-800/50 dark:text-amber-300",
  currency: "text-green-600 bg-green-100 dark:bg-green-800/50 dark:text-green-300",
  phone: "text-cyan-600 bg-cyan-100 dark:bg-cyan-800/50 dark:text-cyan-300",
  email: "text-pink-600 bg-pink-100 dark:bg-pink-800/50 dark:text-pink-300",
  boolean: "text-orange-600 bg-orange-100 dark:bg-orange-800/50 dark:text-orange-300",
};

const ENTITY_META: Record<FieldEntity, { label: string; icon: typeof Package; description: string }> = {
  orders: {
    label: "Pedidos",
    icon: Package,
    description: "Se llenan al crear el pedido desde el panel o al importarlos.",
  },
  route_stops: {
    label: "Entregas",
    icon: MapPin,
    description: "Los completa el conductor en la app al llegar a la parada.",
  },
};

export function CustomFieldsDashboardView() {
  const { state, meta, actions } = useCustomFields();
  const [activeTab, setActiveTab] = useState<FieldEntity>("orders");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  if (!meta.isReady || state.isLoading) {
    return (
      <div className="flex-1 bg-background p-8">
        <div className="mx-auto max-w-5xl flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex-1 bg-background p-8">
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

  const hasAnyActive = state.definitions.some((d) => d.active);

  return (
    <div className="flex-1 bg-background p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Campos personalizados</h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
              Define información adicional que tu equipo necesita capturar en cada pedido y cada
              entrega. Los cambios se aplican solo a los pedidos creados a partir de ahora.
            </p>
          </div>
          <Can perm="company:update">
            <Button size="sm" onClick={() => actions.openCreateDialog(activeTab)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nuevo campo
            </Button>
          </Can>
        </header>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FieldEntity)}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList>
              {(["orders", "route_stops"] as FieldEntity[]).map((entity) => {
                const tabMeta = ENTITY_META[entity];
                const Icon = tabMeta.icon;
                const count = state.definitions.filter(
                  (d) => d.entity === entity && d.active,
                ).length;
                return (
                  <TabsTrigger key={entity} value={entity} className="gap-2">
                    <Icon className="h-3.5 w-3.5" />
                    {tabMeta.label}
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {count}
                    </Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {hasAnyActive && (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por nombre o código"
                    className="h-8 w-56 pl-8 text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <Switch checked={showArchived} onCheckedChange={setShowArchived} />
                  Ver archivados
                </label>
              </div>
            )}
          </div>

          {(["orders", "route_stops"] as FieldEntity[]).map((entity) => (
            <TabsContent key={entity} value={entity} className="mt-4">
              <EntityPanel
                entity={entity}
                query={query}
                showArchived={showArchived}
                onCreate={() => actions.openCreateDialog(entity)}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <FieldDefinitionDialog />
    </div>
  );
}

interface ExampleChip {
  icon: typeof Type;
  label: string;
}

const ENTITY_EXAMPLES: Record<FieldEntity, ExampleChip[]> = {
  orders: [
    { icon: DollarSign, label: "Monto de cobro" },
    { icon: Type, label: "Referencia del cliente" },
    { icon: List, label: "Tipo de servicio" },
    { icon: Phone, label: "Teléfono de contacto" },
  ],
  route_stops: [
    { icon: ToggleLeft, label: "Firma recibida" },
    { icon: Type, label: "Número de recibido" },
    { icon: List, label: "Motivo de no entrega" },
    { icon: Calendar, label: "Hora de llegada" },
  ],
};

interface EntityPanelProps {
  entity: FieldEntity;
  query: string;
  showArchived: boolean;
  onCreate: () => void;
}

function EntityPanel({ entity, query, showArchived, onCreate }: EntityPanelProps) {
  const { state } = useCustomFields();
  const meta = ENTITY_META[entity];

  const { active, archived } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (d: FieldDefinition) =>
      !q || d.label.toLowerCase().includes(q) || d.code.toLowerCase().includes(q);
    const inEntity = state.definitions.filter((d) => d.entity === entity && matches(d));
    return {
      active: inEntity.filter((d) => d.active),
      archived: inEntity.filter((d) => !d.active),
    };
  }, [state.definitions, entity, query]);

  if (active.length === 0 && !showArchived) {
    const examples = ENTITY_EXAMPLES[entity];
    const EntityIcon = meta.icon;
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center text-center py-12 space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <EntityIcon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-semibold">
              Aún no hay campos para {meta.label.toLowerCase()}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {meta.description}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {examples.map((example) => {
              const Icon = example.icon;
              return (
                <Badge key={example.label} variant="secondary" className="text-[11px]">
                  <Icon className="h-3 w-3 mr-1" />
                  {example.label}
                </Badge>
              );
            })}
          </div>
          <Can perm="company:update">
            <Button size="sm" onClick={onCreate} className="mt-2">
              <Plus className="h-4 w-4 mr-1.5" />
              Agregar campo de {meta.label.toLowerCase()}
            </Button>
          </Can>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <DefinitionsTable
        definitions={active}
        kind="active"
        emptyHint={`No hay campos activos que coincidan con "${query}".`}
      />

      {showArchived && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Archive className="h-3.5 w-3.5" />
            <span>Archivados ({archived.length})</span>
          </div>
          {archived.length > 0 ? (
            <DefinitionsTable definitions={archived} kind="archived" emptyHint="" />
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No hay campos archivados.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

interface DefinitionsTableProps {
  definitions: FieldDefinition[];
  kind: "active" | "archived";
  emptyHint: string;
}

function DefinitionsTable({ definitions, kind, emptyHint }: DefinitionsTableProps) {
  if (definitions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {emptyHint}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="w-16 p-3 text-left font-medium text-muted-foreground">Orden</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Campo</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Tipo</th>
              <th className="p-3 text-center font-medium text-muted-foreground">Obligatorio</th>
              <th className="p-3 text-center font-medium text-muted-foreground">Visible en</th>
              <th className="p-3 text-center font-medium text-muted-foreground">Activo</th>
              <th className="p-3 text-right font-medium text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {definitions.map((def, idx) => (
              <DefinitionRow
                key={def.id}
                definition={def}
                kind={kind}
                isFirst={idx === 0}
                isLast={idx === definitions.length - 1}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

interface DefinitionRowProps {
  definition: FieldDefinition;
  kind: "active" | "archived";
  isFirst: boolean;
  isLast: boolean;
}

function DefinitionRow({ definition, kind, isFirst, isLast }: DefinitionRowProps) {
  const { actions } = useCustomFields();
  const [isBusy, setIsBusy] = useState(false);

  const handleArchive = async () => {
    setIsBusy(true);
    try {
      await actions.deleteDefinition(definition.id);
    } catch {
      // toast in context
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggle = async (active: boolean) => {
    setIsBusy(true);
    try {
      await actions.toggleActive(definition, active);
    } catch {
      // toast in context
    } finally {
      setIsBusy(false);
    }
  };

  const handleMove = async (direction: "up" | "down") => {
    setIsBusy(true);
    try {
      await actions.reorder(definition, direction);
    } catch {
      // toast in context
    } finally {
      setIsBusy(false);
    }
  };

  const TypeIcon = FIELD_TYPE_ICON[definition.fieldType] ?? Type;
  const typeColor = FIELD_TYPE_COLOR[definition.fieldType] ?? FIELD_TYPE_COLOR.text;
  const isArchived = kind === "archived";

  return (
    <tr className={`border-b last:border-b-0 ${isArchived ? "opacity-60" : "hover:bg-muted/30"}`}>
      <td className="p-3">
        <Can perm="company:update" fallback={<span className="text-xs text-muted-foreground">—</span>}>
          <div className="flex flex-col">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-7 p-0"
              disabled={isBusy || isFirst || isArchived}
              onClick={() => handleMove("up")}
              title="Mover arriba"
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-7 p-0"
              disabled={isBusy || isLast || isArchived}
              onClick={() => handleMove("down")}
              title="Mover abajo"
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
        </Can>
      </td>
      <td className="p-3">
        <div>
          <span className="font-medium">{definition.label}</span>
          <span className="block text-xs text-muted-foreground font-mono">{definition.code}</span>
        </div>
      </td>
      <td className="p-3">
        <Badge variant="secondary" className={`text-[11px] gap-1 ${typeColor}`}>
          <TypeIcon className="h-3 w-3" />
          {FIELD_TYPE_LABELS[definition.fieldType]}
        </Badge>
      </td>
      <td className="p-3 text-center">
        {definition.required ? (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600">
            Obligatorio
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Opcional</span>
        )}
      </td>
      <td className="p-3">
        <VisibilityIcons definition={definition} />
      </td>
      <td className="p-3 text-center">
        <Can
          perm="company:update"
          fallback={
            <Badge variant={definition.active ? "secondary" : "outline"} className="text-[10px]">
              {definition.active ? "Activo" : "Archivado"}
            </Badge>
          }
        >
          <Switch
            checked={definition.active}
            onCheckedChange={handleToggle}
            disabled={isBusy}
            aria-label={definition.active ? "Archivar campo" : "Reactivar campo"}
          />
        </Can>
      </td>
      <td className="p-3">
        <div className="flex items-center justify-end gap-1">
          <Can perm="company:update">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => actions.openEditDialog(definition)}
              disabled={isBusy}
              title="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>

            {definition.active ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    disabled={isBusy}
                    title="Archivar"
                  >
                    {isBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Archivar este campo?</AlertDialogTitle>
                    <AlertDialogDescription>
                      El campo <strong>{definition.label}</strong> dejará de aparecer en
                      formularios nuevos. Los datos históricos se conservan y podés reactivarlo
                      cuando quieras desde la vista de archivados.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleArchive}>
                      Archivar campo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                disabled={isBusy}
                onClick={() => handleToggle(true)}
                title="Reactivar"
              >
                {isBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArchiveRestore className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </Can>
        </div>
      </td>
    </tr>
  );
}

function VisibilityIcons({ definition }: { definition: FieldDefinition }) {
  const items: { key: keyof FieldDefinition; icon: typeof Eye; label: string }[] = [
    { key: "showInList", icon: Eye, label: "Tabla del panel" },
    { key: "showInMobile", icon: Smartphone, label: "App del conductor" },
    { key: "showInCsv", icon: FileSpreadsheet, label: "Importar/exportar CSV" },
  ];

  return (
    <div className="flex items-center justify-center gap-2">
      {items.map((item) => {
        const enabled = definition[item.key] as boolean;
        const Icon = item.icon;
        return (
          <span
            key={item.key as string}
            className={`inline-flex h-6 w-6 items-center justify-center rounded ${
              enabled
                ? "bg-primary/10 text-primary"
                : "bg-muted/40 text-muted-foreground/40"
            }`}
            title={`${item.label}: ${enabled ? "sí" : "no"}`}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        );
      })}
    </div>
  );
}
