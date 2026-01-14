"use client";

import maplibregl, {
  LngLatBoundsLike,
  type Map as MapLibreMap,
  type StyleSpecification,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ORDER_STATUS } from "@/lib/validations/order";

// Using OpenStreetMap tiles (free, no API key required)
const DEFAULT_STYLE: StyleSpecification = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap Contributors",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

interface OrderMapProps {
  companyId: string;
  statusFilter?: string;
  searchQuery?: string;
  onOrderClick?: (orderId: string) => void;
  height?: string;
  className?: string;
}

interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    id: string;
    trackingId: string;
    customerName: string;
    address: string;
    status: (typeof ORDER_STATUS)[number];
    color: string;
  };
}

interface GeoJSONResponse {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
  metadata: {
    total: number;
    limit: number;
    filtered?: string;
    bbox?: string;
  };
}

export function OrderMap({
  companyId,
  statusFilter = "ALL",
  searchQuery = "",
  onOrderClick,
  height = "500px",
  className = "",
}: OrderMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [orderCount, setOrderCount] = useState(0);
  const markerPopup = useRef<maplibregl.Popup | null>(null);
  const isInitialized = useRef(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    try {
      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: DEFAULT_STYLE,
        center: [-58.3772, -34.6037], // Buenos Aires default center
        zoom: 10,
        attributionControl: false,
      });

      // Add attribution control manually
      mapInstance.addControl(
        new maplibregl.AttributionControl({
          compact: true,
        }),
        "bottom-right",
      );

      // Add navigation controls
      mapInstance.addControl(new maplibregl.NavigationControl(), "top-right");

      // Add scale control
      mapInstance.addControl(
        new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }),
        "bottom-left",
      );

      map.current = mapInstance;

      mapInstance.on("load", () => {
        setIsLoading(false);
        // Add order source and layer
        addOrderLayers(mapInstance);
      });

      // Handle map movement to fetch new data within bbox
      let moveTimeout: NodeJS.Timeout;
      mapInstance.on("moveend", () => {
        clearTimeout(moveTimeout);
        moveTimeout = setTimeout(() => {
          fetchOrders(mapInstance);
        }, 300); // Debounce
      });

      return () => {
        clearTimeout(moveTimeout);
        mapInstance.remove();
        map.current = null;
      };
    } catch (error) {
      console.error("Failed to initialize map:", error);
      setIsLoading(false);
    }
  }, []);

  // Add order source and layers to map
  const addOrderLayers = (mapInstance: MapLibreMap) => {
    // Add GeoJSON source for orders
    mapInstance.addSource("orders", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50,
    });

    // Add cluster circles
    mapInstance.addLayer({
      id: "clusters",
      type: "circle",
      source: "orders",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#51bbd6",
          100,
          "#f1f075",
          750,
          "#f28cb1",
        ],
        "circle-radius": ["step", ["get", "point_count"], 20, 100, 30, 750, 40],
      },
    });

    // Add cluster count labels
    mapInstance.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "orders",
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 12,
      },
      paint: {
        "text-color": "#ffffff",
      },
    });

    // Add unclustered point circles
    mapInstance.addLayer({
      id: "unclustered-point",
      type: "circle",
      source: "orders",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": 8,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });

    // Add click handler for clusters (zoom to expand)
    mapInstance.on("click", "clusters", (e) => {
      const features = mapInstance.queryRenderedFeatures(e.point, {
        layers: ["clusters"],
      });

      if (features.length > 0) {
        const cluster = features[0];
        const coordinates = (cluster.geometry as any).coordinates as [
          number,
          number,
        ];
        const zoom = mapInstance.getZoom();

        mapInstance.easeTo({
          center: coordinates,
          zoom: zoom + 2,
          duration: 500,
        });
      }
    });

    // Add cursor style for clusters
    mapInstance.on("mouseenter", "clusters", () => {
      mapInstance.getCanvas().style.cursor = "pointer";
    });
    mapInstance.on("mouseleave", "clusters", () => {
      mapInstance.getCanvas().style.cursor = "";
    });

    // Add click handler for individual orders
    mapInstance.on("click", "unclustered-point", (e) => {
      const features = mapInstance.queryRenderedFeatures(e.point, {
        layers: ["unclustered-point"],
      });

      if (features.length > 0 && e.lngLat) {
        const feature = features[0];
        const props = feature.properties as GeoJSONFeature["properties"];

        // Create or update popup
        if (markerPopup.current) {
          markerPopup.current.remove();
        }

        markerPopup.current = new maplibregl.Popup({ offset: 15 })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="p-2">
              <h3 class="font-bold text-sm">${props.trackingId}</h3>
              <p class="text-xs text-gray-600 mt-1">${props.customerName || "No customer"}</p>
              <p class="text-xs text-gray-500 mt-1">${props.address}</p>
              <div class="mt-2">
                <span class="px-2 py-1 rounded-full text-xs font-medium"
                  style="background-color: ${props.color}20; color: ${props.color}">
                  ${props.status}
                </span>
              </div>
            </div>
          `)
          .addTo(mapInstance);

        // Trigger callback if provided
        if (onOrderClick) {
          onOrderClick(props.id);
        }
      }
    });

    // Add cursor style for points
    mapInstance.on("mouseenter", "unclustered-point", () => {
      mapInstance.getCanvas().style.cursor = "pointer";
    });
    mapInstance.on("mouseleave", "unclustered-point", () => {
      mapInstance.getCanvas().style.cursor = "";
    });
  };

  // Fetch orders and update map
  const fetchOrders = async (mapInstance: MapLibreMap) => {
    try {
      const bounds = mapInstance.getBounds();
      const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
      const zoom = Math.round(mapInstance.getZoom());

      const params = new URLSearchParams();
      params.append("bbox", bbox);
      params.append("zoom", zoom.toString());
      params.append("limit", "5000");

      if (statusFilter !== "ALL") {
        params.append("status", statusFilter);
      }

      if (searchQuery) {
        params.append("search", searchQuery);
      }

      const response = await fetch(`/api/orders/geojson?${params}`, {
        headers: { "x-company-id": companyId },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch orders");
      }

      const result: GeoJSONResponse = await response.json();
      setOrderCount(result.metadata.total);

      // Update map source
      const source = mapInstance.getSource(
        "orders",
      ) as maplibregl.GeoJSONSource;
      if (source) {
        source.setData(result);
      }

      // Fit bounds if there are orders and it's the first load
      if (result.features.length > 0 && !isInitialized.current) {
        const bounds = result.features.reduce((bounds, feature) => {
          const [lng, lat] = feature.geometry.coordinates;
          return bounds.extend([lng, lat]);
        }, new maplibregl.LngLatBounds());

        mapInstance.fitBounds(bounds, {
          padding: 50,
          duration: 1000,
        });

        isInitialized.current = true;
      }
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    }
  };

  // Fetch orders when filters change
  useEffect(() => {
    if (map.current) {
      fetchOrders(map.current);
    }
  }, [statusFilter, searchQuery]);

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        </div>
      )}
      <div
        ref={mapContainer}
        className="w-full rounded-lg overflow-hidden border"
        style={{ height }}
      />
      {orderCount > 0 && (
        <div className="absolute bottom-4 left-4 bg-background/95 px-3 py-2 rounded-md shadow-md text-sm">
          <span className="font-medium">{orderCount}</span> orders displayed
        </div>
      )}
    </div>
  );
}
