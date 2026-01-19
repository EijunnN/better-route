"use client";

import * as turf from "@turf/turf";
import { Pencil, X } from "lucide-react";
import type maplibregl from "maplibre-gl";
import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useFreehandDraw } from "@/hooks/use-freehand-draw";

interface SelectableOrder {
  orderId: string;
  latitude: number;
  longitude: number;
}

interface PencilSelectOverlayProps {
  map: maplibregl.Map | null;
  isActive: boolean;
  onToggle: () => void;
  onSelectionComplete: (selectedOrderIds: string[]) => void;
  allOrders: SelectableOrder[];
}

export function PencilSelectOverlay({
  map,
  isActive,
  onToggle,
  onSelectionComplete,
  allOrders,
}: PencilSelectOverlayProps) {
  // Handle polygon completion - find orders inside the polygon
  const handlePolygonComplete = useCallback(
    (polygon: [number, number][]) => {
      if (polygon.length < 3) return;

      // Create a turf polygon (needs to be closed)
      const closedPolygon = [...polygon, polygon[0]];
      const turfPolygon = turf.polygon([closedPolygon]);

      // Find all orders inside the polygon
      const selectedIds: string[] = [];

      for (const order of allOrders) {
        const point = turf.point([order.longitude, order.latitude]);
        if (turf.booleanPointInPolygon(point, turfPolygon)) {
          selectedIds.push(order.orderId);
        }
      }

      // Notify parent with selected order IDs
      if (selectedIds.length > 0) {
        onSelectionComplete(selectedIds);
      }

      // Deactivate pencil mode after selection
      onToggle();
    },
    [allOrders, onSelectionComplete, onToggle],
  );

  // Use the freehand draw hook
  const { isDrawing } = useFreehandDraw({
    map,
    enabled: isActive,
    onPolygonComplete: handlePolygonComplete,
    strokeColor: "#f59e0b",
  });

  // Handle Escape key to cancel
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onToggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, onToggle]);

  return (
    <>
      {/* Pencil Mode Toggle Button */}
      <div className="absolute top-4 left-4 z-10">
        <Button
          variant={isActive ? "default" : "outline"}
          size="sm"
          onClick={onToggle}
          className={`
            shadow-lg transition-all
            ${
              isActive
                ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
                : "bg-background/95 backdrop-blur hover:bg-background"
            }
          `}
        >
          {isActive ? (
            <>
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </>
          ) : (
            <>
              <Pencil className="w-4 h-4 mr-2" />
              Seleccionar con lápiz
            </>
          )}
        </Button>
      </div>

      {/* Instructions when active */}
      {isActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <div className="bg-amber-500/90 backdrop-blur text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
            {isDrawing ? (
              <span className="animate-pulse">
                Dibujando... Cruza tu trazo para seleccionar
              </span>
            ) : (
              <span>
                Mantén presionado y dibuja un área. Al cruzar tu trazo se
                seleccionarán los pedidos.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Instruction hint at bottom */}
      {isActive && !isDrawing && (
        <div className="absolute bottom-4 left-4 z-10">
          <div className="bg-background/95 backdrop-blur px-3 py-2 rounded-lg shadow-lg text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono mr-1">
              Esc
            </kbd>
            para cancelar
          </div>
        </div>
      )}
    </>
  );
}
