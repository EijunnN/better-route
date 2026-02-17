"use client";

import { Loader2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { usePlanificacion } from "./planificacion-context";

export function CsvUploadDialog() {
  const { state, actions } = usePlanificacion();

  return (
    <Dialog open={state.showCsvUpload} onOpenChange={actions.setShowCsvUpload}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Subir pedidos desde CSV</DialogTitle>
          <DialogDescription className="space-y-1">
            <span className="block">
              Headers requeridos:{" "}
              <span className="font-mono text-xs">
                trackcode, nombre_cliente, direccion, referencia, departamento, provincia,
                distrito, latitud, longitud, telefono
                {state.companyProfile?.enableOrderValue && ", valorizado"}
                {state.companyProfile?.enableWeight && ", peso"}
                {state.companyProfile?.enableVolume && ", volumen"}
                {state.companyProfile?.enableUnits && ", unidades"}
                {state.companyProfile?.enableOrderType && ", tipo_pedido"}
              </span>
            </span>
            <span className="block text-muted-foreground text-xs">
              * referencia y telefono: header requerido, datos opcionales
              {state.companyProfile?.enableOrderType && ". prioridad: opcional (0-100)"}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* File input */}
          <div className="space-y-2">
            <Label htmlFor="csv-file">Archivo CSV</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={actions.handleCsvFileChange}
            />
          </div>

          {/* Error message */}
          {state.csvError && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm whitespace-pre-wrap">
              {state.csvError}
            </div>
          )}

          {/* Custom field mappings indicator */}
          {state.csvCustomFieldMappings.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Campos personalizados detectados</Label>
              <div className="flex flex-wrap gap-1.5">
                {state.csvCustomFieldMappings.map((m) => (
                  <Badge key={m.code} variant="secondary" className="text-xs">
                    {m.csvHeader} → {m.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          {state.csvPreview.length > 0 && (
            <div className="space-y-2">
              <Label>Vista previa ({state.csvPreview.length} filas)</Label>
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[300px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-left font-medium">Trackcode</th>
                        <th className="px-2 py-2 text-left font-medium">Cliente</th>
                        <th className="px-2 py-2 text-left font-medium">Dirección</th>
                        <th className="px-2 py-2 text-left font-medium">Distrito</th>
                        <th className="px-2 py-2 text-left font-medium">Coords</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.csvPreview.slice(0, 10).map((row, index) => (
                        <tr key={index} className="border-t">
                          <td className="px-2 py-1.5 font-mono text-xs">{row.trackcode}</td>
                          <td className="px-2 py-1.5 truncate max-w-[120px] text-xs">
                            {row.nombre_cliente || (
                              <span className="text-muted-foreground">-</span>
                            )}
                            {row.telefono && (
                              <span className="block text-muted-foreground">{row.telefono}</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 truncate max-w-[150px]">{row.direccion}</td>
                          <td className="px-2 py-1.5">{row.distrito}</td>
                          <td className="px-2 py-1.5 text-xs text-muted-foreground">
                            {row.latitud && row.longitud ? (
                              <span className="text-green-600">OK</span>
                            ) : (
                              <span className="text-orange-600">Sin coords</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {state.csvPreview.length > 10 && (
                  <div className="px-2 py-1.5 bg-muted text-xs text-muted-foreground text-center">
                    Y {state.csvPreview.length - 10} filas más...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={actions.resetCsvState}>
            Cancelar
          </Button>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
