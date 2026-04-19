"use client";

import { Download, Loader2, RotateCcw, Save, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can, useCan } from "@/components/auth/can";
import { CapacityDimensionsCard } from "./capacity-dimensions-card";
import { PrioritySlidersSection } from "./priority-sliders-section";
import { TrackingSettingsSection } from "./tracking-settings-section";
import { useConfiguracion } from "./configuracion-context";

export function ConfiguracionView() {
  const { state, actions } = useConfiguracion();
  const canEdit = useCan("company:update");
  const dirtyCount = state.dirty.size;

  if (state.isLoading && !state.profile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Sticky header. Single save for both sections — honours dirty set. */}
      <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <Settings className="h-5 w-5" />
              Configuración de la empresa
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Dimensiones de capacidad, prioridades y seguimiento público.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {dirtyCount > 0 && (
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              >
                {dirtyCount} cambio{dirtyCount === 1 ? "" : "s"} sin guardar
              </Badge>
            )}
            <Can perm="company:update">
              <Button
                variant="outline"
                size="sm"
                onClick={actions.downloadCsvTemplate}
                title="Descarga la plantilla CSV con los campos configurados"
              >
                <Download className="h-4 w-4 mr-2" />
                Plantilla CSV
              </Button>
            </Can>
            <Can perm="company:update">
              <Button
                onClick={actions.saveAll}
                disabled={state.isSaving || dirtyCount === 0}
                size="sm"
              >
                {state.isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Guardar cambios
              </Button>
            </Can>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
        {!canEdit && (
          <div className="rounded-md border border-muted-foreground/20 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Estás en modo lectura. Necesitas el permiso{" "}
            <code className="text-xs">company:update</code> para modificar esta
            página.
          </div>
        )}

        <fieldset disabled={!canEdit} className="space-y-6 disabled:opacity-60">
          <CapacityDimensionsCard />
          <PrioritySlidersSection />
          <TrackingSettingsSection />
        </fieldset>

        {!state.isDefault && canEdit && (
          <div className="flex justify-end pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={actions.resetProfile}
              className="text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Restablecer perfil a valores predeterminados
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
