"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Camera,
  FileSignature,
  NotepadText,
  MessageCircle,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  ArrowDown,
  Package,
  Truck,
  Building2,
  Sparkles,
  AlertTriangle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  useWorkflow,
  WORKFLOW_TEMPLATES,
  type WorkflowState,
  type WorkflowStateInput,
  type SystemState,
  type TemplateType,
} from "./workflow-context";
import { WorkflowStateDialog } from "./workflow-state-dialog";

const SYSTEM_STATE_LABELS: Record<SystemState, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En progreso",
  COMPLETED: "Completado",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
};

const SYSTEM_STATE_BADGE_COLORS: Record<SystemState, string> = {
  PENDING: "bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-400",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-800/40 dark:text-blue-400",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-800/40 dark:text-green-400",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-800/40 dark:text-red-400",
  CANCELLED: "bg-amber-100 text-amber-700 dark:bg-amber-800/40 dark:text-amber-400",
};

const PRESET_COLORS = [
  "#6B7280", "#3B82F6", "#F59E0B", "#16A34A",
  "#DC4840", "#8B5CF6", "#EC4899", "#F97316",
  "#9CA3AF", "#14B8A6",
];

const TEMPLATE_ICONS: Record<TemplateType, typeof Package> = {
  delivery: Truck,
  paqueteria: Package,
  b2b: Building2,
};

// --- Main View ---

export function WorkflowDashboardView() {
  const { state, meta } = useWorkflow();
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  if (!meta.isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (state.isLoadingStates) {
    return (
      <div className="flex-1 bg-background p-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        </div>
      </div>
    );
  }

  const hasStates = state.states.length > 0;

  if (!hasStates || showTemplatePicker) {
    return (
      <TemplatePicker
        hasExistingStates={hasStates}
        onCancel={hasStates ? () => setShowTemplatePicker(false) : undefined}
      />
    );
  }

  return (
    <PipelineView onChangeTemplate={() => setShowTemplatePicker(true)} />
  );
}

// --- Template Picker ---

function TemplatePicker({
  hasExistingStates,
  onCancel,
}: {
  hasExistingStates: boolean;
  onCancel?: () => void;
}) {
  const { actions } = useWorkflow();
  const [applying, setApplying] = useState<TemplateType | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleApplyTemplate = async (type: TemplateType) => {
    setApplying(type);
    try {
      await actions.createFromTemplate(type);
    } catch {
      // toast in context
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="flex-1 bg-background p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="text-center space-y-2">
          {onCancel && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={onCancel}>
                <X className="h-4 w-4 mr-1" />
                Volver
              </Button>
            </div>
          )}
          <h1 className="text-2xl font-bold text-foreground">
            Configura tu flujo de entregas
          </h1>
          <p className="text-muted-foreground">
            Elige una plantilla para empezar o crea tu propio flujo desde cero
          </p>
          {hasExistingStates && (
            <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              Aplicar una plantilla reemplazara la configuracion actual
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(Object.entries(WORKFLOW_TEMPLATES) as [TemplateType, typeof WORKFLOW_TEMPLATES.delivery][]).map(
            ([type, template]) => {
              const Icon = TEMPLATE_ICONS[type];
              const isApplying = applying === type;
              const isDisabled = applying !== null;

              return (
                <Card
                  key={type}
                  className={`relative overflow-hidden transition-all hover:shadow-md ${
                    isDisabled && !isApplying ? "opacity-50" : ""
                  }`}
                >
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm">{template.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {template.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {template.states.map((s) => (
                        <div
                          key={s.code}
                          className="flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5"
                        >
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: s.color }}
                          />
                          <span className="text-[11px] text-muted-foreground">{s.label}</span>
                        </div>
                      ))}
                    </div>

                    <div className="text-[11px] text-muted-foreground truncate">
                      {[
                        ...template.states.filter((s) => !s.isTerminal).map((s) => s.label),
                        template.states.find((s) => s.systemState === "COMPLETED")?.label,
                      ]
                        .filter(Boolean)
                        .join(" \u2192 ")}
                    </div>

                    <Button
                      size="sm"
                      className="w-full"
                      disabled={isDisabled}
                      onClick={() => handleApplyTemplate(type)}
                    >
                      {isApplying ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          Aplicando...
                        </>
                      ) : (
                        "Usar esta plantilla"
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            }
          )}

          {/* Custom / blank card */}
          <Card className={`relative overflow-hidden border-dashed transition-all hover:shadow-md ${applying ? "opacity-50" : ""}`}>
            <CardContent className="p-5 flex flex-col items-center justify-center text-center space-y-4 h-full">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Personalizado</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Crea tu propio flujo desde cero
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={applying !== null}
                onClick={() => setDialogOpen(true)}
              >
                Comenzar desde cero
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <WorkflowStateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingState={null}
      />
    </div>
  );
}

