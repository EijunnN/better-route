"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import { ROUTE_COLORS, UNSELECTED_COLOR } from "./constants";
import type { Route } from "./types";

/**
 * Updates route line-layer paint properties (color, opacity, width) and
 * marker dimming to reflect the currently selected route.
 *
 * Mirrors the original effect exactly: runs on every change of
 * `selectedRouteId` or `routes`.
 */
export function useRouteSelectionVisibility(
  map: RefObject<maplibregl.Map | null>,
  markersRef: RefObject<maplibregl.Marker[]>,
  routes: Route[],
  selectedRouteId: string | null | undefined,
) {
  // Note: `hasSelection` uses `!== null` (not `!= null`) to preserve original
  // behavior, where `undefined` is treated as "has selection". This matches
  // the inline effect before refactor.
  useEffect(() => {
    if (!map.current) return;

    routes.forEach((route, routeIndex) => {
      const layerId = `route-line-${route.routeId}`;
      const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];

      if (map.current?.getLayer(layerId)) {
        const isSelected = route.routeId === selectedRouteId;
        const hasSelection = selectedRouteId !== null;

        // Update line color and opacity based on selection
        map.current.setPaintProperty(
          layerId,
          "line-color",
          hasSelection && !isSelected ? UNSELECTED_COLOR : color,
        );
        map.current.setPaintProperty(
          layerId,
          "line-opacity",
          hasSelection && !isSelected ? 0.3 : 1,
        );
        map.current.setPaintProperty(
          layerId,
          "line-width",
          isSelected ? 5 : hasSelection ? 2 : 3,
        );
      }
    });

    // Update marker visibility
    markersRef.current.forEach((marker) => {
      const el = marker.getElement();
      const routeId = el.getAttribute("data-route-id");
      const hasSelection = selectedRouteId !== null;
      const isSelected = routeId === selectedRouteId;

      if (hasSelection && !isSelected) {
        el.style.opacity = "0.3";
        el.style.filter = "grayscale(100%)";
      } else {
        el.style.opacity = "1";
        el.style.filter = "none";
      }
    });
  }, [selectedRouteId, routes, map, markersRef]);
}
