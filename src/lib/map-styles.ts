import type { StyleSpecification } from "maplibre-gl";

// CartoDB Dark Matter, tinted toward the app's blue-tinted dark theme.
// The base tiles are near-neutral greyscale, so the obvious raster paint
// props (`raster-hue-rotate`, `raster-saturation`) are no-ops — no chroma
// to rotate or amplify. We instead paint a blue background layer under
// the tiles and drop `raster-opacity` so the colour bleeds through.
// Overlays (zones, markers, route lines) sit above the raster, fully
// opaque, so the tint never touches them.
const DARK_BG_TINT = "#0e1729"; // close to `--background` in dark mode
const DARK_RASTER_OPACITY = 0.65;

const DARK_MAP_STYLE: StyleSpecification = {
  version: 8 as const,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "&copy; CartoDB &copy; OpenStreetMap",
    },
  },
  layers: [
    {
      id: "tint-background",
      type: "background",
      paint: {
        "background-color": DARK_BG_TINT,
      },
    },
    {
      id: "carto",
      type: "raster",
      source: "carto",
      minzoom: 0,
      maxzoom: 20,
      paint: {
        "raster-opacity": DARK_RASTER_OPACITY,
      },
    },
  ],
};

// CartoDB Voyager - warm, modern light style (cream tones, muted labels)
const LIGHT_MAP_STYLE: StyleSpecification = {
  version: 8 as const,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "&copy; CartoDB &copy; OpenStreetMap",
    },
  },
  layers: [
    {
      id: "carto",
      type: "raster",
      source: "carto",
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

export function getMapStyle(isDark: boolean): StyleSpecification {
  return isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE;
}

// Default center (Lima, Peru)
export const DEFAULT_MAP_CENTER: [number, number] = [-77.0428, -12.0464];
export const DEFAULT_MAP_ZOOM = 11;
