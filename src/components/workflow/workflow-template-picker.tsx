"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  Loader2,
  Package,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/auth/can";
import { Card, CardContent } from "@/components/ui/card";
import { WorkflowStateDialog } from "./workflow-state-dialog";
import {
  WORKFLOW_TEMPLATES,
  useWorkflow,
  type TemplateType,
} from "./workflow-context";

const TEMPLATE_ICONS: Record<TemplateType, typeof Package> = {
  delivery: Truck,
  paqueteria: Package,
  b2b: Building2,
};

export function WorkflowTemplatePicker({
  hasExistingStates,
  existingCount,
  onCancel,
}: {
  hasExistingStates: boolean;
  existingCount: number;
  onCancel?: () => void;
}) {
  const { actions } = useWorkflow();
  const [applying, setApplying] = useState<TemplateType | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<TemplateType | null>(
    null,
  );
  const [blankDialogOpen, setBlankDialogOpen] = useState(false);

  const applyTemplate = async (type: TemplateType) => {
    setPendingTemplate(null);
    setApplying(type);
    try {
      await actions.createFromTemplate(type);
    } catch {
      // toast handled in context
    } finally {
      setApplying(null);
    }
  };

  const handlePick = (type: TemplateType) => {
    if (hasExistingStates) {
      setPendingTemplate(type);
    } else {
      applyTemplate(type);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 p-6">
      <div className="space-y-2 text-center">
        {onCancel && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X className="mr-1 h-4 w-4" />
              Volver
            </Button>
          </div>
        )}
        <h1 className="text-2xl font-semibold">
          Configura tu flujo de entregas
        </h1>
        <p className="text-muted-foreground">
          Elige una plantilla para empezar o crea tu propio flujo desde cero.
        </p>
        {hasExistingStates && (
          <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Aplicar una plantilla reemplazará los {existingCount} estados
            actuales.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(
          Object.entries(WORKFLOW_TEMPLATES) as [
            TemplateType,
            (typeof WORKFLOW_TEMPLATES)[TemplateType],
          ][]
        ).map(([type, template]) => {
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
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{template.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {template.description}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {template.states.map((s) => (
                    <div
                      key={s.code}
                      className="flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                        aria-hidden="true"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="truncate text-[11px] text-muted-foreground">
                  {[
                    ...template.states.filter((s) => !s.isTerminal).map(
                      (s) => s.label,
                    ),
                    template.states.find((s) => s.systemState === "COMPLETED")
                      ?.label,
                  ]
                    .filter(Boolean)
                    .join(" → ")}
                </div>

                <Can perm="company:update">
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={isDisabled}
                    onClick={() => handlePick(type)}
                  >
                    {isApplying ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Aplicando…
                      </>
                    ) : (
                      "Usar esta plantilla"
                    )}
                  </Button>
                </Can>
              </CardContent>
            </Card>
          );
        })}

        {/* Custom / blank card */}
        <Card
          className={`relative overflow-hidden border-dashed transition-all hover:shadow-md ${
            applying ? "opacity-50" : ""
          }`}
        >
          <CardContent className="flex h-full flex-col items-center justify-center space-y-4 p-5 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Personalizado</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Crea tu propio flujo desde cero
              </p>
            </div>
            <Can perm="company:update">
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={applying !== null}
                onClick={() => setBlankDialogOpen(true)}
              >
                Comenzar desde cero
              </Button>
            </Can>
          </CardContent>
        </Card>
      </div>

      <WorkflowStateDialog
        open={blankDialogOpen}
        onOpenChange={setBlankDialogOpen}
        editingState={null}
      />

      <AlertDialog
        open={pendingTemplate !== null}
        onOpenChange={(open) => !open && setPendingTemplate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reemplazar flujo existente</AlertDialogTitle>
            <AlertDialogDescription>
              Aplicar la plantilla{" "}
              <strong>
                {pendingTemplate && WORKFLOW_TEMPLATES[pendingTemplate].name}
              </strong>{" "}
              eliminará los {existingCount} estados actuales y todas sus
              transiciones. Los pedidos ya completados no se ven afectados, pero
              cualquier pedido en un estado intermedio podría perder su
              progreso visible. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                pendingTemplate && applyTemplate(pendingTemplate)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sí, reemplazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
