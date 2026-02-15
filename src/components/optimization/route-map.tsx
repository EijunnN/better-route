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
  // For grouped stops (multiple orders at same location)
  groupedOrderIds?: string[];
  groupedTrackingIds?: string[];
}

interface Route {
  routeId: string;
  vehicleId: string;
  vehiclePlate: string;
  driverId?: string;
  driverName?: string;
  driverOrigin?: {
    latitude: string;
    longitude: string;
    address?: string;
  };
  stops: RouteStop[];
  totalDistance: number;
  totalDuration: number;
  geometry?: string;
}

interface UnassignedOrder {
  orderId: string;
  trackingId: string;
  reason: string;
  latitude?: string;
  longitude?: string;
  address?: string;
}

interface VehicleWithoutRoute {
  id: string;
  plate: string;
  originLatitude?: string;
  originLongitude?: string;
}

interface Zone {
  id: string;
  name: string;
  geometry: {
    type: string;
    coordinates: number[][][];
  };
  color: string | null;
  active: boolean;
  vehicleCount: number;
  vehicles: Array<{ id: string; plate: string | null }>;
}

interface RouteMapProps {
  routes: Route[];
  depot?: {
    latitude: number;
    longitude: number;
  };
  unassignedOrders?: UnassignedOrder[];
  vehiclesWithoutRoutes?: VehicleWithoutRoute[];
  zones?: Zone[];
  selectedRouteId?: string | null;
  onRouteSelect?: (routeId: string | null) => void;
  variant?: "card" | "fullscreen";
  showLegend?: boolean;
  showDepot?: boolean;
  onMapReady?: (map: maplibregl.Map) => void;
  /** Order IDs that should be highlighted as selected (for pencil selection feedback) */
  highlightedOrderIds?: string[];
}

