"use client";

import { useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronRight, Loader2, Plus, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useCan } from "@/components/auth/can";
import type { WorkflowState } from "./workflow-context";
import { useWorkflow } from "./workflow-context";

/**
 * Transition editor as a list of "from this state you can move to..." cards,
 * rather than a dense from/to matrix of checkboxes.
 *
 * Why: the matrix answers "(i,j) is allowed?" — that's a developer mental
 * model. Planners think in terms of a graph: "once the order is in state X,
 * what states can it move to?". Each non-terminal state gets its own card
 * with chips for every possible destination. Click the chip to toggle.
 * Terminal states collapse into a footer strip so they don't add noise.
 */
export function WorkflowTransitionsEditor({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const { state, actions } = useWorkflow();
  const canEdit = useCan("company:update");
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const nonTerminal = state.states.filter((s) => !s.isTerminal);
  const terminal = state.states.filter((s) => s.isTerminal);

  const findTransition = (fromId: string, toId: string) =>
    state.transitions.find(
      (t) => t.fromStateId === fromId && t.toStateId === toId,
    );

  const handleToggle = async (from: WorkflowState, to: WorkflowState) => {
    if (!canEdit || from.isTerminal) return;
    const key = `${from.id}-${to.id}`;
    setUpdatingKey(key);
    try {
      const existing = findTransition(from.id, to.id);
      if (existing) {
        await actions.deleteTransition(existing.id);
      } else {
        await actions.createTransition(from.id, to.id);
      }
    } catch {
      // toast handled in context
    } finally {
      setUpdatingKey(null);
    }
  };

  return (
    <Card>
      <button
        type="button"
        className="flex w-full items-center gap-2 p-4 text-left"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="flex-1 text-sm font-semibold">
          Transiciones permitidas
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {state.transitions.length}
        </Badge>
      </button>

      {!expanded && state.transitions.length > 0 && (
        <div className="-mt-1 px-4 pb-3">
          <TransitionsSummary states={state.states} transitions={state.transitions} />
        </div>
      )}

      {expanded && (
        <div className="space-y-5 border-t px-4 pb-4 pt-4">
          {nonTerminal.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Todos los estados son terminales. Agrega al menos un estado
              intermedio para configurar transiciones.
            </p>
          ) : (
            nonTerminal.map((from) => (
              <TransitionRow
                key={from.id}
                from={from}
                allStates={state.states}
                getTransition={(toId) => findTransition(from.id, toId)}
                onToggle={(to) => handleToggle(from, to)}
                updatingKey={updatingKey}
                canEdit={canEdit}
              />
            ))
          )}

          {terminal.length > 0 && (
            <div className="mt-6 rounded-md border border-dashed bg-muted/20 p-3">
              <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                Estados finales (los pedidos se detienen aquí)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {terminal.map((s) => (
                  <Badge
                    key={s.id}
                    variant="outline"
                    className="gap-1.5 font-normal"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                      aria-hidden="true"
                    />
                    {s.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Clic en un chip para habilitar o deshabilitar esa transición. Los
            estados terminales no pueden transicionar — ajusta el flag en la
            configuración del estado si necesitás cambiarlo.
          </p>
        </div>
      )}
    </Card>
  );
}

function TransitionRow({
  from,
  allStates,
  getTransition,
  onToggle,
  updatingKey,
  canEdit,
}: {
  from: WorkflowState;
  allStates: WorkflowState[];
  getTransition: (toId: string) => { id: string } | undefined;
  onToggle: (to: WorkflowState) => void;
  updatingKey: string | null;
  canEdit: boolean;
}) {
  const targets = allStates.filter((s) => s.id !== from.id);
  const activeTargets = targets.filter((t) => getTransition(t.id));
  const inactiveTargets = targets.filter((t) => !getTransition(t.id));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: from.color }}
          aria-hidden="true"
        />
        <span className="text-sm font-medium">{from.label}</span>
        {from.isDefault && (
          <Badge variant="outline" className="border-primary/50 px-1.5 py-0 text-[10px] text-primary">
            Inicial
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          ({activeTargets.length} salida{activeTargets.length === 1 ? "" : "s"})
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-5">
        <span
          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          <ArrowRight className="h-3 w-3" />
        </span>
        {activeTargets.length === 0 && inactiveTargets.length === 0 && (
          <span className="text-xs text-muted-foreground">
            No hay otros estados disponibles
          </span>
        )}

        {/* Active first, then inactive. Keeps "what the flow is" at the
            left, then "what you could add" to the right. */}
        {activeTargets.map((to) => (
          <TransitionChip
            key={to.id}
            to={to}
            isActive
            isUpdating={updatingKey === `${from.id}-${to.id}`}
            canEdit={canEdit}
            onToggle={() => onToggle(to)}
          />
        ))}
        {inactiveTargets.map((to) => (
          <TransitionChip
            key={to.id}
            to={to}
            isActive={false}
            isUpdating={updatingKey === `${from.id}-${to.id}`}
            canEdit={canEdit}
            onToggle={() => onToggle(to)}
          />
        ))}
      </div>
    </div>
  );
}

function TransitionChip({
  to,
  isActive,
  isUpdating,
  canEdit,
  onToggle,
}: {
  to: WorkflowState;
  isActive: boolean;
  isUpdating: boolean;
  canEdit: boolean;
  onToggle: () => void;
}) {
  const base =
    "group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all";
  const active = "bg-primary/10 text-primary ring-1 ring-primary/30 hover:bg-primary/15";
  const inactive = "border border-dashed text-muted-foreground hover:border-primary/50 hover:text-foreground";
  const disabled = "opacity-60 cursor-not-allowed";

  return (
    <button
      type="button"
      disabled={!canEdit || isUpdating}
      onClick={onToggle}
      className={`${base} ${isActive ? active : inactive} ${!canEdit ? disabled : ""}`}
      aria-pressed={isActive}
      aria-label={`${isActive ? "Quitar" : "Permitir"} transición hacia ${to.label}`}
    >
      {isUpdating ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : isActive ? (
        <Check className="h-3 w-3" />
      ) : (
        <Plus className="h-3 w-3 opacity-60 group-hover:opacity-100" />
      )}
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: to.color }}
        aria-hidden="true"
      />
      {to.label}
    </button>
  );
}

/**
 * Compact one-liner shown when the card is collapsed: "Pendiente → En
 * camino, No entregado  ·  En camino → Entregado, …".
 */
function TransitionsSummary({
  states,
  transitions,
}: {
  states: WorkflowState[];
  transitions: Array<{ fromStateId: string; toStateId: string }>;
}) {
  const byFrom: Record<string, string[]> = {};
  for (const t of transitions) {
    const from = states.find((s) => s.id === t.fromStateId);
    const to = states.find((s) => s.id === t.toStateId);
    if (from && to) {
      (byFrom[from.label] ||= []).push(to.label);
    }
  }
  const entries = Object.entries(byFrom);
  if (entries.length === 0) return null;
  const summary = entries
    .map(([from, tos]) => `${from} → ${tos.join(", ")}`)
    .join("  ·  ");
  return (
    <p className="truncate text-[11px] text-muted-foreground">{summary}</p>
  );
}
