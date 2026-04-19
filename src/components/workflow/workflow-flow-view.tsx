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
  Circle,
  Clock,
  FileSignature,
  MessageCircle,
  NotepadText,
  Pause,
  Play,
  XCircle,
} from "lucide-react";
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

// Compact node — roughly the n8n dimensions: a 72×72 badge for the
// semantic icon, label underneath, optional requirement icons at the
// bottom. NODE_WIDTH/HEIGHT drive dagre's layout.
const NODE_WIDTH = 148;
const NODE_HEIGHT = 140;

const SYSTEM_STATE_ICONS: Record<SystemState, typeof Circle> = {
  PENDING: Clock,
  IN_PROGRESS: Play,
  COMPLETED: CheckCircle2,
  FAILED: XCircle,
  CANCELLED: Pause,
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
      // Back-edges (cycles) are drawn dashed; the direction of the arrow
      // already communicates "this goes back". No text label — labels on
      // edges add noise and were confusing.
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
              strokeDasharray: "5 4",
              strokeOpacity: 0.55,
              strokeWidth: 1.5,
            }
          : {
              stroke: "var(--foreground)",
              strokeOpacity: 0.55,
              strokeWidth: 1.5,
            },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: isBack
            ? "var(--muted-foreground)"
            : "var(--foreground)",
        },
      };
    });

  return { nodes, edges };
}

/**
 * n8n-style node: a 72×72 square badge with the system-state icon on a
 * brand-coloured background, followed by the state label outside of the
 * badge (like n8n shows the node-type name below its icon). Handles
 * render as small dots on the left/right edges so it's obvious where
 * edges attach.
 */
function WorkflowStateNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const { state: s } = data;
  const Icon = SYSTEM_STATE_ICONS[s.systemState];
  const activeReqs = REQUIREMENT_ICONS.filter((r) => s[r.key]);

  const ringClass = s.isTerminal
    ? s.systemState === "COMPLETED"
      ? "ring-2 ring-green-400/70 dark:ring-green-600/70"
      : s.systemState === "FAILED"
        ? "ring-2 ring-red-400/70 dark:ring-red-600/70"
        : "ring-2 ring-amber-400/70 dark:ring-amber-600/70"
    : s.isDefault
      ? "ring-2 ring-primary/60"
      : "ring-1 ring-border";

  const badgeLabel = s.isDefault
    ? "Inicial"
    : s.isTerminal
      ? s.systemState === "COMPLETED"
        ? "Éxito"
        : s.systemState === "FAILED"
          ? "Fallo"
          : "Cancelado"
      : null;
  const badgeTone = s.isTerminal
    ? s.systemState === "COMPLETED"
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
      : s.systemState === "FAILED"
        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
    : "bg-primary/10 text-primary";

  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <div
        className={`relative flex h-[72px] w-[72px] items-center justify-center rounded-xl bg-card shadow-sm ${ringClass}`}
        style={{
          boxShadow: `inset 0 0 0 9999px ${hexToRgba(s.color, 0.12)}`,
        }}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-2 !border-background !bg-foreground/40"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border-2 !border-background !bg-foreground/40"
        />
        <Icon
          className="h-8 w-8"
          style={{ color: s.color }}
          aria-hidden="true"
        />
        {activeReqs.length > 0 && (
          <div
            className="absolute -right-1 -top-1 flex items-center gap-0.5 rounded-full border bg-background px-1 py-0.5 shadow-sm"
            aria-label={`Requerimientos: ${activeReqs.map((r) => r.title).join(", ")}`}
          >
            {activeReqs.map((r) => (
              <r.icon
                key={r.key}
                className="h-2.5 w-2.5 text-muted-foreground"
                aria-hidden="true"
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex max-w-[140px] flex-col items-center gap-0.5">
        <span className="truncate text-xs font-semibold leading-tight">
          {s.label}
        </span>
        {badgeLabel && (
          <span
            className={`rounded-full px-1.5 py-0 text-[9px] font-medium ${badgeTone}`}
          >
            {badgeLabel}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Tiny helper to tint the node background with the state's color at low
 * opacity. We avoid doing this via Tailwind because the color comes from
 * the DB (per-company configurable) and we need real colour values.
 */
function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return `rgba(128,128,128,${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
