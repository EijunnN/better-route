"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  Handle,
  MarkerType,
  type Node,
  type NodeChange,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Camera,
  CheckCircle2,
  Circle,
  Clock,
  FileSignature,
  MessageCircle,
  Pause,
  Play,
  Plus,
  NotepadText,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Can, useCan } from "@/components/auth/can";
import { WorkflowStateDialog } from "./workflow-state-dialog";
import type { SystemState, WorkflowState } from "./workflow-context";
import { useWorkflow } from "./workflow-context";

/**
 * Fully interactive canvas inspired by n8n's editor:
 *   - Drag from a handle to another node to create a transition.
 *   - Click a node to edit its configuration (opens the existing dialog).
 *   - Hover an edge to reveal a trash button — click to delete the transition.
 *   - "+" button on the canvas Panel adds a new state.
 *   - Delete / Backspace on a selected node or edge removes it (with confirm
 *     for nodes since deleting state cascades transitions).
 *
 * Read-only users see the same canvas but every mutation handler is gated
 * through useCan("company:update") and is a no-op when not allowed.
 */

const NODE_WIDTH = 160;
const NODE_HEIGHT = 120;

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
  canEdit: boolean;
};

type FlowEdgeData = {
  isBack: boolean;
  canEdit: boolean;
  onDelete?: () => void;
};

export function WorkflowFlowView() {
  const [editingState, setEditingState] = useState<WorkflowState | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <div className="h-[560px] w-full overflow-hidden rounded-md border bg-muted/10">
        <ReactFlowProvider>
          <FlowCanvas
            onEditState={setEditingState}
            onAddState={() => setAddOpen(true)}
          />
        </ReactFlowProvider>
      </div>

      {/* Edit dialog — opened by clicking a node */}
      <WorkflowStateDialog
        open={!!editingState}
        onOpenChange={(open) => !open && setEditingState(null)}
        editingState={editingState}
      />

      {/* Create dialog — opened by the + button on the canvas */}
      <WorkflowStateDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        editingState={null}
      />
    </>
  );
}

function FlowCanvas({
  onEditState,
  onAddState,
}: {
  onEditState: (s: WorkflowState) => void;
  onAddState: () => void;
}) {
  const { state, actions } = useWorkflow();
  const canEdit = useCan("company:update");
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  const handleDeleteTransition = useCallback(
    async (edgeId: string) => {
      if (!canEdit) return;
      try {
        await actions.deleteTransition(edgeId);
      } catch {
        // toast handled in context
      }
    },
    [canEdit, actions],
  );

  const { nodes, edges } = useMemo(
    () =>
      buildGraph(state.states, state.transitions, {
        canEdit,
        onDeleteTransition: handleDeleteTransition,
      }),
    [state.states, state.transitions, canEdit, handleDeleteTransition],
  );

  // Re-fit the viewport once dagre finishes measuring so the full graph
  // fills the canvas on first render and after big changes.
  useEffect(() => {
    if (nodesInitialized) {
      fitView({ padding: 0.15, duration: 300 });
    }
  }, [nodesInitialized, fitView, nodes.length, edges.length]);

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!canEdit || !connection.source || !connection.target) return;
      if (connection.source === connection.target) return;

      // Block new transitions out of terminal states — same rule the
      // per-state chip editor enforced; the API also rejects them, but
      // catching it early avoids a needless 400.
      const fromState = state.states.find((s) => s.id === connection.source);
      if (fromState?.isTerminal) return;

      // Duplicate?
      const exists = state.transitions.some(
        (t) =>
          t.fromStateId === connection.source &&
          t.toStateId === connection.target,
      );
      if (exists) return;

      try {
        await actions.createTransition(connection.source, connection.target);
      } catch {
        // toast handled in context
      }
    },
    [canEdit, state.states, state.transitions, actions],
  );

  // Node clicks open the edit dialog. We intercept here rather than via
  // React Flow's selection because double-click would conflict with
  // panning and we want a single-click UX.
  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      const s = state.states.find((x) => x.id === node.id);
      if (s) onEditState(s);
    },
    [state.states, onEditState],
  );

  // Delete via keyboard. React Flow calls onNodesChange/onEdgesChange
  // with { type: "remove" } entries when the user hits Delete/Backspace
  // on a selected element.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!canEdit) return;
      for (const change of changes) {
        if (change.type === "remove") {
          const s = state.states.find((x) => x.id === change.id);
          if (!s) continue;
          if (
            confirm(`¿Eliminar el estado "${s.label}" y sus transiciones?`)
          ) {
            void actions.deleteState(change.id);
          }
        }
      }
    },
    [canEdit, state.states, actions],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (!canEdit) return;
      for (const change of changes) {
        if (change.type === "remove") {
          void actions.deleteTransition(change.id);
        }
      }
    },
    [canEdit, actions],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodesDraggable={false}
      nodesConnectable={canEdit}
      edgesFocusable={canEdit}
      elementsSelectable={canEdit}
      deleteKeyCode={canEdit ? ["Delete", "Backspace"] : null}
      proOptions={{ hideAttribution: true }}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.4}
      maxZoom={1.5}
      connectionLineStyle={{
        stroke: "var(--primary)",
        strokeWidth: 2,
      }}
      defaultEdgeOptions={{
        type: "workflow",
      }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      <Controls showInteractive={false} />
      <Can perm="company:update">
        <Panel position="top-right" className="!m-3">
          <Button size="sm" onClick={onAddState}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Agregar estado
          </Button>
        </Panel>
      </Can>
    </ReactFlow>
  );
}

/**
 * Dagre-driven layered layout + ReactFlow node/edge conversion. Self-loops
 * are dropped at this step — dagre draws them poorly and they're
 * informational noise.
 */
