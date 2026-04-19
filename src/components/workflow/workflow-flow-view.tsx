"use client";

import { useMemo } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect } from "react";
import {
  Camera,
  CheckCircle2,
  FileSignature,
  MessageCircle,
  NotepadText,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SystemState, WorkflowState } from "./workflow-context";
import { useWorkflow } from "./workflow-context";

/**
 * Node-and-edge flow diagram of the workflow. Uses @xyflow/react for the
 * canvas + @dagrejs/dagre for automatic left-to-right layout.
 *
 * Read-only by design — the "Editar" tab hosts the chip editor for mutations.
 * Cycles are drawn as curved edges that loop back; terminal states get a
 * distinct pill so the planner can see final destinations at a glance.
 */

const NODE_WIDTH = 220;
const NODE_HEIGHT = 78;
const SYSTEM_STATE_LABELS: Record<SystemState, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En progreso",
  COMPLETED: "Completado",
  FAILED: "Fallido",
  CANCELLED: "Cancelado",
};
const REQUIREMENT_ICONS = [
  { key: "requiresPhoto" as const, icon: Camera, title: "Foto" },
  { key: "requiresSignature" as const, icon: FileSignature, title: "Firma" },
  { key: "requiresNotes" as const, icon: NotepadText, title: "Notas" },
  { key: "requiresReason" as const, icon: MessageCircle, title: "Motivo" },
];

type FlowNodeData = {
  state: WorkflowState;
};

const nodeTypes = {
  workflowState: WorkflowStateNode,
};

export function WorkflowFlowView() {
  const { state } = useWorkflow();

  if (state.states.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No hay estados configurados todavía.
      </p>
    );
  }

  return (
    <div className="h-[480px] w-full overflow-hidden rounded-md border bg-muted/10">
      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>
    </div>
  );
}

function FlowCanvas() {
  const { state } = useWorkflow();
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  const { nodes, edges } = useMemo(
    () => buildGraph(state.states, state.transitions),
    [state.states, state.transitions],
  );

  // Re-fit when dagre finishes measuring.
  useEffect(() => {
    if (nodesInitialized) {
      fitView({ padding: 0.15, duration: 300 });
    }
  }, [nodesInitialized, fitView, nodes.length, edges.length]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.4}
      maxZoom={1.5}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

/**
 * Run dagre with left-to-right rank direction and convert the result into
 * ReactFlow nodes + edges. Self-loops are dropped (dagre handles them poorly
 * and they add noise); every real cycle is rendered as a curved back-edge.
 */
function buildGraph(
  states: WorkflowState[],
  transitions: Array<{ id: string; fromStateId: string; toStateId: string }>,
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    nodesep: 36,
    ranksep: 64,
    marginx: 12,
    marginy: 12,
  });

  for (const s of states) {
    g.setNode(s.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  const seenEdges = new Set<string>();
  for (const t of transitions) {
    if (t.fromStateId === t.toStateId) continue; // skip self-loops
    const key = `${t.fromStateId}-${t.toStateId}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    g.setEdge(t.fromStateId, t.toStateId);
  }

  dagre.layout(g);

  const nodes: Node<FlowNodeData>[] = states.map((s) => {
    const pos = g.node(s.id);
    return {
      id: s.id,
      type: "workflowState",
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      data: { state: s },
      draggable: false,
    };
  });

  const edges: Edge[] = transitions
    .filter((t) => t.fromStateId !== t.toStateId)
    .map((t) => {
      // Back-edges: when `to` lands in a rank before `from`, style it as a
      // dashed return arrow so "vuelve a" is obvious.
      const fromRank = g.node(t.fromStateId)?.x ?? 0;
      const toRank = g.node(t.toStateId)?.x ?? 0;
      const isBack = toRank < fromRank;
      return {
        id: t.id,
        source: t.fromStateId,
        target: t.toStateId,
        type: "smoothstep",
        animated: false,
        style: isBack
          ? {
              stroke: "var(--muted-foreground)",
              strokeDasharray: "4 4",
              strokeOpacity: 0.6,
            }
          : { stroke: "var(--foreground)", strokeOpacity: 0.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 18,
          height: 18,
          color: isBack
            ? "var(--muted-foreground)"
            : "var(--foreground)",
        },
        label: isBack ? "vuelve" : undefined,
        labelStyle: {
          fontSize: 10,
          fill: "var(--muted-foreground)",
        },
        labelBgStyle: { fill: "var(--background)" },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
      };
    });

  return { nodes, edges };
}

function WorkflowStateNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const { state: s } = data;
  const activeReqs = REQUIREMENT_ICONS.filter((r) => s[r.key]);
  const terminalTone = s.isTerminal
    ? s.systemState === "COMPLETED"
      ? "border-green-300 dark:border-green-800"
      : s.systemState === "FAILED"
        ? "border-red-300 dark:border-red-800"
        : "border-amber-300 dark:border-amber-800"
    : s.isDefault
      ? "border-primary/60"
      : "border-border";

  return (
    <div
      className={`w-[220px] rounded-md border-2 bg-card shadow-sm ${terminalTone}`}
      style={{ height: NODE_HEIGHT }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-muted-foreground/40"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-muted-foreground/40"
      />

      <div className="flex items-center gap-2 px-3 pt-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: s.color }}
          aria-hidden="true"
        />
        <span className="truncate text-sm font-medium">{s.label}</span>
      </div>

      <div className="flex items-center gap-1.5 px-3 pb-2 pt-1.5">
        {s.isDefault && (
          <Badge
            variant="outline"
            className="border-primary/50 px-1 py-0 text-[9px] text-primary"
          >
            Inicial
          </Badge>
        )}
        {s.isTerminal && <TerminalPill systemState={s.systemState} />}
        {!s.isDefault && !s.isTerminal && (
          <span className="text-[10px] text-muted-foreground">
            {SYSTEM_STATE_LABELS[s.systemState]}
          </span>
        )}
        {activeReqs.length > 0 && (
          <div
            className="ml-auto flex items-center gap-0.5 text-muted-foreground"
            aria-label="Requerimientos"
          >
            {activeReqs.map((r) => (
              <r.icon key={r.key} className="h-3 w-3" aria-hidden="true" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TerminalPill({ systemState }: { systemState: SystemState }) {
  const isSuccess = systemState === "COMPLETED";
  const isFailure = systemState === "FAILED";
  const Icon = isSuccess ? CheckCircle2 : XCircle;
  const label = isSuccess ? "éxito" : isFailure ? "fallo" : "cancelado";
  const tone = isSuccess
    ? "border-green-300 text-green-700 dark:border-green-800 dark:text-green-400"
    : isFailure
      ? "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400"
      : "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400";
  return (
    <Badge variant="outline" className={`gap-1 px-1 py-0 text-[9px] ${tone}`}>
      <Icon className="h-2.5 w-2.5" />
      final · {label}
    </Badge>
  );
}
