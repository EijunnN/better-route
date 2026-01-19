"use client";

import maplibregl, {
  type Map as MapLibreMap,
  type Marker,
  type StyleSpecification,
} from "maplibre-gl";
import { MapPin, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "./button";
import { Input } from "./input";

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

// Default center: Lima, Peru
const DEFAULT_CENTER: [number, number] = [-77.0428, -12.0464];
const DEFAULT_ZOOM = 12;

interface LocationPickerProps {
  value?: { lat: string; lng: string; address?: string };
  onChange: (location: { lat: string; lng: string; address?: string }) => void;
  height?: string;
  className?: string;
  disabled?: boolean;
}

export function LocationPicker({
  value,
  onChange,
  height = "300px",
  className = "",
  disabled = false,
}: LocationPickerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const initialCenter: [number, number] =
      value?.lng && value?.lat
        ? [parseFloat(value.lng), parseFloat(value.lat)]
        : DEFAULT_CENTER;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: DEFAULT_STYLE,
      center: initialCenter,
      zoom: value?.lng && value?.lat ? 15 : DEFAULT_ZOOM,
      attributionControl: false,
    });

    map.current.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    map.current.on("load", () => {
      setIsLoading(false);

      // Add initial marker if value exists
      if (value?.lng && value?.lat) {
        const lng = parseFloat(value.lng);
        const lat = parseFloat(value.lat);
        if (!isNaN(lng) && !isNaN(lat)) {
          addMarker(lng, lat);
        }
      }
    });

    // Handle click on map
    map.current.on("click", (e) => {
      if (disabled) return;

      const { lng, lat } = e.lngLat;
      addMarker(lng, lat);
      onChange({
        lat: lat.toFixed(6),
        lng: lng.toFixed(6),
        address: value?.address,
      });
    });

    return () => {
      if (marker.current) {
        marker.current.remove();
        marker.current = null;
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker when value changes externally
  useEffect(() => {
    if (!map.current || isLoading) return;

    if (value?.lng && value?.lat) {
      const lng = parseFloat(value.lng);
      const lat = parseFloat(value.lat);
      if (!isNaN(lng) && !isNaN(lat)) {
        addMarker(lng, lat);
        map.current.flyTo({ center: [lng, lat], zoom: 15 });
      }
    }
  }, [value?.lat, value?.lng, isLoading]);

  const addMarker = useCallback((lng: number, lat: number) => {
    if (!map.current) return;

    // Remove existing marker
    if (marker.current) {
      marker.current.remove();
    }

    // Create custom marker element
    const el = document.createElement("div");
    el.className = "location-marker";
    el.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #ef4444; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
        <circle cx="12" cy="10" r="3" fill="#ef4444"/>
      </svg>
    `;

    marker.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([lng, lat])
      .addTo(map.current);
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim() || isSearching) return;

    setIsSearching(true);
    try {
      // Using Nominatim for geocoding (free, no API key)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
        {
          headers: {
            "User-Agent": "PlaneamientoApp/1.0",
          },
        },
      );

      const results = await response.json();

      if (results && results.length > 0) {
        const { lat, lon, display_name } = results[0];
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lon);

        addMarker(lngNum, latNum);
        map.current?.flyTo({ center: [lngNum, latNum], zoom: 15 });

        onChange({
          lat: latNum.toFixed(6),
          lng: lngNum.toFixed(6),
          address: display_name,
        });
      }
    } catch (error) {
      console.error("Error searching location:", error);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar direccion..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9"
            disabled={disabled || isSearching}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleSearch}
          disabled={disabled || isSearching || !searchQuery.trim()}
        >
          {isSearching ? "..." : "Buscar"}
        </Button>
      </div>

      {/* Map container */}
      <div
        ref={mapContainer}
        className="relative rounded-lg border overflow-hidden"
        style={{ height }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        )}
      </div>

      {/* Coordinates display */}
      {value?.lat && value?.lng && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span>
            {value.lat}, {value.lng}
          </span>
        </div>
      )}

      {/* Instructions */}
      <p className="text-xs text-muted-foreground">
        Haz clic en el mapa para seleccionar la ubicacion o usa el buscador
      </p>
    </div>
  );
}
