"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import "maplibre-gl/dist/maplibre-gl.css";

interface RouteStop {
  orderId: string;
  trackingId: string;
  sequence: number;
  address: string;
  latitude: string;
  longitude: string;
}

interface Route {
  routeId: string;
  vehicleId: string;
  vehiclePlate: string;
  driverName?: string;
  stops: RouteStop[];
  totalDistance: number;
  totalDuration: number;
  geometry?: string; // Encoded polyline from VROOM/OSRM
}

interface RouteMapProps {
  routes: Route[];
  depot?: {
    latitude: number;
    longitude: number;
  };
  selectedRouteId?: string | null;
  onRouteSelect?: (routeId: string) => void;
}

/**
 * Decode Google Polyline Algorithm Format
 * OSRM uses precision 5 (like Google Maps), VROOM passes it through
 * @see https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
function decodePolyline(
  encoded: string,
  precision: number = 5,
): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = 10 ** precision;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    // [longitude, latitude] format for GeoJSON
    coordinates.push([lng / factor, lat / factor]);
  }

  return coordinates;
}

// Color palette for routes
const ROUTE_COLORS = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#6366f1", // indigo
];

export function RouteMap({
  routes,
  depot,
  selectedRouteId,
  onRouteSelect,
}: RouteMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    const initMap = async () => {
      try {
        const maplibregl = await import("maplibre-gl");

        if (!mapContainer.current) return;

        // Calculate center from all stops or depot
        let centerLat = -12.0464; // Lima default
        let centerLng = -77.0428;

        if (depot) {
          centerLat = depot.latitude;
          centerLng = depot.longitude;
        } else if (routes.length > 0 && routes[0].stops.length > 0) {
          const allStops = routes.flatMap((r) => r.stops);
          const avgLat =
            allStops.reduce((sum, s) => sum + parseFloat(s.latitude), 0) /
            allStops.length;
          const avgLng =
            allStops.reduce((sum, s) => sum + parseFloat(s.longitude), 0) /
            allStops.length;
          centerLat = avgLat;
          centerLng = avgLng;
        }

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
          center: [centerLng, centerLat],
          zoom: 12,
        });

        map.current.addControl(new maplibregl.NavigationControl(), "top-right");

        map.current.on("load", () => {
          if (!map.current) return;

          // Add depot marker
          if (depot) {
            const depotEl = document.createElement("div");
            depotEl.className = "depot-marker";
            depotEl.innerHTML = `
              <div style="
                width: 32px;
                height: 32px;
                background: #1f2937;
                border: 3px solid white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              ">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </div>
            `;

            new maplibregl.Marker({ element: depotEl })
              .setLngLat([depot.longitude, depot.latitude])
              .setPopup(
                new maplibregl.Popup().setHTML(
                  "<strong>Depot</strong><br/>Punto de inicio/fin",
                ),
              )
              .addTo(map.current);
          }

          // Add routes
          routes.forEach((route, routeIndex) => {
            if (!map.current) return;
            const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];
            const isSelected = route.routeId === selectedRouteId;

            // Use decoded polyline from VROOM/OSRM if available, otherwise fallback to straight lines
            let coordinates: [number, number][] = [];

            if (route.geometry) {
              // Decode the polyline from OSRM (real road geometry)
              coordinates = decodePolyline(route.geometry);
              console.log(
                `[RouteMap] Route ${route.routeId} using OSRM geometry with ${coordinates.length} points`,
              );
            } else {
              // Fallback: straight lines between stops
              console.log(
                `[RouteMap] Route ${route.routeId} using straight lines (no geometry)`,
              );

              if (depot) {
                coordinates.push([depot.longitude, depot.latitude]);
              }

              route.stops
                .sort((a, b) => a.sequence - b.sequence)
                .forEach((stop) => {
                  coordinates.push([
                    parseFloat(stop.longitude),
                    parseFloat(stop.latitude),
                  ]);
                });

              if (depot) {
                coordinates.push([depot.longitude, depot.latitude]);
              }
            }

            // Add route line
            if (coordinates.length >= 2) {
              const sourceId = `route-${route.routeId}`;
              const layerId = `route-line-${route.routeId}`;

              // Check if source already exists (prevent duplicates)
              if (map.current.getSource(sourceId)) {
                return;
              }

              map.current.addSource(sourceId, {
                type: "geojson",
                data: {
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates,
                  },
                },
              });

              map.current.addLayer({
                id: layerId,
                type: "line",
                source: sourceId,
                layout: {
                  "line-join": "round",
                  "line-cap": "round",
                },
                paint: {
                  "line-color": color,
                  "line-width": isSelected ? 5 : 3,
                  "line-opacity": isSelected ? 1 : 0.7,
                },
              });

              // Click handler for route
              map.current.on("click", layerId, () => {
                onRouteSelect?.(route.routeId);
              });

              map.current.on("mouseenter", layerId, () => {
                if (map.current)
                  map.current.getCanvas().style.cursor = "pointer";
              });

              map.current.on("mouseleave", layerId, () => {
                if (map.current) map.current.getCanvas().style.cursor = "";
              });
            }

            // Add stop markers
            route.stops.forEach((stop) => {
              const markerEl = document.createElement("div");
              markerEl.innerHTML = `
                <div style="
                  width: 24px;
                  height: 24px;
                  background: ${color};
                  border: 2px solid white;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 11px;
                  font-weight: bold;
                  color: white;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                  cursor: pointer;
                ">${stop.sequence}</div>
              `;

              const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
                <div style="min-width: 150px;">
                  <strong>${stop.trackingId}</strong><br/>
                  <span style="color: ${color}; font-weight: 500;">${route.vehiclePlate}</span>
                  ${route.driverName ? `<br/><small>${route.driverName}</small>` : ""}
                  <hr style="margin: 8px 0; border: none; border-top: 1px solid #eee;"/>
                  <small style="color: #666;">${stop.address}</small>
                </div>
              `);

              const marker = new maplibregl.Marker({ element: markerEl })
                .setLngLat([
                  parseFloat(stop.longitude),
                  parseFloat(stop.latitude),
                ])
                .setPopup(popup)
                .addTo(map.current!);

              markersRef.current.push(marker);
            });
          });

          // Fit bounds to show all markers
          if (routes.length > 0) {
            const allCoords: [number, number][] = [];

            if (depot) {
              allCoords.push([depot.longitude, depot.latitude]);
            }

            routes.forEach((route) => {
              route.stops.forEach((stop) => {
                allCoords.push([
                  parseFloat(stop.longitude),
                  parseFloat(stop.latitude),
                ]);
              });
            });

            if (allCoords.length > 0) {
              const bounds = allCoords.reduce(
                (bounds, coord) => bounds.extend(coord as [number, number]),
                new maplibregl.LngLatBounds(allCoords[0], allCoords[0]),
              );

              map.current.fitBounds(bounds, { padding: 50 });
            }
          }

          setIsLoading(false);
        });

        map.current.on("error", (e) => {
          console.error("Map error:", e);
          setError("Error loading map");
          setIsLoading(false);
        });
      } catch (err) {
        console.error("Failed to initialize map:", err);
        setError("Failed to load map library");
        setIsLoading(false);
      }
    };

    initMap();

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, [routes, depot, selectedRouteId, onRouteSelect]);

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          Mapa de Rutas
          {routes.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({routes.length} rutas,{" "}
              {routes.reduce((sum, r) => sum + r.stops.length, 0)} paradas)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative h-[400px] w-full rounded-b-lg overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          <div ref={mapContainer} className="h-full w-full" />
        </div>

        {/* Legend */}
        {routes.length > 0 && (
          <div className="p-3 border-t flex flex-wrap gap-3">
            {routes.map((route, i) => (
              <button
                key={route.routeId}
                onClick={() => onRouteSelect?.(route.routeId)}
                className={`flex items-center gap-2 px-2 py-1 rounded text-sm transition-colors ${
                  selectedRouteId === route.routeId
                    ? "bg-muted font-medium"
                    : "hover:bg-muted/50"
                }`}
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: ROUTE_COLORS[i % ROUTE_COLORS.length],
                  }}
                />
                <span>{route.vehiclePlate}</span>
                <span className="text-muted-foreground">
                  ({route.stops.length})
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