/**
 * Decode Google Polyline Algorithm Format
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

    coordinates.push([lng / factor, lat / factor]);
  }

  return coordinates;
}

// Vibrant color palette optimized for dark backgrounds
export const ROUTE_COLORS = [
  "#FF6B6B", // coral red
  "#4ECDC4", // teal
  "#45B7D1", // sky blue
  "#96CEB4", // sage green
  "#FFEAA7", // soft yellow
  "#DDA0DD", // plum
  "#98D8C8", // mint
  "#F7DC6F", // gold
  "#BB8FCE", // lavender
  "#85C1E9", // light blue
];

const UNSELECTED_COLOR = "#4a5568"; // Gray for unselected routes
const UNASSIGNED_COLOR = "#9ca3af"; // Light gray for unassigned items (subtle)

export function RouteMap({
  routes,
  depot,
  unassignedOrders = [],
  vehiclesWithoutRoutes = [],
  zones = [],
  selectedRouteId,
  onRouteSelect,
  variant = "card",
  showLegend = true,
  showDepot = false,
  onMapReady,
  highlightedOrderIds = [],
}: RouteMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Update route visibility when selection changes
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
  }, [selectedRouteId, routes]);

  // Highlight selected orders (for pencil selection feedback)
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
  }, [highlightedOrderIds]);

  useEffect(() => {
    if (!mapContainer.current) return;

    const initMap = async () => {
      try {
        const maplibregl = await import("maplibre-gl");

        if (!mapContainer.current) return;

        // Calculate center from all stops or depot
        let centerLat = -12.0464;
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

        // Dark map style using CartoDB Dark Matter
        map.current = new maplibregl.Map({
          container: mapContainer.current,
          style: {
            version: 8,
            sources: {
              "carto-dark": {
                type: "raster",
                tiles: [
                  "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                  "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                  "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                ],
                tileSize: 256,
                attribution:
                  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
              },
            },
            layers: [
              {
                id: "carto-dark-layer",
                type: "raster",
                source: "carto-dark",
                minzoom: 0,
                maxzoom: 20,
              },
            ],
            glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
          },
          center: [centerLng, centerLat],
          zoom: 12,
          attributionControl: false,
        });

        // Custom navigation control styling
        map.current.addControl(new maplibregl.NavigationControl(), "top-right");

        map.current.on("load", () => {
          if (!map.current) return;

          // Add depot marker only if showDepot is true
          if (showDepot && depot) {
            const depotEl = document.createElement("div");
            depotEl.className = "depot-marker";
            depotEl.innerHTML = `
              <div style="
                width: 36px;
                height: 36px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: 3px solid rgba(255,255,255,0.9);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.5);
              ">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </div>
            `;

            new maplibregl.Marker({ element: depotEl })
              .setLngLat([depot.longitude, depot.latitude])
              .setPopup(
                new maplibregl.Popup({ className: "dark-popup" }).setHTML(`
                  <div style="background: #1a1a2e; color: #eee; padding: 8px 12px; border-radius: 8px;">
                    <strong style="color: #fff;">Depot</strong><br/>
                    <span style="color: #aaa; font-size: 12px;">Punto de inicio/fin</span>
                  </div>
                `),
              )
              .addTo(map.current);
          }

          // Add driver origin markers
          routes.forEach((route, routeIndex) => {
            if (!map.current || !route.driverOrigin) return;

            const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];
            const driverOriginEl = document.createElement("div");
            driverOriginEl.setAttribute("data-route-id", route.routeId);
            driverOriginEl.innerHTML = `
              <div style="
                width: 32px;
                height: 32px;
                background: ${color};
                border: 3px solid rgba(255,255,255,0.9);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                cursor: pointer;
                transition: all 0.2s ease;
              ">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
                  <circle cx="12" cy="8" r="4"/>
                  <path d="M20 21a8 8 0 1 0-16 0"/>
                </svg>
              </div>
            `;

            const popup = new maplibregl.Popup({
              offset: 25,
              className: "dark-popup",
            }).setHTML(`
              <div style="background: #1a1a2e; color: #eee; padding: 10px 14px; border-radius: 8px; min-width: 160px;">
                <strong style="color: #fff; font-size: 14px;">Inicio: ${route.driverName || "Conductor"}</strong><br/>
                <span style="color: ${color}; font-weight: 600;">${route.vehiclePlate}</span>
                ${route.driverOrigin.address ? `<hr style="margin: 8px 0; border: none; border-top: 1px solid #333;"/><span style="color: #888; font-size: 11px;">${route.driverOrigin.address}</span>` : ""}
              </div>
            `);

            const marker = new maplibregl.Marker({ element: driverOriginEl })
              .setLngLat([
                parseFloat(route.driverOrigin.longitude),
                parseFloat(route.driverOrigin.latitude),
              ])
              .setPopup(popup)
              .addTo(map.current);

            // Add click handler after marker is created so we can toggle popup
            driverOriginEl.addEventListener("click", (e) => {
              e.stopPropagation();
              marker.togglePopup();
              onRouteSelect?.(
                selectedRouteId === route.routeId ? null : route.routeId,
              );
            });

            markersRef.current.push(marker);
          });

          // Add routes
          routes.forEach((route, routeIndex) => {
            if (!map.current) return;
            const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];

            let coordinates: [number, number][] = [];

            if (route.geometry) {
              coordinates = decodePolyline(route.geometry);
            } else {
              // Fallback: draw straight lines when no VROOM geometry
              // Use route's driverOrigin if available, otherwise depot
              const routeOrigin = route.driverOrigin
                ? {
                    longitude: parseFloat(route.driverOrigin.longitude),
                    latitude: parseFloat(route.driverOrigin.latitude),
                  }
                : depot;

              if (routeOrigin) {
                coordinates.push([routeOrigin.longitude, routeOrigin.latitude]);
              }
              route.stops
                .toSorted((a, b) => a.sequence - b.sequence)
                .forEach((stop) => {
                  coordinates.push([
                    parseFloat(stop.longitude),
                    parseFloat(stop.latitude),
                  ]);
                });
              if (routeOrigin) {
                coordinates.push([routeOrigin.longitude, routeOrigin.latitude]);
              }
            }

            if (coordinates.length >= 2) {
              const sourceId = `route-${route.routeId}`;
              const layerId = `route-line-${route.routeId}`;

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
                  "line-width": 3,
                  "line-opacity": 1,
                },
              });

              map.current.on("click", layerId, () => {
                onRouteSelect?.(
                  selectedRouteId === route.routeId ? null : route.routeId,
                );
              });

              map.current.on("mouseenter", layerId, () => {
                if (map.current)
                  map.current.getCanvas().style.cursor = "pointer";
              });

              map.current.on("mouseleave", layerId, () => {
                if (map.current) map.current.getCanvas().style.cursor = "";
              });
            }

            // Add stop markers - Modern elegant pin style
            route.stops.forEach((stop) => {
              const markerEl = document.createElement("div");
              markerEl.setAttribute("data-route-id", route.routeId);
              // Store all order IDs for this stop (for selection highlighting)
              const orderIds =
                stop.groupedOrderIds && stop.groupedOrderIds.length > 1
                  ? stop.groupedOrderIds
                  : [stop.orderId];
              markerEl.setAttribute("data-order-ids", JSON.stringify(orderIds));
              const hasMultipleOrders =
                stop.groupedTrackingIds && stop.groupedTrackingIds.length > 1;
              const orderBadge = hasMultipleOrders
                ? `<span style="
                    position: absolute;
                    top: -4px;
                    right: -4px;
                    background: #fff;
                    color: ${color};
                    font-size: 9px;
                    font-weight: 700;
                    padding: 2px 5px;
                    border-radius: 10px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                  ">${stop.groupedTrackingIds!.length}</span>`
                : "";
              markerEl.innerHTML = `
                <div class="pin-marker" style="
                  position: relative;
                  cursor: pointer;
                  transition: transform 0.15s ease;
                ">
                  <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 24 16 24s16-12 16-24C32 7.163 24.837 0 16 0z" fill="${color}"/>
                    <path d="M16 1C7.716 1 1 7.716 1 16c0 5.5 4 11 8 15.5 2.5 2.8 5.5 5.5 7 6.8 1.5-1.3 4.5-4 7-6.8 4-4.5 8-10 8-15.5 0-8.284-6.716-15-15-15z" fill="rgba(255,255,255,0.15)"/>
                    <circle cx="16" cy="14" r="10" fill="rgba(0,0,0,0.2)"/>
                  </svg>
                  <span style="
                    position: absolute;
                    top: 6px;
                    left: 50%;
                    transform: translateX(-50%);
                    font-size: 12px;
                    font-weight: 700;
                    color: white;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                  ">${stop.sequence}</span>
                  ${orderBadge}
                </div>
              `;

              markerEl.addEventListener("mouseenter", () => {
                const pin = markerEl.querySelector(
                  ".pin-marker",
                ) as HTMLElement;
                if (pin) pin.style.transform = "scale(1.15) translateY(-3px)";
              });
              markerEl.addEventListener("mouseleave", () => {
                const pin = markerEl.querySelector(
                  ".pin-marker",
                ) as HTMLElement;
                if (pin) pin.style.transform = "scale(1) translateY(0)";
              });

              // Generate popup content based on whether stop has grouped orders
              const isGrouped =
                stop.groupedTrackingIds && stop.groupedTrackingIds.length > 1;
              const orderCount = isGrouped
                ? stop.groupedTrackingIds!.length
                : 1;

              const popupContent = isGrouped
                ? `
                  <div style="background: #1a1a2e; color: #eee; padding: 10px 14px; border-radius: 8px; min-width: 220px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                      <span style="background: ${color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Parada ${stop.sequence}</span>
                      <span style="color: #888; font-size: 11px;">${orderCount} pedidos</span>
                    </div>
                    <div style="margin-bottom: 8px;">
                      ${stop
                        .groupedTrackingIds!.map(
                          (tid, idx) => `
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 3px;">
                          <span style="background: ${color}33; color: ${color}; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600;">R${routeIndex + 1}-${stop.sequence}.${idx + 1}</span>
                          <span style="color: #fff; font-size: 12px;">${tid}</span>
                        </div>
                      `,
                        )
                        .join("")}
                    </div>
                    <span style="color: ${color}; font-weight: 600;">${route.vehiclePlate}</span>
                    ${route.driverName ? `<span style="color: #666; margin-left: 8px;">• ${route.driverName}</span>` : ""}
                    <hr style="margin: 8px 0; border: none; border-top: 1px solid #333;"/>
                    <span style="color: #aaa; font-size: 11px; line-height: 1.4; display: block;">${stop.address}</span>
                  </div>
                `
                : `
                  <div style="background: #1a1a2e; color: #eee; padding: 10px 14px; border-radius: 8px; min-width: 200px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                      <span style="background: ${color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Parada ${stop.sequence}</span>
                      <strong style="color: #fff;">${stop.trackingId}</strong>
                    </div>
                    <span style="color: ${color}; font-weight: 600;">${route.vehiclePlate}</span>
                    ${route.driverName ? `<span style="color: #666; margin-left: 8px;">• ${route.driverName}</span>` : ""}
                    <hr style="margin: 8px 0; border: none; border-top: 1px solid #333;"/>
                    <span style="color: #aaa; font-size: 11px; line-height: 1.4; display: block;">${stop.address}</span>
                  </div>
                `;

              const popup = new maplibregl.Popup({
                offset: 30,
                className: "dark-popup",
              }).setHTML(popupContent);

              if (map.current) {
                const marker = new maplibregl.Marker({
                  element: markerEl,
                  anchor: "bottom",
                })
                  .setLngLat([
                    parseFloat(stop.longitude),
                    parseFloat(stop.latitude),
                  ])
                  .setPopup(popup)
                  .addTo(map.current);

                // Add click handler after marker is created so we can toggle popup
                markerEl.addEventListener("click", (e) => {
                  e.stopPropagation();
                  marker.togglePopup();
                  onRouteSelect?.(
                    selectedRouteId === route.routeId ? null : route.routeId,
                  );
                });

                markersRef.current.push(marker);
              }
            });
          });

          // Add unassigned orders markers (subtle gray - reduced visibility)
          unassignedOrders.forEach((order) => {
            if (!map.current || !order.latitude || !order.longitude) return;

            const markerEl = document.createElement("div");
            markerEl.setAttribute("data-type", "unassigned");
            markerEl.setAttribute("data-order-id", order.orderId);
            markerEl.innerHTML = `
              <div class="pin-marker" style="
                position: relative;
                cursor: pointer;
                transition: all 0.15s ease;
                opacity: 0.35;
                filter: saturate(0.5);
              ">
                <svg width="20" height="25" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 24 16 24s16-12 16-24C32 7.163 24.837 0 16 0z" fill="${UNASSIGNED_COLOR}"/>
                  <path d="M16 1C7.716 1 1 7.716 1 16c0 5.5 4 11 8 15.5 2.5 2.8 5.5 5.5 7 6.8 1.5-1.3 4.5-4 7-6.8 4-4.5 8-10 8-15.5 0-8.284-6.716-15-15-15z" fill="rgba(255,255,255,0.1)"/>
                  <circle cx="16" cy="14" r="10" fill="rgba(0,0,0,0.2)"/>
                </svg>
                <span style="
                  position: absolute;
                  top: 3px;
                  left: 50%;
                  transform: translateX(-50%);
                  font-size: 8px;
                  font-weight: 700;
                  color: white;
                  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                ">✕</span>
              </div>
            `;

            markerEl.addEventListener("mouseenter", () => {
              const pin = markerEl.querySelector(".pin-marker") as HTMLElement;
              if (pin) {
                pin.style.transform = "scale(1.3) translateY(-3px)";
                pin.style.opacity = "0.7";
                pin.style.filter = "saturate(1)";
              }
            });
            markerEl.addEventListener("mouseleave", () => {
              const pin = markerEl.querySelector(".pin-marker") as HTMLElement;
              if (pin) {
                pin.style.transform = "scale(1) translateY(0)";
                pin.style.opacity = "0.35";
                pin.style.filter = "saturate(0.5)";
              }
            });

            const popup = new maplibregl.Popup({
              offset: 25,
              className: "dark-popup",
            }).setHTML(`
              <div style="background: #1a1a2e; color: #eee; padding: 10px 14px; border-radius: 8px; min-width: 200px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                  <span style="background: ${UNASSIGNED_COLOR}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Sin asignar</span>
                  <strong style="color: #fff;">${order.trackingId}</strong>
                </div>
                <hr style="margin: 8px 0; border: none; border-top: 1px solid #333;"/>
                <span style="color: #f87171; font-size: 11px; line-height: 1.4; display: block;">${order.reason}</span>
                ${order.address ? `<span style="color: #aaa; font-size: 11px; line-height: 1.4; display: block; margin-top: 4px;">${order.address}</span>` : ""}
              </div>
            `);

            const marker = new maplibregl.Marker({
              element: markerEl,
              anchor: "bottom",
            })
              .setLngLat([
                parseFloat(order.longitude),
                parseFloat(order.latitude),
              ])
              .setPopup(popup)
              .addTo(map.current);

            markersRef.current.push(marker);
          });

          // Add vehicles without routes markers (distinctive with truck icon and dashed border)
          vehiclesWithoutRoutes.forEach((vehicle) => {
            if (
              !map.current ||
              !vehicle.originLatitude ||
              !vehicle.originLongitude
            )
              return;

            const vehicleEl = document.createElement("div");
            vehicleEl.setAttribute("data-type", "vehicle-no-route");
            vehicleEl.innerHTML = `
              <div class="vehicle-no-route-marker" style="
                position: relative;
                width: 40px;
                height: 40px;
                cursor: pointer;
                transition: transform 0.2s ease;
              ">
                <div style="
                  position: absolute;
                  inset: 0;
                  border: 3px dashed #f97316;
                  border-radius: 8px;
                  animation: pulse-vehicle 2s ease-in-out infinite;
                "></div>
                <div style="
                  position: absolute;
                  inset: 3px;
                  background: ${UNASSIGNED_COLOR};
                  border-radius: 5px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  box-shadow: 0 3px 10px rgba(0,0,0,0.4);
                ">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                    <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
                    <path d="M15 18H9"/>
                    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
                    <circle cx="17" cy="18" r="2"/>
                    <circle cx="7" cy="18" r="2"/>
                  </svg>
                </div>
              </div>
              <style>
                @keyframes pulse-vehicle {
                  0%, 100% { opacity: 1; transform: scale(1); }
                  50% { opacity: 0.6; transform: scale(1.08); }
                }
              </style>
            `;

            vehicleEl.addEventListener("mouseenter", () => {
              const inner = vehicleEl.querySelector(
                ".vehicle-no-route-marker",
              ) as HTMLElement;
              if (inner) inner.style.transform = "scale(1.15)";
            });
            vehicleEl.addEventListener("mouseleave", () => {
              const inner = vehicleEl.querySelector(
                ".vehicle-no-route-marker",
              ) as HTMLElement;
              if (inner) inner.style.transform = "scale(1)";
            });

            const popup = new maplibregl.Popup({
              offset: 25,
              className: "dark-popup",
            }).setHTML(`
              <div style="background: #1a1a2e; color: #eee; padding: 10px 14px; border-radius: 8px; min-width: 160px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                  <span style="background: #f97316; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">SIN RUTA</span>
                </div>
                <strong style="color: #fff; font-size: 14px;">${vehicle.plate}</strong>
                <p style="color: #9ca3af; font-size: 11px; margin-top: 4px;">Vehículo disponible sin asignación</p>
              </div>
            `);

            const marker = new maplibregl.Marker({ element: vehicleEl })
              .setLngLat([
                parseFloat(vehicle.originLongitude),
                parseFloat(vehicle.originLatitude),
              ])
              .setPopup(popup)
              .addTo(map.current);

            markersRef.current.push(marker);
          });

          // Fit bounds to show all markers
          if (
            routes.length > 0 ||
            unassignedOrders.length > 0 ||
            vehiclesWithoutRoutes.length > 0
          ) {
            const allCoords: [number, number][] = [];

            if (showDepot && depot) {
              allCoords.push([depot.longitude, depot.latitude]);
            }

            routes.forEach((route) => {
              if (route.driverOrigin) {
                allCoords.push([
                  parseFloat(route.driverOrigin.longitude),
                  parseFloat(route.driverOrigin.latitude),
                ]);
              }

              route.stops.forEach((stop) => {
                allCoords.push([
                  parseFloat(stop.longitude),
                  parseFloat(stop.latitude),
                ]);
              });
            });

            // Include unassigned orders in bounds
            unassignedOrders.forEach((order) => {
              if (order.latitude && order.longitude) {
                allCoords.push([
                  parseFloat(order.longitude),
                  parseFloat(order.latitude),
                ]);
              }
            });

            // Include vehicles without routes in bounds
            vehiclesWithoutRoutes.forEach((vehicle) => {
              if (vehicle.originLatitude && vehicle.originLongitude) {
                allCoords.push([
                  parseFloat(vehicle.originLongitude),
                  parseFloat(vehicle.originLatitude),
                ]);
              }
            });

            if (allCoords.length > 0) {
              const bounds = allCoords.reduce(
                (bounds, coord) => bounds.extend(coord as [number, number]),
                new maplibregl.LngLatBounds(allCoords[0], allCoords[0]),
              );

              map.current.fitBounds(bounds, { padding: 60 });
            }
          }

          setIsLoading(false);

          // Notify parent when map is ready
          if (map.current && onMapReady) {
            onMapReady(map.current);
          }
        });

        // Click on map to deselect
        map.current.on("click", () => {
          onRouteSelect?.(null);
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
      markersRef.current.forEach((marker) => {
        marker.remove();
      });
      markersRef.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, [routes, depot, showDepot, unassignedOrders, vehiclesWithoutRoutes]);

  // Render zones as polygon layers
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
  }, [zones, isLoading]);

  if (error) {
    if (variant === "fullscreen") {
      return (
        <div className="flex items-center justify-center h-full bg-[#1a1a2e] text-gray-400">
          <p>{error}</p>
        </div>
      );
    }
    return (
      <Card className="bg-[#1a1a2e] border-gray-700">
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Fullscreen variant
  if (variant === "fullscreen") {
    return (
      <div className="relative h-full w-full bg-[#1a1a2e]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e]/80 z-10">
            <Loader2 className="h-8 w-8 animate-spin text-[#4ECDC4]" />
          </div>
        )}
        <div ref={mapContainer} className="h-full w-full" />

        {/* Selection hint */}
        {selectedRouteId && (
          <div className="absolute top-4 left-4 bg-[#1a1a2e]/90 backdrop-blur px-3 py-2 rounded-lg border border-gray-700">
            <p className="text-xs text-gray-400">
              Clic en el mapa para ver todas las rutas
            </p>
          </div>
        )}
      </div>
    );
  }

  // Card variant
  return (
    <Card className="bg-[#1a1a2e] border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2 text-gray-100">
          Mapa de Rutas
          {routes.length > 0 && (
            <span className="text-sm font-normal text-gray-400">
              ({routes.length} rutas,{" "}
              {routes.reduce((sum, r) => sum + r.stops.length, 0)} paradas)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative h-[400px] w-full rounded-b-lg overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e]/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-[#4ECDC4]" />
            </div>
          )}
          <div ref={mapContainer} className="h-full w-full" />
        </div>

        {/* Legend */}
        {showLegend && routes.length > 0 && (
          <div className="p-3 border-t border-gray-700 flex flex-wrap gap-2 bg-[#1a1a2e]">
            {routes.map((route, i) => (
              <button
                type="button"
                key={route.routeId}
                onClick={() =>
                  onRouteSelect?.(
                    selectedRouteId === route.routeId ? null : route.routeId,
                  )
                }
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-opacity ${
                  selectedRouteId === route.routeId
                    ? "bg-gray-700 ring-2 ring-offset-1 ring-offset-[#1a1a2e]"
                    : selectedRouteId
                      ? "opacity-40 hover:opacity-70"
                      : "hover:bg-gray-800"
                }`}
                style={
                  {
                    borderColor: ROUTE_COLORS[i % ROUTE_COLORS.length],
                    "--tw-ring-color": ROUTE_COLORS[i % ROUTE_COLORS.length],
                  } as React.CSSProperties
                }
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: ROUTE_COLORS[i % ROUTE_COLORS.length],
                  }}
                />
                <span className="text-gray-200">{route.vehiclePlate}</span>
                <span className="text-gray-500">({route.stops.length})</span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
