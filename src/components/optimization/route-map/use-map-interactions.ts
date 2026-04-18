"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import type { Zone } from "./types";

/**
 * Renders zones as polygon (fill + outline) layers on top of the map,
 * wired with popups and cursor changes. Rebuilds layers whenever
 * `zones` or `isLoading` changes.
 */
export function useZoneLayers(
  map: RefObject<maplibregl.Map | null>,
  zones: Zone[],
  isLoading: boolean,
) {
  useEffect(() => {
    if (!map.current || isLoading) return;

    // Remove existing zone layers and sources
    const style = map.current.getStyle();
    if (style?.layers) {
      style.layers.forEach((layer) => {
        if (layer.id.startsWith("zone-")) {
          if (map.current?.getLayer(layer.id)) {
            map.current.removeLayer(layer.id);
          }
        }
      });
    }
    if (style?.sources) {
      Object.keys(style.sources).forEach((sourceId) => {
        if (sourceId.startsWith("zone-source-")) {
          if (map.current?.getSource(sourceId)) {
            map.current.removeSource(sourceId);
          }
        }
      });
    }

    // Add zone layers
    zones.forEach((zone, index) => {
      if (!zone.geometry || !map.current) return;

      const sourceId = `zone-source-${index}`;
      const fillLayerId = `zone-fill-${index}`;
      const outlineLayerId = `zone-outline-${index}`;
      const color = zone.color || "#3B82F6";

      // Add source
      map.current.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {
            name: zone.name,
            vehicleCount: zone.vehicleCount,
            vehicles: zone.vehicles
              .map((v) => v.plate || "Sin placa")
              .join(", "),
          },
          geometry: zone.geometry as GeoJSON.Geometry,
        },
      });

      // Add fill layer (semi-transparent)
      map.current.addLayer({
        id: fillLayerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": color,
          "fill-opacity": 0.15,
        },
      });

      // Add outline layer
      map.current.addLayer({
        id: outlineLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": color,
          "line-width": 2,
          "line-opacity": 0.8,
        },
      });

      // Add click handler for zone popup (dynamically import maplibregl for popup)
      map.current.on("click", fillLayerId, async (e) => {
        if (!map.current || !e.features?.[0]) return;

        const maplibreglModule = await import("maplibre-gl");
        const props = e.features[0].properties;
        const coordinates = e.lngLat;

        new maplibreglModule.Popup({
          closeButton: true,
          offset: 10,
          className: "dark-popup",
        })
          .setLngLat(coordinates)
          .setHTML(`
            <div style="background: #1a1a2e; color: #eee; padding: 10px 14px; border-radius: 8px; min-width: 160px;">
              <strong style="color: ${color}; font-size: 14px;">${props?.name || zone.name}</strong><br/>
              <span style="color: #aaa; font-size: 12px;">${zone.vehicleCount} vehículo${zone.vehicleCount !== 1 ? "s" : ""} asignado${zone.vehicleCount !== 1 ? "s" : ""}</span>
              ${
                zone.vehicles.length > 0
                  ? `
                <hr style="margin: 8px 0; border: none; border-top: 1px solid #333;"/>
                <span style="color: #888; font-size: 11px;">${zone.vehicles.map((v) => v.plate || "Sin placa").join(", ")}</span>
              `
                  : ""
              }
            </div>
          `)
          .addTo(map.current);
      });

      // Change cursor on hover
      map.current.on("mouseenter", fillLayerId, () => {
        if (map.current) map.current.getCanvas().style.cursor = "pointer";
      });
      map.current.on("mouseleave", fillLayerId, () => {
        if (map.current) map.current.getCanvas().style.cursor = "";
      });
    });
  }, [zones, isLoading, map]);
}
