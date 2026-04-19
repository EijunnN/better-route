"use client";

import { useState } from "react";
import { GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkflowFlowView } from "./workflow-flow-view";
import { WorkflowTransitionsEditor } from "./workflow-transitions-editor";
import { useWorkflow } from "./workflow-context";

/**
 * Composite panel with two tabs:
 *   - "Flujo"   — read-only depth-first tree. Answers "what happens to an
 *                 order after it's created?". This is the default tab.
 *   - "Editar"  — per-state chip toggles. Opened when the planner wants to
 *                 add/remove transitions.
 *
 * The read-only view separates "understanding" from "configuring", which
 * fixes the feedback that the previous editor-only card "didn't tell you
 * anything about the actual flow".
 */
export function WorkflowTransitionsPanel() {
  const { state } = useWorkflow();
  const [tab, setTab] = useState<"flujo" | "editar">("flujo");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4" />
            Flujo del pedido
          </CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            {state.transitions.length} transicion
            {state.transitions.length === 1 ? "" : "es"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="mb-4">
            <TabsTrigger value="flujo">Flujo</TabsTrigger>
            <TabsTrigger value="editar">Editar</TabsTrigger>
          </TabsList>
          <TabsContent value="flujo">
            <WorkflowFlowView />
          </TabsContent>
          <TabsContent value="editar">
            <WorkflowTransitionsEditor />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
