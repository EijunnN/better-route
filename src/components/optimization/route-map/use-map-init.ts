"use client";

import type { RefObject } from "react";
import { useEffect } from "react";
import { getMapStyle } from "@/lib/map-styles";

/**
 * Reacts to theme changes by reapplying the map style.
 *
 * Uses a `mapThemeRef` to skip the initial render where the theme already
 * matches what was used to create the map (preventing a redundant style
 * diff on first paint).
 *
 * setStyle conserva los markers DOM pero borra las sources/layers custom;
 * `onStyleReloaded` se invoca cuando el nuevo estilo termina de cargar para
 * que el caller pueda re-añadirlas.
 */
export function useMapThemeSync(
  map: RefObject<maplibregl.Map | null>,
  mapThemeRef: RefObject<boolean>,
  isDark: boolean,
  isLoading: boolean,
  onStyleReloaded?: () => void,
) {
  useEffect(() => {
    if (!map.current || isLoading) return;
    if (mapThemeRef.current === isDark) return;
    mapThemeRef.current = isDark;
    const style = getMapStyle(isDark);
    if (onStyleReloaded) {
      map.current.once("style.load", onStyleReloaded);
    }
    map.current.setStyle(
      {
        ...style,
        glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
      },
      { diff: false },
    );
  }, [isDark, isLoading, map, mapThemeRef, onStyleReloaded]);
}
