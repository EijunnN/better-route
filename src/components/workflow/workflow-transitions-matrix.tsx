"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useCan } from "@/components/auth/can";
import { useWorkflow } from "./workflow-context";

export function WorkflowTransitionsMatrix({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const { state, actions } = useWorkflow();
  const canEdit = useCan("company:update");
  const [updatingCells, setUpdatingCells] = useState<Set<string>>(new Set());

  const findTransition = (fromId: string, toId: string) =>
    state.transitions.find(
      (t) => t.fromStateId === fromId && t.toStateId === toId,
    );

  // Summary shown in the collapsed card: "A → B, C  |  B → D".
  const byFrom: Record<string, string[]> = {};
  for (const t of state.transitions) {
    const from = state.states.find((s) => s.id === t.fromStateId);
    const to = state.states.find((s) => s.id === t.toStateId);
    if (from && to) {
      (byFrom[from.label] ||= []).push(to.label);
    }
  }
  const transitionSummary = Object.entries(byFrom)
    .map(([from, tos]) => `${from} → ${tos.join(", ")}`)
    .join("  |  ");

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
      // toast handled in context
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

      {!expanded && transitionSummary && (
        <div className="-mt-1 px-4 pb-3">
          <p className="truncate text-[11px] text-muted-foreground">
            {transitionSummary}
          </p>
        </div>
      )}

      {expanded && (
        <div className="border-t px-4 pb-4 pt-3">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-36 border-b p-2 text-left text-xs font-medium text-muted-foreground">
                    De / A
                  </th>
                  {state.states.map((toState) => (
                    <th
                      key={toState.id}
                      className="min-w-[72px] border-b p-2 text-center text-xs font-medium"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: toState.color }}
                          aria-hidden="true"
                        />
                        <span className="max-w-[64px] truncate">
                          {toState.label}
                        </span>
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
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: fromState.color }}
                            aria-hidden="true"
                          />
                          <span className="truncate text-xs font-medium">
                            {fromState.label}
                          </span>
                        </div>
                      </td>
                      {state.states.map((toState) => {
                        const isSelf = fromState.id === toState.id;
                        const isDisabled = isSelf || isFromTerminal;
                        const transition = findTransition(
                          fromState.id,
                          toState.id,
                        );
                        const cellKey = `${fromState.id}-${toState.id}`;
                        const isUpdating = updatingCells.has(cellKey);

                        return (
                          <td
                            key={toState.id}
                            className="border-b p-2 text-center"
                          >
                            {isDisabled ? (
                              <span
                                className="text-muted-foreground/30"
                                aria-label="No aplicable"
                              >
                                —
                              </span>
                            ) : isUpdating ? (
                              <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                              <Checkbox
                                checked={!!transition}
                                onCheckedChange={() =>
                                  handleToggle(fromState.id, toState.id)
                                }
                                disabled={!canEdit}
                                className="mx-auto"
                                aria-label={`${transition ? "Quitar" : "Permitir"} transición de ${fromState.label} a ${toState.label}`}
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
            Los estados terminales no pueden tener transiciones de salida. La
            diagonal está bloqueada.
          </p>
        </div>
      )}
    </Card>
  );
}
