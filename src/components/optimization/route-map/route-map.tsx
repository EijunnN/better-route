"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "@/components/layout/theme-context";
import { getMapStyle } from "@/lib/map-styles";
import { ROUTE_COLORS, UNASSIGNED_COLOR } from "./constants";
import { decodePolyline } from "./decode-polyline";
import type { Route, RouteMapProps } from "./types";
import { useMapThemeSync } from "./use-map-init";
import { useZoneLayers } from "./use-map-interactions";
import { useMarkerHighlight } from "./use-markers";
import { useRouteSelectionVisibility } from "./use-route-layers";

/**
 * Aclara (pct > 0) u oscurece (pct < 0) un color hex — da volumen a los
 * markers sin mantener una paleta paralela por ruta.
 */
function shadeHex(hex: string, pct: number): string {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const num = Number.parseInt(full, 16);
  const mix = (channel: number) =>
    Math.round(
      pct >= 0 ? channel + (255 - channel) * pct : channel * (1 + pct),
    );
  const r = mix((num >> 16) & 0xff);
  const g = mix((num >> 8) & 0xff);
  const b = mix(num & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Texto legible sobre un fondo hex: colores claros de la paleta → texto oscuro. */
function labelColorFor(hex: string): string {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const num = Number.parseInt(full, 16);
  const luminance =
    0.299 * ((num >> 16) & 0xff) +
    0.587 * ((num >> 8) & 0xff) +
    0.114 * (num & 0xff);
  return luminance > 170 ? "#1f2937" : "#ffffff";
}

/**
 * Silueta de van vista desde arriba en el color de la ruta, con el
 * identificador del vehículo colgando como pill. Misma familia visual que el
 * marker de vehículos del mapa de planificación.
 */
function driverVanHTML(
  routeId: string,
  color: string,
  identifier: string,
): string {
  const dark = shadeHex(color, -0.25);
  return `
    <div style="position:relative;width:20px;height:40px;cursor:pointer;">
      <svg width="20" height="40" viewBox="0 0 24 48" style="display:block;overflow:visible;filter:drop-shadow(0 3px 5px rgba(0,0,0,0.45));">
        <defs>
          <linearGradient id="rvan-${routeId}" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="${shadeHex(color, 0.35)}"/>
            <stop offset="0.5" stop-color="${color}"/>
            <stop offset="1" stop-color="${dark}"/>
          </linearGradient>
        </defs>
        <rect x="0" y="9.5" width="3.4" height="2.6" rx="1.2" fill="${dark}"/>
        <rect x="20.6" y="9.5" width="3.4" height="2.6" rx="1.2" fill="${dark}"/>
        <rect x="2.5" y="1" width="19" height="46" rx="6" fill="url(#rvan-${routeId})" stroke="rgba(255,255,255,0.88)" stroke-width="1.2"/>
        <path d="M5 4.5 Q12 2.3 19 4.5 L19 7.8 Q12 6.2 5 7.8 Z" fill="rgba(255,255,255,0.25)"/>
        <path d="M5.2 10.5 Q12 8.4 18.8 10.5 L17.6 15.8 Q12 13.9 6.4 15.8 Z" fill="#0f172a"/>
        <rect x="5" y="18.5" width="14" height="23.5" rx="2.5" fill="rgba(0,0,0,0.12)"/>
        <rect x="6" y="43.4" width="12" height="1.8" rx="0.9" fill="#0f172a" opacity="0.55"/>
      </svg>
      <div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:3px;padding:1.5px 6px;border-radius:999px;background:rgba(17,24,39,0.85);color:#f9fafb;font-size:8.5px;font-weight:600;letter-spacing:0.3px;white-space:nowrap;border:1px solid ${color};box-shadow:0 2px 6px rgba(0,0,0,0.35);font-family:system-ui,-apple-system,sans-serif;">${identifier}</div>
    </div>
  `;
}

/** Cuerpo SVG del pin "lollipop": disco con anillo blanco + tallo a la coordenada. */
function stopPinSVG(color: string): string {
  return `
    <path d="M14 35 L8.6 24 H19.4 Z" fill="${shadeHex(color, -0.18)}" stroke="rgba(255,255,255,0.9)" stroke-width="1" stroke-linejoin="round"/>
    <circle cx="14" cy="13.5" r="11.5" fill="${color}" stroke="rgba(255,255,255,0.95)" stroke-width="2"/>
  `;
}

/**
 * (Re)añade las líneas de ruta como sources/layers de MapLibre. Idempotente
 * (salta sources existentes): se invoca en el load inicial y tras cada
 * setStyle del basemap, que borra todas las capas custom pero conserva los
 * markers DOM y los listeners delegados por layerId.
 */
function addRouteLineLayers(
  mapInstance: maplibregl.Map,
  routes: Route[],
  depot: RouteMapProps["depot"],
): void {
  routes.forEach((route, routeIndex) => {
    const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];

    let coordinates: [number, number][] = [];

    if (route.geometry) {
      coordinates = decodePolyline(route.geometry);
    } else {
      // Fallback: draw straight lines when no VROOM geometry
      // Use route's driverOrigin if available, otherwise depot
      const routeOrigin = route.driverOrigin
        ? {
            longitude: route.driverOrigin.longitude,
            latitude: route.driverOrigin.latitude,
          }
        : depot;

      if (routeOrigin) {
        coordinates.push([routeOrigin.longitude, routeOrigin.latitude]);
      }
      route.stops
        .toSorted((a, b) => a.sequence - b.sequence)
        .forEach((stop) => {
          coordinates.push([stop.longitude, stop.latitude]);
        });
      if (routeOrigin) {
        coordinates.push([routeOrigin.longitude, routeOrigin.latitude]);
      }
    }

    if (coordinates.length < 2) return;

    const sourceId = `route-${route.routeId}`;
    if (mapInstance.getSource(sourceId)) return;

    mapInstance.addSource(sourceId, {
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

    mapInstance.addLayer({
      id: `route-line-${route.routeId}`,
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
  });
}

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
  const { isDark } = useTheme();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mapThemeRef = useRef(isDark);

  // The map's imperative click handlers are registered ONCE at init. Route the
  // selection state + callbacks through refs so those handlers always read the
  // latest values without forcing a full map re-init — re-initializing would
  // re-run fitBounds and recenter the map on every route/order click.
  const selectedRouteIdRef = useRef(selectedRouteId);
  const onRouteSelectRef = useRef(onRouteSelect);
  const onMapReadyRef = useRef(onMapReady);
  useEffect(() => {
    selectedRouteIdRef.current = selectedRouteId;
    onRouteSelectRef.current = onRouteSelect;
    onMapReadyRef.current = onMapReady;
  }, [selectedRouteId, onRouteSelect, onMapReady]);

  // Se incrementa cuando el sustrato de capas cambia: tras el load inicial y
  // tras cada setStyle por cambio de tema (que borra las capas custom). Los
  // effects de líneas, zonas y énfasis de selección dependen de él.
  const [styleRevision, setStyleRevision] = useState(0);
  const bumpStyleRevision = useCallback(
    () => setStyleRevision((v) => v + 1),
    [],
  );

  // Re-añade las líneas de ruta tras un swap de basemap. Los markers (DOM) y
  // los listeners delegados sobreviven a setStyle; solo faltan sources/layers.
  // Debe declararse ANTES de useRouteSelectionVisibility para que el énfasis
  // de selección se aplique sobre las capas ya recreadas.
  // OJO: no usar isStyleLoaded() como guard — tras "style.load" sigue siendo
  // false mientras cargan tiles/sprites, pero addSource/addLayer ya son
  // seguros (solo requieren la hoja de estilo parseada).
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || styleRevision === 0) return;
    try {
      addRouteLineLayers(mapInstance, routes, depot);
    } catch {
      // Estilo aún parseándose (re-init por cambio de datos): el handler de
      // "load" añadirá las líneas y volverá a bumpear styleRevision.
    }
  }, [styleRevision, routes, depot]);

  // Update route visibility when selection changes
  useRouteSelectionVisibility(
    map,
    markersRef,
    routes,
    selectedRouteId,
    styleRevision,
  );

  // Highlight selected orders (for pencil selection feedback)
  useMarkerHighlight(map, markersRef, highlightedOrderIds);

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
        } else if (routes.length > 0 && routes[0]?.stops?.length > 0) {
          const allStops = routes.flatMap((r) => r.stops);
          const avgLat =
            allStops.reduce((sum, s) => sum + s.latitude, 0) / allStops.length;
          const avgLng =
            allStops.reduce((sum, s) => sum + s.longitude, 0) / allStops.length;
          centerLat = avgLat;
          centerLng = avgLng;
        }

        const style = getMapStyle(mapThemeRef.current);
        map.current = new maplibregl.Map({
          container: mapContainer.current,
          style: {
            ...style,
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
                width: 34px;
                height: 34px;
                background: #111827;
                border: 2px solid rgba(255,255,255,0.92);
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(0,0,0,0.45);
              ">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
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
            driverOriginEl.innerHTML = driverVanHTML(
              route.routeId,
              color,
              route.vehicleIdentifier,
            );

            const popup = new maplibregl.Popup({
              offset: 25,
              className: "dark-popup",
            }).setHTML(`
              <div style="background: #1a1a2e; color: #eee; padding: 10px 14px; border-radius: 8px; min-width: 160px;">
                <strong style="color: #fff; font-size: 14px;">Inicio: ${route.driverName || "Conductor"}</strong><br/>
                <span style="color: ${color}; font-weight: 600;">${route.vehicleIdentifier}</span>
                ${route.driverOrigin.address ? `<hr style="margin: 8px 0; border: none; border-top: 1px solid #333;"/><span style="color: #888; font-size: 11px;">${route.driverOrigin.address}</span>` : ""}
              </div>
            `);

            const marker = new maplibregl.Marker({ element: driverOriginEl })
              .setLngLat([
                route.driverOrigin.longitude,
                route.driverOrigin.latitude,
              ])
              .setPopup(popup)
              .addTo(map.current);

            // Add click handler after marker is created so we can toggle popup
            driverOriginEl.addEventListener("click", (e) => {
              e.stopPropagation();
              marker.togglePopup();
              onRouteSelectRef.current?.(
                selectedRouteIdRef.current === route.routeId
                  ? null
                  : route.routeId,
              );
            });

            markersRef.current.push(marker);
          });

          // Add route line sources/layers (idempotente, reutilizado tras
          // cambios de tema)
          addRouteLineLayers(map.current, routes, depot);

          routes.forEach((route, routeIndex) => {
            if (!map.current) return;
            const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];
            const layerId = `route-line-${route.routeId}`;

            // Los listeners delegados por layerId viven en el mapa (no en la
            // capa): sobreviven a setStyle, así que se registran solo aquí.
            map.current.on("click", layerId, () => {
              onRouteSelectRef.current?.(
                selectedRouteIdRef.current === route.routeId
                  ? null
                  : route.routeId,
              );
            });

            map.current.on("mouseenter", layerId, () => {
              if (map.current) map.current.getCanvas().style.cursor = "pointer";
            });

            map.current.on("mouseleave", layerId, () => {
              if (map.current) map.current.getCanvas().style.cursor = "";
            });

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
                    top: -5px;
                    right: -6px;
                    background: #fff;
                    color: ${shadeHex(color, -0.45)};
                    font-size: 9px;
                    font-weight: 700;
                    padding: 1.5px 5px;
                    border-radius: 10px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.35);
                  ">${stop.groupedTrackingIds?.length}</span>`
                : "";
              const labelColor = labelColorFor(color);
              markerEl.innerHTML = `
                <div class="pin-marker" style="
                  position: relative;
                  cursor: pointer;
                  transition: transform 0.15s ease;
                  transform-origin: bottom center;
                ">
                  <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 3px 4px rgba(0,0,0,0.4));">
                    ${stopPinSVG(color)}
                  </svg>
                  <span style="
                    position: absolute;
                    top: 2px;
                    left: 2.5px;
                    width: 23px;
                    height: 23px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: ${stop.sequence >= 100 ? "9px" : "11px"};
                    font-weight: 700;
                    color: ${labelColor};
                    ${labelColor === "#ffffff" ? "text-shadow: 0 1px 2px rgba(0,0,0,0.35);" : ""}
                    font-family: system-ui, -apple-system, sans-serif;
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
                ? stop.groupedTrackingIds?.length
                : 1;

              const popupContent = isGrouped
                ? `
                  <div style="background: #1a1a2e; color: #eee; padding: 10px 14px; border-radius: 8px; min-width: 220px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                      <span style="background: ${color}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Parada ${stop.sequence}</span>
                      <span style="color: #888; font-size: 11px;">${orderCount} pedidos</span>
                    </div>
                    <div style="margin-bottom: 8px;">
                      ${stop.groupedTrackingIds
                        ?.map(
                          (tid, idx) => `
                        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 3px;">
                          <span style="background: ${color}33; color: ${color}; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600;">R${routeIndex + 1}-${stop.sequence}.${idx + 1}</span>
                          <span style="color: #fff; font-size: 12px;">${tid}</span>
                        </div>
                      `,
                        )
                        .join("")}
                    </div>
                    <span style="color: ${color}; font-weight: 600;">${route.vehicleIdentifier}</span>
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
                    <span style="color: ${color}; font-weight: 600;">${route.vehicleIdentifier}</span>
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
                  .setLngLat([stop.longitude, stop.latitude])
                  .setPopup(popup)
                  .addTo(map.current);

                // Add click handler after marker is created so we can toggle popup
                markerEl.addEventListener("click", (e) => {
                  e.stopPropagation();
                  marker.togglePopup();
                  onRouteSelectRef.current?.(
                    selectedRouteIdRef.current === route.routeId
                      ? null
                      : route.routeId,
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
                transform-origin: bottom center;
                opacity: 0.35;
                filter: saturate(0.5);
              ">
                <svg width="20" height="26" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));">
                  ${stopPinSVG(UNASSIGNED_COLOR)}
                </svg>
                <span style="
                  position: absolute;
                  top: 1.5px;
                  left: 2px;
                  width: 16px;
                  height: 16.5px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 9px;
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
              .setLngLat([order.longitude, order.latitude])
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
                  border: 2.5px dashed #f97316;
                  border-radius: 50%;
                  animation: pulse-vehicle 2s ease-in-out infinite;
                "></div>
                <div style="
                  position: absolute;
                  inset: 0;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                ">
                  <svg width="14" height="28" viewBox="0 0 24 48" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.4));">
                    <rect x="0" y="9.5" width="3.4" height="2.6" rx="1.2" fill="#6b7280"/>
                    <rect x="20.6" y="9.5" width="3.4" height="2.6" rx="1.2" fill="#6b7280"/>
                    <rect x="2.5" y="1" width="19" height="46" rx="6" fill="${UNASSIGNED_COLOR}" stroke="rgba(255,255,255,0.85)" stroke-width="1.2"/>
                    <path d="M5.2 10.5 Q12 8.4 18.8 10.5 L17.6 15.8 Q12 13.9 6.4 15.8 Z" fill="#111827"/>
                    <rect x="5" y="18.5" width="14" height="23.5" rx="2.5" fill="rgba(0,0,0,0.12)"/>
                    <rect x="6" y="43.4" width="12" height="1.8" rx="0.9" fill="#111827" opacity="0.55"/>
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
              .setLngLat([vehicle.originLongitude, vehicle.originLatitude])
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
                  route.driverOrigin.longitude,
                  route.driverOrigin.latitude,
                ]);
              }

              route.stops.forEach((stop) => {
                allCoords.push([stop.longitude, stop.latitude]);
              });
            });

            // Include unassigned orders in bounds
            unassignedOrders.forEach((order) => {
              if (order.latitude && order.longitude) {
                allCoords.push([order.longitude, order.latitude]);
              }
            });

            // Include vehicles without routes in bounds
            vehiclesWithoutRoutes.forEach((vehicle) => {
              if (vehicle.originLatitude && vehicle.originLongitude) {
                allCoords.push([
                  vehicle.originLongitude,
                  vehicle.originLatitude,
                ]);
              }
            });

            if (allCoords.length > 0 && allCoords[0]) {
              const bounds = allCoords.reduce(
                (bounds, coord) => bounds.extend(coord as [number, number]),
                new maplibregl.LngLatBounds(allCoords[0], allCoords[0]),
              );

              map.current.fitBounds(bounds, { padding: 60 });
            }
          }

          setIsLoading(false);

          // Re-dispara los effects de zonas y énfasis de selección sobre el
          // mapa recién poblado (necesario cuando el init re-corre por cambio
          // de datos y los demás deps no cambiaron).
          setStyleRevision((v) => v + 1);

          // Notify parent when map is ready
          if (map.current && onMapReadyRef.current) {
            onMapReadyRef.current(map.current);
          }
        });

        // Click on map to deselect
        map.current.on("click", () => {
          onRouteSelectRef.current?.(null);
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
    // Selection state + callbacks are read through refs (see above), so they
    // are intentionally NOT deps — re-running this effect tears down and
    // recreates the whole map, which would recenter it on every click.
    // El tema TAMPOCO es dep: destruir el mapa al cambiarlo perdía cámara,
    // zonas y selección; useMapThemeSync lo aplica vía setStyle.
  }, [routes, depot, showDepot, unassignedOrders, vehiclesWithoutRoutes]);

  // React to theme changes; al cargar el nuevo estilo se re-añaden las capas
  // custom vía styleRevision.
  useMapThemeSync(map, mapThemeRef, isDark, isLoading, bumpStyleRevision);

  // Render zones as polygon layers
  useZoneLayers(map, zones, isLoading, styleRevision);

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
      <div className="relative size-full bg-[#1a1a2e]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e]/80 z-10">
            <Loader2 className="size-8 animate-spin text-[#4ECDC4]" />
          </div>
        )}
        <div ref={mapContainer} className="size-full" />

        {/* Selection hint — sits below the pencil toggle (top-4 left-4) so the
            two don't overlap. */}
        {selectedRouteId && (
          <div className="absolute top-16 left-4 bg-[#1a1a2e]/90 backdrop-blur px-3 py-2 rounded-lg border border-gray-700">
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
              <Loader2 className="size-8 animate-spin text-[#4ECDC4]" />
            </div>
          )}
          <div ref={mapContainer} className="size-full" />
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
                  className="size-3 rounded-full"
                  style={{
                    backgroundColor: ROUTE_COLORS[i % ROUTE_COLORS.length],
                  }}
                />
                <span className="text-gray-200">{route.vehicleIdentifier}</span>
                <span className="text-gray-500">({route.stops.length})</span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
