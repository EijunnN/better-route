"use client";

import {
  Camera,
  CheckCircle2,
  CornerDownRight,
  FileSignature,
  MessageCircle,
  NotepadText,
  Play,
  RotateCcw,
  Shield,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SystemState, WorkflowState } from "./workflow-context";
import { useWorkflow } from "./workflow-context";

const REQUIREMENT_ICONS = [
  { key: "requiresPhoto" as const, icon: Camera, title: "Requiere foto" },
  { key: "requiresSignature" as const, icon: FileSignature, title: "Requiere firma" },
  { key: "requiresNotes" as const, icon: NotepadText, title: "Requiere notas" },
  { key: "requiresReason" as const, icon: MessageCircle, title: "Requiere motivo" },
];

const TERMINAL_ICON: Record<SystemState, typeof CheckCircle2> = {
  COMPLETED: CheckCircle2,
  FAILED: XCircle,
  CANCELLED: XCircle,
  PENDING: Play,
  IN_PROGRESS: Play,
};

const TERMINAL_LABEL: Record<SystemState, string> = {
  COMPLETED: "éxito",
  FAILED: "fallo",
  CANCELLED: "cancelado",
  PENDING: "",
  IN_PROGRESS: "",
};

/**
 * Read-only tree view answering the planner's actual question:
 *
 *   "Once an order is created, what happens to it?"
 *
 * Starts from every state marked `isDefault` (or any state without incoming
 * transitions, as a fallback), walks the transition graph depth-first, and
 * prints each branch as nested rows. Cycles are rendered as "↺ volver a X"
 * instead of re-expanding the same state — so you see the flow in one
 * glance without infinite nesting.
 */
export function WorkflowFlowView() {
  const { state } = useWorkflow();

  const roots = state.states.filter((s) => s.isDefault);
  // Fallback: if no state is marked default, start from any state with zero
  // incoming transitions. Otherwise we'd render nothing on broken data.
  const safeRoots =
    roots.length > 0
      ? roots
      : state.states.filter(
          (s) => !state.transitions.some((t) => t.toStateId === s.id),
        );

  if (safeRoots.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Sin estado inicial configurado. Marca al menos uno como «Por defecto».
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          Leé el árbol como <strong>«desde aquí el pedido puede seguir
          así»</strong>.
        </span>
        <LegendChip label="ramifica">
          <CornerDownRight className="h-3 w-3" />
        </LegendChip>
        <LegendChip label="vuelve">
          <RotateCcw className="h-3 w-3" />
        </LegendChip>
        <LegendChip label="estado final">
          <Shield className="h-3 w-3" />
        </LegendChip>
      </div>

      {safeRoots.map((root) => (
        <FlowBranch
          key={root.id}
          node={root}
          isRoot
          visited={new Set()}
          depth={0}
        />
      ))}

      <UnreachableNotice roots={safeRoots} />
    </div>
  );
}

function FlowBranch({
  node,
  isRoot = false,
  visited,
  depth,
}: {
  node: WorkflowState;
  isRoot?: boolean;
  visited: Set<string>;
  depth: number;
}) {
  const { state } = useWorkflow();
  const outgoing = state.transitions
    .filter((t) => t.fromStateId === node.id)
    .map((t) => state.states.find((s) => s.id === t.toStateId))
    .filter((s): s is WorkflowState => !!s);

  const nextVisited = new Set(visited);
  nextVisited.add(node.id);

  return (
    <div
      className={isRoot ? "" : "ml-4 border-l border-dashed border-muted-foreground/30 pl-4"}
    >
      <FlowNodeRow node={node} isRoot={isRoot} />

      {outgoing.length > 0 && (
        <div className="mt-2 space-y-2">
          {outgoing.map((child) => {
            const alreadyVisited = visited.has(child.id);
            if (alreadyVisited) {
              return <LoopBackRow key={child.id} target={child} />;
            }
            return (
              <FlowBranch
                key={child.id}
                node={child}
                visited={nextVisited}
                depth={depth + 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function FlowNodeRow({
  node,
  isRoot,
}: {
  node: WorkflowState;
  isRoot: boolean;
}) {
  const activeReqs = REQUIREMENT_ICONS.filter((r) => node[r.key]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isRoot && (
        <CornerDownRight
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
          aria-hidden="true"
        />
      )}
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: node.color }}
        aria-hidden="true"
      />
      <span className="text-sm font-medium">{node.label}</span>
      {node.isDefault && (
        <Badge
          variant="outline"
          className="border-primary/50 px-1.5 py-0 text-[10px] text-primary"
        >
          Inicial
        </Badge>
      )}
      {node.isTerminal && <TerminalPill systemState={node.systemState} />}
      {activeReqs.length > 0 && (
        <div
          className="flex items-center gap-1 text-muted-foreground"
          aria-label="Requerimientos"
        >
          {activeReqs.map((r) => (
            <r.icon
              key={r.key}
              className="h-3 w-3"
              aria-hidden="true"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TerminalPill({ systemState }: { systemState: SystemState }) {
  const Icon = TERMINAL_ICON[systemState];
  const label = TERMINAL_LABEL[systemState];
  const tone =
    systemState === "COMPLETED"
      ? "border-green-300 text-green-700 dark:border-green-800 dark:text-green-400"
      : systemState === "FAILED"
        ? "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400"
        : "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400";
  return (
    <Badge
      variant="outline"
      className={`gap-1 px-1.5 py-0 text-[10px] ${tone}`}
    >
      <Icon className="h-3 w-3" />
      final{label ? ` · ${label}` : ""}
    </Badge>
  );
}

function LoopBackRow({ target }: { target: WorkflowState }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <RotateCcw className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>vuelve a</span>
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: target.color }}
        aria-hidden="true"
      />
      <span className="font-medium text-foreground/80">{target.label}</span>
    </div>
  );
}

function LegendChip({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5">
      {children}
      {label}
    </span>
  );
}

/**
 * Warn when there are states that never appear in the tree — i.e. they're
 * not reachable from any root. Typical causes: orphan state after manual
 * deletion of transitions, or a leftover from an old template.
 */
function UnreachableNotice({ roots }: { roots: WorkflowState[] }) {
  const { state } = useWorkflow();
  const reached = new Set<string>();

  const visit = (id: string) => {
    if (reached.has(id)) return;
    reached.add(id);
    for (const t of state.transitions) {
      if (t.fromStateId === id) visit(t.toStateId);
    }
  };
  for (const r of roots) visit(r.id);

  const unreachable = state.states.filter((s) => !reached.has(s.id));
  if (unreachable.length === 0) return null;

  return (
    <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
      <p className="mb-2 font-medium">
        Estados sin camino desde el inicial ({unreachable.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {unreachable.map((s) => (
          <Badge
            key={s.id}
            variant="outline"
            className="gap-1.5 border-amber-300 bg-background font-normal dark:border-amber-800"
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
      <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
        Un pedido nunca va a llegar a estos estados con las transiciones
        actuales. Configura una transición desde un estado inicial en la
        pestaña «Editar».
      </p>
    </div>
  );
}
