"use client";

import {
  Eraser,
  MousePointer2,
  Pencil,
  PenTool,
  Trash2,
  Undo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DrawMode } from "./types";

interface ToolbarProps {
  drawMode: DrawMode;
  pointsCount: number;
  freehandPathCount: number;
  onSwitchMode: (mode: DrawMode) => void;
  onUndo: () => void;
  onClear: () => void;
}

export function Toolbar({
  drawMode,
  pointsCount,
  freehandPathCount,
  onSwitchMode,
  onUndo,
  onClear,
}: ToolbarProps) {
  return (
    <div className="absolute top-4 left-4 z-10 flex gap-1 bg-background/95 backdrop-blur-sm p-2 rounded-lg shadow-lg border">
      <Button
        variant={drawMode === "select" ? "default" : "ghost"}
        size="sm"
        onClick={() => onSwitchMode("select")}
        title="Seleccionar"
        className="h-9 w-9 p-0"
      >
        <MousePointer2 className="h-4 w-4" />
      </Button>
      <Button
        variant={drawMode === "draw" ? "default" : "ghost"}
        size="sm"
        onClick={() => onSwitchMode("draw")}
        title="Dibujar puntos"
        className="h-9 w-9 p-0"
      >
        <PenTool className="h-4 w-4" />
      </Button>
      <Button
        variant={drawMode === "freehand" ? "default" : "ghost"}
        size="sm"
        onClick={() => onSwitchMode("freehand")}
        title="Dibujo libre (lapiz)"
        className="h-9 w-9 p-0"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant={drawMode === "delete" ? "default" : "ghost"}
        size="sm"
        onClick={() => onSwitchMode("delete")}
        title="Eliminar punto"
        className="h-9 w-9 p-0"
      >
        <Eraser className="h-4 w-4" />
      </Button>
      <div className="w-px bg-border mx-1" />
      <Button
        variant="ghost"
        size="sm"
        onClick={onUndo}
        disabled={pointsCount === 0}
        title="Deshacer"
        className="h-9 w-9 p-0"
      >
        <Undo className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        disabled={pointsCount === 0 && freehandPathCount === 0}
        title="Limpiar todo"
        className="h-9 w-9 p-0"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface InstructionsProps {
  drawMode: DrawMode;
  isPolygonClosed: boolean;
  isDrawingFreehand: boolean;
  pointsCount: number;
}

export function Instructions({
  drawMode,
  isPolygonClosed,
  isDrawingFreehand,
  pointsCount,
}: InstructionsProps) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-background/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border text-sm max-w-md text-center">
      {drawMode === "draw" && !isPolygonClosed && (
        <span>
          <strong>Modo Puntos:</strong> Clic para agregar puntos.
          {pointsCount >= 3 && (
            <span className="text-green-500">
              {" "}
              Clic en el punto verde para cerrar.
            </span>
          )}
        </span>
      )}
      {drawMode === "freehand" && !isPolygonClosed && !isDrawingFreehand && (
        <span>
          <strong>Modo Lapiz:</strong> Manten presionado y dibuja. Cuando
          cruces tu trazo, se cerrara la zona automaticamente.
        </span>
      )}
      {drawMode === "freehand" && isDrawingFreehand && (
        <span className="text-amber-500 font-medium">
          Dibujando... Cruza tu trazo para cerrar la zona
        </span>
      )}
      {drawMode === "delete" && (
        <span>
          <strong>Modo Borrar:</strong> Clic en un punto para eliminarlo.
        </span>
      )}
      {drawMode === "select" && (
        <span>
          {isPolygonClosed
            ? "Arrastra los puntos para ajustar la forma. Los puntos pequenos agregan nuevos vertices."
            : "Selecciona una herramienta para empezar a dibujar."}
        </span>
      )}
    </div>
  );
}

interface StatusBarProps {
  pointsCount: number;
  isPolygonClosed: boolean;
}

export function StatusBar({ pointsCount, isPolygonClosed }: StatusBarProps) {
  return (
    <div className="absolute bottom-4 left-4 z-10 bg-background/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg border text-sm flex items-center gap-3">
      <span>
        <span className="font-semibold">{pointsCount}</span> puntos
      </span>
      {isPolygonClosed && (
        <span className="text-green-500 font-medium flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Cerrado
        </span>
      )}
    </div>
  );
}

interface ActionButtonsProps {
  onCancel: () => void;
  onSave: () => void;
  saveDisabled: boolean;
}

export function ActionButtons({
  onCancel,
  onSave,
  saveDisabled,
}: ActionButtonsProps) {
  return (
    <div className="absolute bottom-4 right-4 z-10 flex gap-2">
      <Button variant="outline" onClick={onCancel} className="shadow-lg">
        Cancelar
      </Button>
      <Button onClick={onSave} disabled={saveDisabled} className="shadow-lg">
        Guardar Zona
      </Button>
    </div>
  );
}

export function LoadingOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20 rounded-lg">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Cargando mapa...</p>
      </div>
    </div>
  );
}