// --- Pipeline View ---

function PipelineView({ onChangeTemplate }: { onChangeTemplate: () => void }) {
  const { state } = useWorkflow();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transitionsExpanded, setTransitionsExpanded] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex-1 bg-background p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Flujo de entregas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {state.states.length} estados configurados
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onChangeTemplate}>
              Cambiar plantilla
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Agregar estado
            </Button>
          </div>
        </div>

        {/* Pipeline cards */}
        <div className="space-y-0">
          {state.states.map((ws, idx) => (
            <div key={ws.id}>
              <StateCard
                workflowState={ws}
                isExpanded={expandedId === ws.id}
                onToggleExpand={() => toggleExpand(ws.id)}
              />
              {idx < state.states.length - 1 && (
                <div className="flex justify-center py-1">
                  <ArrowDown className="h-4 w-4 text-muted-foreground/40" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Transitions section */}
        {state.states.length >= 2 && (
          <TransitionsSection
            expanded={transitionsExpanded}
            onToggle={() => setTransitionsExpanded((v) => !v)}
          />
        )}
      </div>

      <WorkflowStateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingState={null}
      />
    </div>
  );
}

// --- State Card (collapsed + expanded inline editing) ---

function StateCard({
  workflowState,
  isExpanded,
  onToggleExpand,
}: {
  workflowState: WorkflowState;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const { state, actions } = useWorkflow();

  // Compute transitions FROM this state
  const transitionsFrom = useMemo(() => {
    const fromIds = state.transitions
      .filter((t) => t.fromStateId === workflowState.id)
      .map((t) => t.toStateId);
    return state.states.filter((s) => fromIds.includes(s.id));
  }, [state.transitions, state.states, workflowState.id]);

  // Inline edit form state
  const [editData, setEditData] = useState<WorkflowStateInput | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleExpand = () => {
    if (!isExpanded) {
      setEditData({
        code: workflowState.code,
        label: workflowState.label,
        systemState: workflowState.systemState,
        color: workflowState.color,
        position: workflowState.position,
        isDefault: workflowState.isDefault,
        isTerminal: workflowState.isTerminal,
        requiresReason: workflowState.requiresReason,
        reasonOptions: workflowState.reasonOptions || [],
        requiresPhoto: workflowState.requiresPhoto,
        requiresSignature: workflowState.requiresSignature,
        requiresNotes: workflowState.requiresNotes,
      });
      setReasonText((workflowState.reasonOptions || []).join("\n"));
    }
    onToggleExpand();
  };

  const handleSave = async () => {
    if (!editData) return;
    setIsSaving(true);
    try {
      await actions.updateState(workflowState.id, {
        ...editData,
        code: editData.code.toUpperCase().trim(),
        label: editData.label.trim(),
        reasonOptions: editData.requiresReason
          ? reasonText.split("\n").map((s) => s.trim()).filter(Boolean)
          : [],
      });
      onToggleExpand();
    } catch {
      // toast in context
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await actions.deleteState(workflowState.id);
    } catch {
      // toast in context
    } finally {
      setIsDeleting(false);
    }
  };

  const requirementIcons = [
    { key: "requiresPhoto" as const, icon: Camera, label: "Foto" },
    { key: "requiresSignature" as const, icon: FileSignature, label: "Firma" },
    { key: "requiresNotes" as const, icon: NotepadText, label: "Notas" },
    { key: "requiresReason" as const, icon: MessageCircle, label: "Motivo" },
  ];

  const activeRequirements = requirementIcons.filter((r) => workflowState[r.key]);

  return (
    <Card className={`transition-all ${isExpanded ? "ring-1 ring-primary/20" : "hover:bg-muted/30"}`}>
      {/* Collapsed header - always visible */}
      <button
        type="button"
        className="flex w-full items-center gap-3 p-4 text-left"
        onClick={handleExpand}
      >
        <span
          className="h-3.5 w-3.5 rounded-full shrink-0"
          style={{ backgroundColor: workflowState.color }}
        />
        <span className="font-medium text-sm flex-1 min-w-0 truncate">
          {workflowState.label}
        </span>

        <div className="flex items-center gap-2 shrink-0">
          {activeRequirements.length > 0 && (
            <div className="flex items-center gap-1">
              {activeRequirements.map((r) => (
                <r.icon key={r.key} className="h-3.5 w-3.5 text-muted-foreground" />
              ))}
            </div>
          )}

          {workflowState.isTerminal && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Terminal</Badge>
          )}
          {workflowState.isDefault && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/50 text-primary">
              Default
            </Badge>
          )}

          <Badge
            variant="secondary"
            className={`text-[10px] px-1.5 py-0 ${SYSTEM_STATE_BADGE_COLORS[workflowState.systemState]}`}
          >
            {SYSTEM_STATE_LABELS[workflowState.systemState]}
          </Badge>

          {transitionsFrom.length > 0 && !isExpanded && (
            <span className="text-[11px] text-muted-foreground hidden md:inline truncate max-w-[180px]">
              Desde aqui: {transitionsFrom.map((s) => s.label).join(", ")}
            </span>
          )}

          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded inline edit form */}
      {isExpanded && editData && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          {/* Name + Code */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={editData.label}
                onChange={(e) => setEditData((p) => p && { ...p, label: e.target.value })}
                className="h-8 text-sm"
                disabled={isSaving}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Codigo</Label>
              <Input
                value={editData.code}
                onChange={(e) =>
                  setEditData((p) => p && { ...p, code: e.target.value.toUpperCase() })
                }
                className="h-8 text-sm font-mono"
                disabled={isSaving}
              />
            </div>
          </div>

          {/* Color presets */}
          <div className="space-y-1">
            <Label className="text-xs">Color</Label>
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setEditData((p) => p && { ...p, color })}
                  className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor: editData.color === color ? "var(--foreground)" : "transparent",
                  }}
                  disabled={isSaving}
                />
              ))}
            </div>
          </div>

          {/* Requirement toggles as icon buttons */}
          <div className="space-y-1">
            <Label className="text-xs">Requerimientos</Label>
            <div className="flex items-center gap-2">
              {requirementIcons.map((r) => {
                const isActive = editData[r.key];
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setEditData((p) => p && { ...p, [r.key]: !p[r.key] })}
                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                      isActive
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                    disabled={isSaving}
                  >
                    <r.icon className="h-3.5 w-3.5" />
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reason options - shown when motivo active */}
          {editData.requiresReason && (
            <div className="space-y-1">
              <Label className="text-xs">Opciones de motivo (una por linea)</Label>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                rows={3}
                disabled={isSaving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={"Cliente ausente\nDireccion incorrecta\nOtro"}
              />
            </div>
          )}

          {/* Terminal + Default toggles */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={editData.isTerminal}
                onCheckedChange={(v) => setEditData((p) => p && { ...p, isTerminal: v })}
                disabled={isSaving}
              />
              <Label className="text-sm cursor-pointer">Terminal</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editData.isDefault}
                onCheckedChange={(v) => setEditData((p) => p && { ...p, isDefault: v })}
                disabled={isSaving}
              />
              <Label className="text-sm cursor-pointer">Por defecto</Label>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-1">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={isSaving || isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                  )}
                  Eliminar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminar estado</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta accion eliminara el estado{" "}
                    <strong>{workflowState.label}</strong> y todas sus
                    transiciones asociadas. Esta accion no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleExpand}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// --- Transitions Section (collapsible with matrix) ---

function TransitionsSection({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const { state, actions } = useWorkflow();
  const [updatingCells, setUpdatingCells] = useState<Set<string>>(new Set());

  // Build a summary of transitions
  const transitionSummary = useMemo(() => {
    const byFrom: Record<string, string[]> = {};
    for (const t of state.transitions) {
      const from = state.states.find((s) => s.id === t.fromStateId);
      const to = state.states.find((s) => s.id === t.toStateId);
      if (from && to) {
        if (!byFrom[from.label]) byFrom[from.label] = [];
        byFrom[from.label].push(to.label);
      }
    }
    return Object.entries(byFrom)
      .map(([from, tos]) => `${from} -> ${tos.join(", ")}`)
      .join("  |  ");
  }, [state.transitions, state.states]);

  const findTransition = (fromId: string, toId: string) => {
    return state.transitions.find((t) => t.fromStateId === fromId && t.toStateId === toId);
  };

  const handleToggle = async (fromId: string, toId: string) => {
    const cellKey = `${fromId}-${toId}`;
    setUpdatingCells((prev) => new Set(prev).add(cellKey));

    try {
      const existing = findTransition(fromId, toId);
      if (existing) {
        await actions.deleteTransition(existing.id);
      } else {
        await actions.createTransition(fromId, toId);
      }
    } catch {
      // toast in context
    } finally {
      setUpdatingCells((prev) => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  };

  return (
    <Card>
      <button
        type="button"
        className="flex w-full items-center gap-2 p-4 text-left"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold flex-1">Transiciones permitidas</span>
        <Badge variant="secondary" className="text-[10px]">
          {state.transitions.length}
        </Badge>
      </button>

      {!expanded && transitionSummary && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-[11px] text-muted-foreground truncate">{transitionSummary}</p>
        </div>
      )}

      {expanded && (
        <div className="border-t px-4 pb-4 pt-3">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border-b p-2 text-left text-xs font-medium text-muted-foreground w-36">
                    De / A
                  </th>
                  {state.states.map((toState) => (
                    <th key={toState.id} className="border-b p-2 text-center text-xs font-medium min-w-[72px]">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: toState.color }}
                        />
                        <span className="truncate max-w-[64px]">{toState.label}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.states.map((fromState) => {
                  const isFromTerminal = fromState.isTerminal;
                  return (
                    <tr key={fromState.id} className="hover:bg-muted/30">
                      <td className="border-b p-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: fromState.color }}
                          />
                          <span className="font-medium truncate text-xs">
                            {fromState.label}
                          </span>
                        </div>
                      </td>
                      {state.states.map((toState) => {
                        const isSelf = fromState.id === toState.id;
                        const isDisabled = isSelf || isFromTerminal;
                        const transition = findTransition(fromState.id, toState.id);
                        const cellKey = `${fromState.id}-${toState.id}`;
                        const isUpdating = updatingCells.has(cellKey);

                        return (
                          <td key={toState.id} className="border-b p-2 text-center">
                            {isDisabled ? (
                              <span className="text-muted-foreground/30">--</span>
                            ) : isUpdating ? (
                              <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                            ) : (
                              <Checkbox
                                checked={!!transition}
                                onCheckedChange={() => handleToggle(fromState.id, toState.id)}
                                className="mx-auto"
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Los estados terminales no pueden tener transiciones de salida. La diagonal esta bloqueada.
          </p>
        </div>
      )}
    </Card>
  );
}
