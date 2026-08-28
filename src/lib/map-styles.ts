// Basemap: OpenFreeMap (vectorial, sin API key). CARTO dejó de servir tiles
// anónimos —`basemaps.cartocdn.com` devuelve 400 y estampa "API KEY REQUIRED"
// sobre cada tile—, así que ya no sirve como fuente pública.
//
// Los style.json viven en `public/map-styles/` en vez de consumirse desde
// tiles.openfreemap.org: la copia local es la que lleva el tinte azul del tema
// (el estilo upstream es gris neutro sobre negro). Los sprites, glyphs y tiles
// siguen siendo URLs absolutas al CDN de OpenFreeMap; lo local es solo la
// hoja de estilo. Para actualizarla, volver a bajar el estilo y re-aplicar el
// tinte —el archivo declara el hue usado en `metadata`.
const DARK_MAP_STYLE = "/map-styles/ofm-dark.json";
const LIGHT_MAP_STYLE = "/map-styles/ofm-positron.json";

export function getMapStyle(isDark: boolean): string {
  return isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE;
}

// Default center (Lima, Peru)
export const DEFAULT_MAP_CENTER: [number, number] = [-77.0428, -12.0464];
export const DEFAULT_MAP_ZOOM = 11;
