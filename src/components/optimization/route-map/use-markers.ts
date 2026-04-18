"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Applies pencil-selection highlight styling to markers whose order ids are
 * in `highlightedOrderIds`. Resets styles when not highlighted.
 *
 * Mirrors the original effect exactly.
 */
export function useMarkerHighlight(
  map: RefObject<maplibregl.Map | null>,
  markersRef: RefObject<maplibregl.Marker[]>,
  highlightedOrderIds: string[],
) {
  useEffect(() => {
    if (!map.current) return;

    const highlightedSet = new Set(highlightedOrderIds);

    markersRef.current.forEach((marker) => {
      const el = marker.getElement();
      const orderIdsAttr = el.getAttribute("data-order-ids");
      const singleOrderId = el.getAttribute("data-order-id");
      const pin = el.querySelector(".pin-marker") as HTMLElement;

      if (!pin) return;

      // Check if any of this marker's orders are highlighted
      let isHighlighted = false;

      if (orderIdsAttr) {
        try {
          const orderIds = JSON.parse(orderIdsAttr) as string[];
          isHighlighted = orderIds.some((id) => highlightedSet.has(id));
        } catch {
          // Ignore parse errors
        }
      } else if (singleOrderId) {
        isHighlighted = highlightedSet.has(singleOrderId);
      }

      if (isHighlighted) {
        pin.style.transform = "scale(1.25)";
        pin.style.filter =
          "drop-shadow(0 0 8px #f59e0b) drop-shadow(0 0 4px #f59e0b)";
        pin.style.zIndex = "100";
      } else {
        // Always reset styles when not highlighted (including when selection is cleared)
        pin.style.transform = "";
        pin.style.filter = "";
        pin.style.zIndex = "";
      }
    });
  }, [highlightedOrderIds, map, markersRef]);
}
