"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import "maplibre-gl/dist/maplibre-gl.css";

interface MonitoringMapProps {
  jobId: string | null;
  companyId: string;
  selectedDriverId: string | null;
  onDriverSelect?: (driverId: string) => void;
}

export function MonitoringMap({
  jobId: _jobId,
  companyId,
  selectedDriverId,
  onDriverSelect,
}: MonitoringMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMapData = useCallback(async () => {
    if (!map.current || !companyId) return;

    try {
      const response = await fetch("/api/monitoring/geojson", {
        headers: { "x-company-id": companyId },
      });

      if (!response.ok) throw new Error("Failed to load map data");

      const geojson = await response.json();

      // Clear existing layers and sources
      const existingSources = map.current.getStyle()?.sources;
      if (existingSources) {
        Object.keys(existingSources).forEach((sourceId) => {
          if (sourceId !== "osm-tiles") {
            if (map.current?.getSource(sourceId)) {
              map.current?.removeSource(sourceId);
            }
          }
        });
      }

      const existingLayers = map.current.getStyle()?.layers;
      if (existingLayers) {
        existingLayers.forEach((layer: { id: string }) => {
          if (layer.id !== "osm-tiles" && map.current?.getLayer(layer.id)) {
            map.current?.removeLayer(layer.id);
          }
        });
      }

      if (geojson.data.features.length === 0) {
        return;
      }

      // Add GeoJSON source
      map.current.addSource("monitoring-data", {
        type: "geojson",
        data: geojson.data,
      });

      // Separate routes and stops
      const routes = geojson.data.features.filter(
        (f: GeoJSON.Feature) => f.properties?.type === "route",
      );
      const stops = geojson.data.features.filter(
        (f: GeoJSON.Feature) => f.properties?.type === "stop",
      );

      // Add route lines
      if (routes.length > 0) {
        map.current.addLayer({
          id: "route-lines",
          type: "line",
          source: "monitoring-data",
          filter: ["==", ["get", "type"], "route"],
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 3,
            "line-opacity": 0.7,
          },
        });

        // Highlight selected driver's route
        if (selectedDriverId) {
          map.current.addLayer({
            id: "route-lines-selected",
            type: "line",
            source: "monitoring-data",
            filter: [
              "all",
              ["==", ["get", "type"], "route"],
              ["==", ["get", "driverId"], selectedDriverId],
            ],
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": ["get", "color"],
              "line-width": 5,
              "line-opacity": 1,
            },
          });
        }
      }

      // Add stop points
      if (stops.length > 0) {
        map.current.addLayer({
          id: "stop-points",
          type: "circle",
          source: "monitoring-data",
          filter: ["==", ["get", "type"], "stop"],
          paint: {
            "circle-radius": 8,
            "circle-color": ["get", "color"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        // Add stop numbers
        map.current.addLayer({
          id: "stop-labels",
          type: "symbol",
          source: "monitoring-data",
          filter: ["==", ["get", "type"], "stop"],
          layout: {
            "text-field": ["get", "sequence"],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-size": 12,
            "text-anchor": "center",
            "text-offset": [0, 0],
          },
          paint: {
            "text-color": "#ffffff",
          },
        });
      }

      // Fit map to show all features
      const maplibreglModule = await import("maplibre-gl");
      const bounds = new maplibreglModule.LngLatBounds();
      geojson.data.features.forEach((feature: GeoJSON.Feature) => {
        if (feature.geometry.type === "Point") {
          bounds.extend(feature.geometry.coordinates as [number, number]);
        } else if (feature.geometry.type === "LineString") {
          (feature.geometry.coordinates as [number, number][]).forEach(
            (coord) => {
              bounds.extend(coord);
            },
          );
        }
      });

      if (!bounds.isEmpty()) {
        map.current.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
        });
      }

      // Add click handlers
      map.current.on("click", "stop-points", (e) => {
        const features = map.current?.queryRenderedFeatures(e.point, {
          layers: ["stop-points"],
        });

        if (features && features.length > 0) {
          const props = features[0].properties as {
            driverId?: string;
          } | null;
          if (props?.driverId) onDriverSelect?.(props.driverId);
        }
      });

      // Change cursor on hover
      map.current.on("mouseenter", "stop-points", () => {
        const canvas = map.current?.getCanvas();
        if (canvas) {
          canvas.style.cursor = "pointer";
        }
      });

      map.current.on("mouseleave", "stop-points", () => {
        const canvas = map.current?.getCanvas();
        if (canvas) {
          canvas.style.cursor = "";
        }
      });
    } catch (err) {
      console.error("Failed to load map data:", err);
      setError("Failed to load monitoring data");
    }
  }, [companyId, selectedDriverId, onDriverSelect]);

  useEffect(() => {
    if (!mapContainer.current) return;

    const initMap = async () => {
      try {
        const maplibregl = await import("maplibre-gl");

        // Create map instance
        if (!mapContainer.current) return;

        map.current = new maplibregl.Map({
          container: mapContainer.current,
          style: {
            version: 8,
            sources: {
              "osm-tiles": {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution: "&copy; OpenStreetMap Contributors",
              },
            },
            layers: [
              {
                id: "osm-tiles",
                type: "raster",
                source: "osm-tiles",
                minzoom: 0,
                maxzoom: 19,
              },
            ],
          },
          center: [-58.4, -34.6], // Default to Buenos Aires
          zoom: 12,
        });

        map.current.on("load", () => {
          setIsLoading(false);
          loadMapData();
        });

        map.current.on("error", (e) => {
          console.error("Map error:", e);
          setError("Failed to load map");
          setIsLoading(false);
        });
      } catch (err) {
        console.error("Failed to initialize map:", err);
        setError("Failed to initialize map");
        setIsLoading(false);
      }
    };

    initMap();

    return () => {
      map.current?.remove();
    };
  }, [loadMapData]);

  useEffect(() => {
    if (map.current && !isLoading) {
      loadMapData();
    }
  }, [isLoading, loadMapData]);

  return (
    <Card className="h-full">
      <CardContent className="p-0 h-full">
        <div
          ref={mapContainer}
          className="w-full h-full min-h-[400px] relative"
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/90 z-10">
              <div className="text-center text-muted-foreground">
                <p>{error}</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
