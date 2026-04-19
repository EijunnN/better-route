"use client";

import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/auth/can";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CsvSchemaGuide } from "@/components/orders/csv-schema-guide";
import { usePlanificacion } from "./planificacion-context";

export function CsvUploadDialog() {
  const { state, actions, meta } = usePlanificacion();

  return (
    <Dialog open={state.showCsvUpload} onOpenChange={actions.setShowCsvUpload}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Subir pedidos desde CSV</DialogTitle>
          <DialogDescription>
            Revisa el esquema esperado antes de subir el archivo. Las columnas
            se validan en vivo al seleccionar el CSV.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Schema preview (required + optional + custom fields, plus live
              header validation when a file is picked). */}
          {meta.companyId && (
            <CsvSchemaGuide
              companyId={meta.companyId}
              csvHeaders={state.csvHeaders.length > 0 ? state.csvHeaders : undefined}
            />
          )}

          {/* File input */}
          <div className="space-y-2">
            <Label htmlFor="csv-file">Archivo CSV</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={actions.handleCsvFileChange}
              className="border border-input rounded-md bg-background px-3 py-2 file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm file:font-medium hover:border-ring focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 cursor-pointer"
            />
          </div>

          {/* Error message */}
          {state.csvError && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm whitespace-pre-wrap">
              {state.csvError}
            </div>
          )}

          {/* Row-count summary. Detailed per-column validation lives in the
              CsvSchemaGuide above — no second preview table needed. */}
          {state.csvPreview.length > 0 && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              Se detectaron <span className="font-medium">{state.csvPreview.length}</span>{" "}
              fila{state.csvPreview.length === 1 ? "" : "s"} de datos. La validación
              completa se ejecuta al subir.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={actions.resetCsvState}>
            Cancelar
          </Button>
          <Can perm="order:import">
            <Button
              onClick={actions.handleCsvUpload}
              disabled={state.csvUploading || state.csvPreview.length === 0}
            >
              {state.csvUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Subir {state.csvPreview.length} pedidos
                </>
              )}
            </Button>
          </Can>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditOrderDialog() {
  const { state, actions } = usePlanificacion();

  return (
    <Dialog open={!!state.editingOrder} onOpenChange={(open) => !open && actions.closeEditOrder()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar ubicación del pedido</DialogTitle>
          <DialogDescription>
            {state.editingOrder?.trackingId} - {state.editingOrder?.customerName || "Sin nombre"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="edit-address">Dirección</Label>
            <Input
              id="edit-address"
              value={state.editOrderData.address}
              onChange={(e) =>
                actions.setEditOrderData({
                  ...state.editOrderData,
                  address: e.target.value,
                })
              }
              placeholder="Ingresa la dirección completa"
            />
          </div>

          {/* Coordinates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-latitude">Latitud</Label>
              <Input
                id="edit-latitude"
                value={state.editOrderData.latitude}
                onChange={(e) =>
                  actions.setEditOrderData({
                    ...state.editOrderData,
                    latitude: e.target.value,
                  })
                }
                placeholder="-12.0464"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-longitude">Longitud</Label>
              <Input
                id="edit-longitude"
                value={state.editOrderData.longitude}
                onChange={(e) =>
                  actions.setEditOrderData({
                    ...state.editOrderData,
                    longitude: e.target.value,
                  })
                }
                placeholder="-77.0428"
              />
            </div>
          </div>

          {/* Coordinates hint */}
          <p className="text-xs text-muted-foreground">
            Puedes obtener las coordenadas desde Google Maps haciendo clic derecho en el punto y
            copiando las coordenadas.
          </p>

          {/* Error message */}
          {state.updateOrderError && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              {state.updateOrderError}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={actions.closeEditOrder}
            disabled={state.isUpdatingOrder}
          >
            Cancelar
          </Button>
          <Can perm="order:update">
            <Button
              onClick={actions.saveOrderChanges}
              disabled={state.isUpdatingOrder || !state.editOrderData.address}
            >
              {state.isUpdatingOrder ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar cambios"
              )}
            </Button>
          </Can>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
