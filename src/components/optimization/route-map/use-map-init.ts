"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import { getMapStyle } from "@/lib/map-styles";

/**
 * Reacts to theme changes by reapplying the map style.
 *
 * Uses a `mapThemeRef` to skip the initial render where the theme already
 * matches what was used to create the map (preventing a redundant style
 * diff on first paint).
 */
export function useMapThemeSync(
  map: RefObject<maplibregl.Map | null>,
  mapThemeRef: RefObject<boolean>,
  isDark: boolean,
  isLoading: boolean,
) {
  useEffect(() => {
    if (!map.current || isLoading) return;
    if (mapThemeRef.current === isDark) return;
    mapThemeRef.current = isDark;
    const style = getMapStyle(isDark);
    map.current.setStyle(
      {
        ...style,
        glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
      },
      { diff: false },
    );
  }, [isDark, isLoading, map, mapThemeRef]);
}
