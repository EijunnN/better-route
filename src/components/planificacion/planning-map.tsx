"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

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
}

// Dark elegant map style using CartoDB Dark Matter
const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: "carto-dark",
      type: "raster",
      source: "carto",
      minzoom: 0,
      maxzoom: 20,
    },
  ],
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
};

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

export function PlanningMap({
  vehicles,
  orders,
  zones = [],
  showVehicleOrigins = true,
  showOrders = true,
  selectedVehicleIds,
}: PlanningMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

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

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: [-77.0428, -12.0464], // Lima, Peru default
      zoom: 11,
      attributionControl: false,
    });

    // Custom navigation control styling
    const nav = new maplibregl.NavigationControl({ showCompass: false });
    map.current.addControl(nav, "top-right");

    map.current.on("load", () => {
      setIsLoaded(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

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
      vehicles.forEach((vehicle, index) => {
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
        const bgColor = isSelected ? "#ffffff" : "#6b7280";
        const iconColor = isSelected ? "#1a1a1a" : "#ffffff";
        const opacity = isSelected ? "1" : "0.7";

        // Create elegant vehicle marker
        const el = document.createElement("div");
        el.className = "vehicle-marker-wrapper";
        el.innerHTML = `
          <div class="vehicle-marker-inner" style="
            width: 38px;
            height: 38px;
            background: ${bgColor};
            border: 2px solid ${isSelected ? "rgba(255,255,255,0.3)" : "rgba(107,114,128,0.5)"};
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 16px rgba(0,0,0,0.4);
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
            opacity: ${opacity};
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 17h4V5H2v12h3"/>
              <path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/>
              <circle cx="7.5" cy="17.5" r="2.5"/>
              <circle cx="17.5" cy="17.5" r="2.5"/>
            </svg>
          </div>
          ${
            isSelected
              ? ""
              : `<div style="
            position: absolute;
            bottom: -4px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 9px;
            color: #9ca3af;
            white-space: nowrap;
            text-shadow: 0 1px 2px rgba(0,0,0,0.8);
          ">${vehicle.plate || ""}</div>`
          }
        `;

        const innerDiv = el.querySelector(
          ".vehicle-marker-inner",
        ) as HTMLElement;
        if (innerDiv) {
          el.addEventListener("mouseenter", () => {
            innerDiv.style.transform = "scale(1.12)";
            innerDiv.style.boxShadow = "0 6px 24px rgba(0,0,0,0.5)";
            innerDiv.style.opacity = "1";
          });
          el.addEventListener("mouseleave", () => {
            innerDiv.style.transform = "scale(1)";
            innerDiv.style.boxShadow = "0 4px 16px rgba(0,0,0,0.4)";
            innerDiv.style.opacity = opacity;
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

        // Create elegant order marker
        const el = document.createElement("div");
        el.className = "order-marker-wrapper";
        el.innerHTML = `
          <div class="order-marker-inner" style="
            width: 26px;
            height: 26px;
            background: #1a1a1a;
            border: 2px solid #ffffff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 600;
            color: #ffffff;
            box-shadow: 0 3px 12px rgba(0,0,0,0.4);
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
            font-family: system-ui, -apple-system, sans-serif;
          ">${index + 1}</div>
        `;

        const innerDiv = el.querySelector(".order-marker-inner") as HTMLElement;
        if (innerDiv) {
          el.addEventListener("mouseenter", () => {
            innerDiv.style.transform = "scale(1.15)";
            innerDiv.style.boxShadow = "0 5px 20px rgba(0,0,0,0.5)";
          });
          el.addEventListener("mouseleave", () => {
            innerDiv.style.transform = "scale(1)";
            innerDiv.style.boxShadow = "0 3px 12px rgba(0,0,0,0.4)";
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
            <span class="popup-badge popup-badge-order">Pedido #${index + 1}</span>
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

    // Fit bounds if we have points
    if (hasPoints && !bounds.isEmpty()) {
      map.current.fitBounds(bounds, {
        padding: 60,
        maxZoom: 15,
        duration: 600,
      });
    }
  }, [
    vehicles,
    orders,
    showVehicleOrigins,
    showOrders,
    isLoaded,
    selectedVehicleIds,
  ]);

  // Render zones as polygon layers
  useEffect(() => {
    if (!map.current || !isLoaded) return;

    // Remove existing zone layers and sources
    zones.forEach((_, index) => {
      const fillLayerId = `zone-fill-${index}`;
      const outlineLayerId = `zone-outline-${index}`;
      const sourceId = `zone-source-${index}`;

      if (map.current?.getLayer(fillLayerId)) {
        map.current.removeLayer(fillLayerId);
      }
      if (map.current?.getLayer(outlineLayerId)) {
        map.current.removeLayer(outlineLayerId);
      }
      if (map.current?.getSource(sourceId)) {
        map.current.removeSource(sourceId);
      }
    });

    // Also clean up any previously added zones that might have been removed
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

      // Add click handler for zone popup
      map.current.on("click", fillLayerId, (e) => {
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
      });

      // Change cursor on hover
      map.current.on("mouseenter", fillLayerId, () => {
        if (map.current) map.current.getCanvas().style.cursor = "pointer";
      });
      map.current.on("mouseleave", fillLayerId, () => {
        if (map.current) map.current.getCanvas().style.cursor = "";
      });
    });
  }, [zones, isLoaded]);

  return (
    <div
      ref={mapContainer}
      className="w-full h-full rounded-lg overflow-hidden"
    />
  );
}