function buildGraph(
  states: WorkflowState[],
  transitions: Array<{ id: string; fromStateId: string; toStateId: string }>,
  { canEdit, onDeleteTransition }: {
    canEdit: boolean;
    onDeleteTransition: (id: string) => void;
  },
): { nodes: Node<FlowNodeData>[]; edges: Edge<FlowEdgeData>[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    nodesep: 40,
    ranksep: 80,
    marginx: 16,
    marginy: 16,
  });

  for (const s of states) {
    g.setNode(s.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  const seenEdges = new Set<string>();
  for (const t of transitions) {
    if (t.fromStateId === t.toStateId) continue;
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
      data: { state: s, canEdit },
      draggable: false,
    };
  });

  const edges: Edge<FlowEdgeData>[] = transitions
    .filter((t) => t.fromStateId !== t.toStateId)
    .map((t) => {
      const fromRank = g.node(t.fromStateId)?.x ?? 0;
      const toRank = g.node(t.toStateId)?.x ?? 0;
      const isBack = toRank < fromRank;
      return {
        id: t.id,
        source: t.fromStateId,
        target: t.toStateId,
        type: "workflow",
        data: {
          isBack,
          canEdit,
          onDelete: () => onDeleteTransition(t.id),
        },
      };
    });

  return { nodes, edges };
}

const nodeTypes = {
  workflowState: WorkflowStateNode,
};

const edgeTypes = {
  workflow: WorkflowEdge,
};

function WorkflowStateNode({
  data,
  selected,
}: NodeProps<Node<FlowNodeData>>) {
  const { state: s, canEdit } = data;
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

  const selectedClass = selected ? "ring-2 ring-primary" : "";

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
    <div className="group flex flex-col items-center gap-1.5 text-center">
      {/* Target handle on the left: where incoming transitions land */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={canEdit && !s.isDefault}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary transition-transform group-hover:scale-125"
        style={{ left: -6 }}
      />
      {/* Source handle on the right: drag from here to another node */}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={canEdit && !s.isTerminal}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary transition-transform group-hover:scale-125"
        style={{ right: -6 }}
      />

      <div
        className={`relative flex h-[72px] w-[72px] items-center justify-center rounded-xl bg-card shadow-sm transition-shadow ${ringClass} ${selectedClass} ${canEdit ? "cursor-pointer hover:shadow-md" : ""}`}
        style={{
          boxShadow: `inset 0 0 0 9999px ${hexToRgba(s.color, 0.12)}`,
        }}
      >
        <Icon
          className="h-9 w-9"
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
 * Edge with an inline delete button that appears centered on the path when
 * the user hovers the edge. Bezier curve to match n8n's editor.
 */
function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<Edge<FlowEdgeData>>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isBack = data?.isBack ?? false;
  const canEdit = data?.canEdit ?? false;

  return (
    <>
      {/* Invisible wide hit area — makes hover easier without rendering a
          thick visible line. */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        className="react-flow__edge-interaction"
      />
      {/* Visible path */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        strokeWidth={selected ? 2.5 : 1.75}
        stroke={
          selected
            ? "var(--primary)"
            : isBack
              ? "var(--muted-foreground)"
              : "var(--foreground)"
        }
        strokeOpacity={selected ? 1 : isBack ? 0.55 : 0.6}
        strokeDasharray={isBack ? "5 4" : undefined}
        markerEnd={`url(#${selected ? "arrow-selected" : isBack ? "arrow-back" : "arrow"})`}
      />

      {/* Arrow markers — defined inline per edge since React Flow doesn't
          expose a <defs> slot. Using separate marker IDs means each edge
          references the right colour without paintbleed. */}
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 16 16"
          refX="10"
          refY="8"
          markerWidth="14"
          markerHeight="14"
          orient="auto"
        >
          <path
            d="M 0 2 L 10 8 L 0 14 z"
            fill="var(--foreground)"
            fillOpacity="0.6"
          />
        </marker>
        <marker
          id="arrow-back"
          viewBox="0 0 16 16"
          refX="10"
          refY="8"
          markerWidth="14"
          markerHeight="14"
          orient="auto"
        >
          <path
            d="M 0 2 L 10 8 L 0 14 z"
            fill="var(--muted-foreground)"
            fillOpacity="0.55"
          />
        </marker>
        <marker
          id="arrow-selected"
          viewBox="0 0 16 16"
          refX="10"
          refY="8"
          markerWidth="14"
          markerHeight="14"
          orient="auto"
        >
          <path d="M 0 2 L 10 8 L 0 14 z" fill="var(--primary)" />
        </marker>
      </defs>

      {canEdit && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan opacity-0 transition-opacity hover:opacity-100"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data?.onDelete?.();
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full border bg-background text-destructive shadow hover:bg-destructive hover:text-destructive-foreground"
              aria-label="Eliminar transición"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/** Hex -> rgba helper for the tinted node background. */
function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return `rgba(128,128,128,${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* Hover-reveal the delete button whenever the mouse enters the interaction
   strip. We target React Flow's generated edge group: any descendant with
   .react-flow__edge-interaction gets hovered → show its sibling button. */
const edgeHoverCSS = `
  .react-flow__edge:hover .react-flow__edge-interaction + * [aria-label="Eliminar transición"],
  .react-flow__edge.selected [aria-label="Eliminar transición"] {
    opacity: 1;
  }
`;
if (typeof document !== "undefined" && !document.getElementById("workflow-edge-hover")) {
  const style = document.createElement("style");
  style.id = "workflow-edge-hover";
  style.innerHTML = edgeHoverCSS;
  document.head.appendChild(style);
}
