"use client";

import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Using OpenStreetMap tiles (free, no API key required)
const DEFAULT_STYLE: maplibregl.StyleSpecification = {
  version: 8,
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

interface DepotLocation {
  latitude: string;
  longitude: string;
  address?: string;
}

interface DepotSelectorProps {
  value: DepotLocation;
  onChange: (location: DepotLocation) => void;
  className?: string;
}

export function DepotSelector({
  value,
  onChange,
  className = "",
}: DepotSelectorProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [manualLat, setManualLat] = useState(value.latitude || "");
  const [manualLng, setManualLng] = useState(value.longitude || "");
  const [manualAddress, setManualAddress] = useState(value.address || "");
  const [manualInputMode, setManualInputMode] = useState(false);

  const updateDepotLocation = useCallback(
    (lat: string, lng: string, address?: string) => {
      onChange({
        latitude: lat,
        longitude: lng,
        address: address || value.address,
      });
      setManualLat(lat);
      setManualLng(lng);
      if (address) setManualAddress(address);
    },
    [onChange, value.address],
  );

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: DEFAULT_STYLE,
      center: [-58.3772, -34.6037], // Buenos Aires default center
      zoom: 10,
      attributionControl: false,
    });

    mapInstance.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    mapInstance.addControl(new maplibregl.NavigationControl(), "top-right");

    mapInstance.on("load", () => {
      setMapReady(true);
    });

    // Handle map clicks to set depot location
    mapInstance.on("click", (e) => {
      const { lng, lat } = e.lngLat;
      updateDepotLocation(lat.toString(), lng.toString());
    });

    map.current = mapInstance;

    return () => {
      mapInstance.remove();
      map.current = null;
    };
  }, [updateDepotLocation]);

  // Update marker when value changes
  useEffect(() => {
    if (!map.current || !value.latitude || !value.longitude) return;

    const lat = parseFloat(value.latitude);
    const lng = parseFloat(value.longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    // Remove existing marker
    if (marker.current) {
      marker.current.remove();
    }

    // Create new marker with depot icon
    const depotElement = document.createElement("div");
    depotElement.className = "depot-marker";
    depotElement.innerHTML = `
      <div class="flex items-center justify-center w-10 h-10 bg-blue-600 rounded-full border-4 border-white shadow-lg">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>
    `;

    marker.current = new maplibregl.Marker({
      element: depotElement,
      anchor: "center",
    })
      .setLngLat([lng, lat])
      .addTo(map.current);

    // Fly to the new location
    map.current.flyTo({
      center: [lng, lat],
      zoom: 14,
      duration: 1000,
    });
  }, [value.latitude, value.longitude]);

  // Initialize with existing value if present
  useEffect(() => {
    if (map.current && mapReady && value.latitude && value.longitude) {
      const lat = parseFloat(value.latitude);
      const lng = parseFloat(value.longitude);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        map.current.flyTo({
          center: [lng, lat],
          zoom: 14,
          duration: 1000,
        });
      }
    }
  }, [mapReady, value.latitude, value.longitude]);

  const handleManualSubmit = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      alert("Please enter valid coordinates");
      return;
    }

    if (lat < -90 || lat > 90) {
      alert("Latitude must be between -90 and 90");
      return;
    }

    if (lng < -180 || lng > 180) {
      alert("Longitude must be between -180 and 180");
      return;
    }

    if (lat === 0 && lng === 0) {
      alert("Coordinates (0, 0) are not valid");
      return;
    }

    updateDepotLocation(lat.toString(), lng.toString(), manualAddress);
    setManualInputMode(false);

    // Center map on new location
    if (map.current) {
      map.current.flyTo({
        center: [lng, lat],
        zoom: 14,
        duration: 1000,
      });
    }
  };

  const handleLocateUser = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        updateDepotLocation(
          latitude.toString(),
          longitude.toString(),
          "Current location",
        );
      },
      (error) => {
        alert(`Unable to get your location: ${error.message}`);
      },
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Depot Location</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setManualInputMode(!manualInputMode)}
        >
          <MapPin className="w-4 h-4 mr-2" />
          {manualInputMode ? "Map Mode" : "Manual Input"}
        </Button>
      </div>

      {manualInputMode ? (
        <div className="space-y-3 p-4 border rounded-lg bg-muted/20">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="depot-lat" className="text-sm">
                Latitude
              </Label>
              <Input
                id="depot-lat"
                type="number"
                step="any"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder="-34.6037"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="depot-lng" className="text-sm">
                Longitude
              </Label>
              <Input
                id="depot-lng"
                type="number"
                step="any"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                placeholder="-58.3772"
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="depot-address" className="text-sm">
              Address (optional)
            </Label>
            <Input
              id="depot-address"
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              placeholder="Enter depot address"
              className="mt-1"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={handleManualSubmit}>
              Set Location
            </Button>
            <Button type="button" variant="outline" onClick={handleLocateUser}>
              <Navigation className="w-4 h-4 mr-2" />
              Use My Location
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={mapContainer}
            className="w-full h-80 rounded-lg overflow-hidden border cursor-crosshair"
          />
          <p className="text-sm text-muted-foreground">
            Click on the map to set the depot location, or use the Manual Input
            button to enter coordinates.
          </p>

          {value.latitude && value.longitude && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">Selected Location:</p>
              <p className="text-xs text-muted-foreground mt-1">
                {value.latitude}, {value.longitude}
              </p>
              {value.address && (
                <p className="text-xs text-muted-foreground mt-1">
                  {value.address}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
