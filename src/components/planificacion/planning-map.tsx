"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/layout/theme-context";
import { getMapStyle } from "@/lib/map-styles";

interface Vehicle {
  id: string;
  name: string;
  plate: string | null;
  originLatitude: string | null;
  originLongitude: string | null;
  originAddress: string | null;
  assignedDriver: {
    id: string;
    name: string;
  } | null;
}

interface Order {
  id: string;
  trackingId: string;
  customerName: string | null;
  address: string;
  latitude: string | null;
  longitude: string | null;
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

interface PlanningMapProps {
  vehicles: Vehicle[];
  orders: Order[];
  zones?: Zone[];
  showVehicleOrigins?: boolean;
  showOrders?: boolean;
  selectedVehicleIds?: string[];
  onOrderDragEnd?: (
    orderId: string,
    latitude: number,
    longitude: number,
  ) => void;
}

// Popup styles injected into the document
const POPUP_STYLES = `
  .maplibregl-popup-content {
    background: rgba(26, 26, 26, 0.95);
    backdrop-filter: blur(12px);
    border-radius: 12px;
    padding: 0;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }
  .maplibregl-popup-close-button {
    font-size: 18px;
    padding: 4px 8px;
    color: #999;
    right: 4px;
    top: 4px;
  }
  .maplibregl-popup-close-button:hover {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: white;
  }
  .maplibregl-popup-anchor-bottom .maplibregl-popup-tip {
    border-top-color: rgba(26, 26, 26, 0.95);
  }
  .maplibregl-popup-anchor-top .maplibregl-popup-tip {
    border-bottom-color: rgba(26, 26, 26, 0.95);
  }
  .maplibregl-popup-anchor-left .maplibregl-popup-tip {
    border-right-color: rgba(26, 26, 26, 0.95);
  }
  .maplibregl-popup-anchor-right .maplibregl-popup-tip {
    border-left-color: rgba(26, 26, 26, 0.95);
  }
  .popup-content {
    padding: 14px 16px;
  }
  .popup-title {
    font-weight: 600;
    font-size: 14px;
    color: #ffffff;
    margin-bottom: 4px;
  }
  .popup-subtitle {
    font-size: 12px;
    color: #aaa;
    margin-bottom: 2px;
  }
  .popup-address {
    font-size: 11px;
    color: #777;
    line-height: 1.4;
  }
  .popup-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 500;
    margin-top: 8px;
  }
  .popup-badge-vehicle {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
  }
  .popup-badge-order {
    background: rgba(255, 255, 255, 0.1);
    color: #ccc;
  }
  .maplibregl-ctrl-group {
    background: rgba(26, 26, 26, 0.9) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
  }
  .maplibregl-ctrl-group button {
    background-color: transparent !important;
  }
  .maplibregl-ctrl-group button:hover {
    background-color: rgba(255, 255, 255, 0.1) !important;
  }
  .maplibregl-ctrl-group button span {
    filter: invert(1);
  }
`;

/**
 * Silueta de van vista desde arriba (estilo Uber). Las seleccionadas van en
 * blanco con badge de check lima; las no seleccionadas en gris atenuado. La
 * placa cuelga debajo como pill para identificar cada vehículo de un vistazo.
 */
function vehicleMarkerHTML(
  vehicle: { id: string; plate: string | null; name: string },
  isSelected: boolean,
): string {
  const body = isSelected
    ? { light: "#ffffff", mid: "#eef1f5", dark: "#c6cfd9" }
    : { light: "#9aa3af", mid: "#79828f", dark: "#59626f" };
  const glass = isSelected ? "#1e293b" : "#111827";
  const gradId = `vgrad-${vehicle.id}`;
  const plate = vehicle.plate || vehicle.name;

  return `
    <div class="vehicle-marker-inner" style="position:relative;width:24px;height:48px;cursor:pointer;transition:transform .15s ease;opacity:${isSelected ? "1" : "0.8"};">
      <svg width="24" height="48" viewBox="0 0 24 48" style="display:block;overflow:visible;filter:drop-shadow(0 3px 5px rgba(0,0,0,0.45));">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="${body.light}"/>
            <stop offset="0.5" stop-color="${body.mid}"/>
            <stop offset="1" stop-color="${body.dark}"/>
          </linearGradient>
        </defs>
        <rect x="0" y="9.5" width="3.4" height="2.6" rx="1.2" fill="${body.dark}"/>
        <rect x="20.6" y="9.5" width="3.4" height="2.6" rx="1.2" fill="${body.dark}"/>
        <rect x="2.5" y="1" width="19" height="46" rx="6" fill="url(#${gradId})" stroke="rgba(15,23,42,0.4)" stroke-width="1"/>
        <path d="M5 4.5 Q12 2.3 19 4.5 L19 7.8 Q12 6.2 5 7.8 Z" fill="rgba(255,255,255,0.20)"/>
        <path d="M5.2 10.5 Q12 8.4 18.8 10.5 L17.6 15.8 Q12 13.9 6.4 15.8 Z" fill="${glass}"/>
        <rect x="5" y="18.5" width="14" height="23.5" rx="2.5" fill="rgba(0,0,0,0.10)"/>
        <rect x="6" y="43.4" width="12" height="1.8" rx="0.9" fill="${glass}" opacity="0.55"/>
      </svg>
      ${
        isSelected
          ? `<div style="position:absolute;top:-4px;right:-6px;width:15px;height:15px;border-radius:50%;background:#84cc16;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1.5px rgba(255,255,255,0.95),0 2px 6px rgba(0,0,0,0.4);">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#1a2e05" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>`
          : ""
      }
      <div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:3px;padding:2px 7px;border-radius:999px;background:rgba(17,24,39,0.85);color:#f9fafb;font-size:9px;font-weight:600;letter-spacing:0.4px;white-space:nowrap;border:1px solid rgba(255,255,255,0.18);box-shadow:0 2px 6px rgba(0,0,0,0.35);font-family:system-ui,-apple-system,sans-serif;opacity:${isSelected ? "1" : "0.75"};">${plate}</div>
    </div>
  `;
}

export function PlanningMap({
  vehicles,
  orders,
  zones = [],
  showVehicleOrigins = true,
  showOrders = true,
  selectedVehicleIds,
  onOrderDragEnd,
}: PlanningMapProps) {
  const { isDark } = useTheme();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  // Cada setStyle (cambio de tema) borra las capas custom del estilo; este
  // contador re-dispara el effect de zonas cuando el nuevo basemap carga.
  const [styleRevision, setStyleRevision] = useState(0);
  const mapThemeRef = useRef(isDark);

  // Inject popup styles
  useEffect(() => {
    const styleId = "planning-map-popup-styles";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = POPUP_STYLES;
      document.head.appendChild(style);
    }
  }, []);

  // Initialize map — una sola vez. El tema NO es dependencia: destruir y
  // recrear el mapa al cambiarlo dejaba isLoaded en true sin re-disparar los
  // effects de markers/zonas, así que el mapa nuevo quedaba vacío. Los
  // cambios de tema se aplican vía setStyle en el effect de abajo.
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const mapStyle = getMapStyle(mapThemeRef.current);
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        ...mapStyle,
        glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
      },
      center: [-77.0428, -12.0464], // Lima, Peru default
      zoom: 11,
      attributionControl: false,
    });

    const nav = new maplibregl.NavigationControl({ showCompass: false });
    map.current.addControl(nav, "bottom-right");

    map.current.on("load", () => {
      setIsLoaded(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // React to theme changes. setStyle conserva los markers (son DOM) pero
  // borra sources/layers custom; el bump de styleRevision re-añade las zonas
  // cuando el nuevo estilo termina de cargar.
  useEffect(() => {
    if (!map.current || !isLoaded) return;
    if (mapThemeRef.current === isDark) return;
    mapThemeRef.current = isDark;
    const style = getMapStyle(isDark);
    map.current.once("style.load", () => setStyleRevision((v) => v + 1));
    map.current.setStyle(
      {
        ...style,
        glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
      },
      { diff: false },
    );
  }, [isDark, isLoaded]);

  // Update markers when data changes
  useEffect(() => {
    if (!map.current || !isLoaded) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => {
      marker.remove();
    });
    markersRef.current = [];

    const bounds = new maplibregl.LngLatBounds();
    let hasPoints = false;

    // Add vehicle origin markers
    if (showVehicleOrigins) {
      vehicles.forEach((vehicle, _index) => {
        if (!vehicle.originLatitude || !vehicle.originLongitude) return;

        const lat = parseFloat(vehicle.originLatitude);
        const lng = parseFloat(vehicle.originLongitude);

        if (Number.isNaN(lat) || Number.isNaN(lng)) return;

        hasPoints = true;
        bounds.extend([lng, lat]);

        // Check if vehicle is selected (if selectedVehicleIds is provided)
        const isSelected = selectedVehicleIds
          ? selectedVehicleIds.includes(vehicle.id)
          : true;

        const el = document.createElement("div");
        el.className = "vehicle-marker-wrapper";
        el.style.zIndex = isSelected ? "2" : "1";
        el.innerHTML = vehicleMarkerHTML(vehicle, isSelected);

        const innerDiv = el.querySelector(
          ".vehicle-marker-inner",
        ) as HTMLElement;
        if (innerDiv) {
          el.addEventListener("mouseenter", () => {
            innerDiv.style.transform = "scale(1.1)";
            innerDiv.style.opacity = "1";
          });
          el.addEventListener("mouseleave", () => {
            innerDiv.style.transform = "scale(1)";
            innerDiv.style.opacity = isSelected ? "1" : "0.8";
          });
        }

        const popup = new maplibregl.Popup({
          offset: 25,
          closeButton: true,
        }).setHTML(`
          <div class="popup-content">
            <div class="popup-title">${vehicle.plate || vehicle.name}</div>
            ${vehicle.assignedDriver ? `<div class="popup-subtitle">${vehicle.assignedDriver.name}</div>` : ""}
            ${vehicle.originAddress ? `<div class="popup-address">${vehicle.originAddress}</div>` : ""}
            <span class="popup-badge popup-badge-vehicle">${isSelected ? "✓ Seleccionado" : "No seleccionado"}</span>
          </div>
        `);

        if (map.current) {
          const marker = new maplibregl.Marker({
            element: el,
            anchor: "center",
          })
            .setLngLat([lng, lat])
            .setPopup(popup)
            .addTo(map.current);

          markersRef.current.push(marker);
        }
      });
    }

    // Add order markers
    if (showOrders) {
      orders.forEach((order, index) => {
        if (!order.latitude || !order.longitude) return;

        const lat = parseFloat(order.latitude);
        const lng = parseFloat(order.longitude);

        if (Number.isNaN(lat) || Number.isNaN(lng)) return;

        hasPoints = true;
        bounds.extend([lng, lat]);

        const isDraggable = !!onOrderDragEnd;
        const stopNumber = index + 1;

        // Punto de visita estilo Uber: disco blanco con número oscuro.
        const el = document.createElement("div");
        el.className = "order-marker-wrapper";
        el.innerHTML = `
          <div class="order-marker-inner" style="
            width: 22px;
            height: 22px;
            background: #ffffff;
            border: 1px solid rgba(15,23,42,0.3);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${stopNumber >= 100 ? "8px" : "10px"};
            font-weight: 700;
            color: #0f172a;
            letter-spacing: -0.2px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            cursor: ${isDraggable ? "grab" : "pointer"};
            transition: transform 0.15s ease, box-shadow 0.15s ease;
            font-family: system-ui, -apple-system, sans-serif;
          ">${stopNumber}</div>
        `;

        const innerDiv = el.querySelector(".order-marker-inner") as HTMLElement;
        if (innerDiv) {
          el.addEventListener("mouseenter", () => {
            innerDiv.style.transform = "scale(1.25)";
            innerDiv.style.boxShadow = "0 4px 14px rgba(0,0,0,0.5)";
          });
          el.addEventListener("mouseleave", () => {
            innerDiv.style.transform = "scale(1)";
            innerDiv.style.boxShadow = "0 2px 8px rgba(0,0,0,0.4)";
          });
        }

        const popup = new maplibregl.Popup({
          offset: 20,
          closeButton: true,
        }).setHTML(`
          <div class="popup-content">
            <div class="popup-title">${order.trackingId}</div>
            ${order.customerName ? `<div class="popup-subtitle">${order.customerName}</div>` : ""}
            <div class="popup-address">${order.address}</div>
            <span class="popup-badge popup-badge-order">Pedido #${stopNumber}</span>
          </div>
        `);

        if (map.current) {
          const marker = new maplibregl.Marker({
            element: el,
            anchor: "center",
            draggable: isDraggable,
          })
            .setLngLat([lng, lat])
            .setPopup(popup)
            .addTo(map.current);

          if (isDraggable) {
            marker.on("dragstart", () => {
              if (innerDiv) innerDiv.style.cursor = "grabbing";
            });
            marker.on("dragend", () => {
              if (innerDiv) innerDiv.style.cursor = "grab";
              const lngLat = marker.getLngLat();
              onOrderDragEnd(order.id, lngLat.lat, lngLat.lng);
            });
          }

          markersRef.current.push(marker);
        }
      });
    }

    // Fit bounds if we have points
    if (hasPoints && !bounds.isEmpty()) {
      map.current.fitBounds(bounds, {
        padding: 60,
        maxZoom: 15,
        duration: 600,
      });
    }

    return () => {
      markersRef.current.forEach((marker) => {
        marker.remove();
      });
      markersRef.current = [];
    };
  }, [
    vehicles,
    orders,
    showVehicleOrigins,
    showOrders,
    isLoaded,
    selectedVehicleIds,
    onOrderDragEnd,
  ]);

  // Render zones as polygon layers
  useEffect(() => {
    // styleRevision se lee para re-añadir las zonas tras cada swap de basemap
    // (setStyle elimina todas las capas custom del estilo anterior).
    void styleRevision;
    if (!map.current || !isLoaded) return;

    const mapInstance = map.current;

    // Remove existing zone layers and sources
    zones.forEach((_, index) => {
      const fillLayerId = `zone-fill-${index}`;
      const outlineLayerId = `zone-outline-${index}`;
      const sourceId = `zone-source-${index}`;

      if (mapInstance.getLayer(fillLayerId)) {
        mapInstance.removeLayer(fillLayerId);
      }
      if (mapInstance.getLayer(outlineLayerId)) {
        mapInstance.removeLayer(outlineLayerId);
      }
      if (mapInstance.getSource(sourceId)) {
        mapInstance.removeSource(sourceId);
      }
    });

    // Also clean up any previously added zones that might have been removed
    const style = mapInstance.getStyle();
    if (style?.layers) {
      style.layers.forEach((layer) => {
        if (layer.id.startsWith("zone-")) {
          if (mapInstance.getLayer(layer.id)) {
            mapInstance.removeLayer(layer.id);
          }
        }
      });
    }
    if (style?.sources) {
      Object.keys(style.sources).forEach((sourceId) => {
        if (sourceId.startsWith("zone-source-")) {
          if (mapInstance.getSource(sourceId)) {
            mapInstance.removeSource(sourceId);
          }
        }
      });
    }

    const registeredHandlers: Array<{
      event: "click" | "mouseenter" | "mouseleave";
      layerId: string;
      handler: (
        e: maplibregl.MapMouseEvent & {
          features?: maplibregl.MapGeoJSONFeature[];
        },
      ) => void;
    }> = [];
    const addedSourceIds: string[] = [];
    const addedLayerIds: string[] = [];

    // Add zone layers
    zones.forEach((zone, index) => {
      if (!zone.geometry) return;

      const sourceId = `zone-source-${index}`;
      const fillLayerId = `zone-fill-${index}`;
      const outlineLayerId = `zone-outline-${index}`;
      const color = zone.color || "#3B82F6";

      // Add source
      mapInstance.addSource(sourceId, {
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
      addedSourceIds.push(sourceId);

      // Add fill layer (semi-transparent)
      mapInstance.addLayer({
        id: fillLayerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": color,
          "fill-opacity": 0.15,
        },
      });
      addedLayerIds.push(fillLayerId);

      // Add outline layer
      mapInstance.addLayer({
        id: outlineLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": color,
          "line-width": 2,
          "line-opacity": 0.8,
        },
      });
      addedLayerIds.push(outlineLayerId);

      // Add click handler for zone popup
      const clickHandler = (
        e: maplibregl.MapMouseEvent & {
          features?: maplibregl.MapGeoJSONFeature[];
        },
      ) => {
        if (!map.current || !e.features?.[0]) return;

        const props = e.features[0].properties;
        const coordinates = e.lngLat;

        new maplibregl.Popup({ closeButton: true, offset: 10 })
          .setLngLat(coordinates)
          .setHTML(`
            <div class="popup-content">
              <div class="popup-title" style="color: ${color};">${props?.name || zone.name}</div>
              <div class="popup-subtitle">${zone.vehicleCount} vehículo${zone.vehicleCount !== 1 ? "s" : ""} asignado${zone.vehicleCount !== 1 ? "s" : ""}</div>
              ${
                zone.vehicles.length > 0
                  ? `
                <div class="popup-address" style="margin-top: 8px;">
                  ${zone.vehicles.map((v) => v.plate || "Sin placa").join(", ")}
                </div>
              `
                  : ""
              }
              <span class="popup-badge" style="background: ${color}20; color: ${color};">Zona de entrega</span>
            </div>
          `)
          .addTo(map.current);
      };
      mapInstance.on("click", fillLayerId, clickHandler);
      registeredHandlers.push({
        event: "click",
        layerId: fillLayerId,
        handler: clickHandler,
      });

      // Change cursor on hover
      const enterHandler = () => {
        if (map.current) map.current.getCanvas().style.cursor = "pointer";
      };
      const leaveHandler = () => {
        if (map.current) map.current.getCanvas().style.cursor = "";
      };
      mapInstance.on("mouseenter", fillLayerId, enterHandler);
      mapInstance.on("mouseleave", fillLayerId, leaveHandler);
      registeredHandlers.push({
        event: "mouseenter",
        layerId: fillLayerId,
        handler: enterHandler,
      });
      registeredHandlers.push({
        event: "mouseleave",
        layerId: fillLayerId,
        handler: leaveHandler,
      });
    });

    return () => {
      try {
        registeredHandlers.forEach(({ event, layerId, handler }) => {
          mapInstance.off(event, layerId, handler);
        });
        addedLayerIds.forEach((layerId) => {
          if (mapInstance.getLayer(layerId)) mapInstance.removeLayer(layerId);
        });
        addedSourceIds.forEach((sourceId) => {
          if (mapInstance.getSource(sourceId))
            mapInstance.removeSource(sourceId);
        });
      } catch {
        // Map might be already destroyed
      }
    };
  }, [zones, isLoaded, styleRevision]);

  return (
    <div ref={mapContainer} className="size-full rounded-lg overflow-hidden" />
  );
}
