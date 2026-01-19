"use client";

import { Fuel, Package, Search, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Vehicle {
  id: string;
  plate: string;
  type: string;
  weightCapacity: number;
  volumeCapacity: number;
  status: string;
  fleet: {
    id: string;
    name: string;
  } | null;
}

interface Fleet {
  id: string;
  name: string;
}

interface VehicleSelectorProps {
  companyId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

export function VehicleSelector({
  companyId,
  selectedIds,
  onChange,
  className = "",
}: VehicleSelectorProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [fleetFilter, setFleetFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, _setStatusFilter] = useState<string>("ALL");

  // Fetch fleets
  useEffect(() => {
    const fetchFleets = async () => {
      try {
        const response = await fetch(`/api/fleets?limit=100&active=true`, {
          headers: { "x-company-id": companyId },
        });
        if (response.ok) {
          const data = await response.json();
          setFleets(data.data || []);
        }
      } catch (error) {
        console.error("Failed to fetch fleets:", error);
      }
    };

    fetchFleets();
  }, [companyId]);

  // Fetch available vehicles
  useEffect(() => {
    const fetchVehicles = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.append("limit", "100");
        params.append("active", "true");

        if (fleetFilter !== "ALL") {
          params.append("fleetId", fleetFilter);
        }

        const response = await fetch(`/api/vehicles/available?${params}`, {
          headers: { "x-company-id": companyId },
        });

        if (response.ok) {
          const data = await response.json();
          setVehicles(data.data || []);
        }
      } catch (error) {
        console.error("Failed to fetch vehicles:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchVehicles();
  }, [companyId, fleetFilter]);

  // Get unique vehicle types - use toSorted for immutability
  const vehicleTypes = Array.from(
    new Set(vehicles.map((v) => v.type)),
  ).toSorted();

  // Create Set for O(1) lookups - React Compiler handles memoization
  const selectedIdsSet = new Set(selectedIds);

  // Filter vehicles
  const filteredVehicles = vehicles.filter((vehicle) => {
    const matchesSearch =
      searchQuery === "" ||
      vehicle.plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.type.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = typeFilter === "ALL" || vehicle.type === typeFilter;

    const matchesStatus =
      statusFilter === "ALL" || vehicle.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  // Handle select all
  const handleSelectAll = () => {
    const allIdsSet = new Set(filteredVehicles.map((v) => v.id));
    const allSelected = filteredVehicles.every((v) => selectedIdsSet.has(v.id));

    if (allSelected) {
      // Deselect all filtered vehicles
      onChange(selectedIds.filter((id) => !allIdsSet.has(id)));
    } else {
      // Select all filtered vehicles
      const allIds = filteredVehicles.map((v) => v.id);
      onChange([...new Set([...selectedIds, ...allIds])]);
    }
  };

  // Handle individual selection
  const handleToggle = (id: string) => {
    if (selectedIdsSet.has(id)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const allFilteredSelected =
    filteredVehicles.length > 0 &&
    filteredVehicles.every((v) => selectedIdsSet.has(v.id));
  const _someFilteredSelected =
    filteredVehicles.some((v) => selectedIdsSet.has(v.id)) &&
    !allFilteredSelected;

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <Label className="text-base font-semibold">Select Vehicles</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Choose the vehicles that will be used for route optimization. Only
          available vehicles are shown.
        </p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by plate or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <Select value={fleetFilter} onValueChange={setFleetFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by fleet" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Fleets</SelectItem>
            {fleets.map((fleet) => (
              <SelectItem key={fleet.id} value={fleet.id}>
                {fleet.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            {vehicleTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Select all */}
      {filteredVehicles.length > 0 && (
        <div className="flex items-center space-x-2 p-3 border rounded-lg bg-muted/20">
          <Checkbox
            id="select-all-vehicles"
            checked={allFilteredSelected}
            onCheckedChange={handleSelectAll}
          />
          <Label htmlFor="select-all-vehicles" className="cursor-pointer">
            {allFilteredSelected
              ? "Deselect all filtered"
              : "Select all filtered"}
            <span className="text-muted-foreground ml-2">
              ({filteredVehicles.length} vehicles)
            </span>
          </Label>
        </div>
      )}

      {/* Vehicle list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No vehicles match your filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
          {filteredVehicles.map((vehicle) => (
            <Card
              key={vehicle.id}
              className={`p-4 cursor-pointer transition-colors hover:bg-muted/50 ${
                selectedIdsSet.has(vehicle.id)
                  ? "border-primary bg-primary/5"
                  : ""
              }`}
              onClick={() => handleToggle(vehicle.id)}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selectedIdsSet.has(vehicle.id)}
                  onCheckedChange={() => handleToggle(vehicle.id)}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{vehicle.plate}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      {vehicle.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {vehicle.type}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      <span>{vehicle.weightCapacity}kg</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Fuel className="w-3 h-3" />
                      <span>{vehicle.volumeCapacity}L</span>
                    </div>
                  </div>
                  {vehicle.fleet && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Fleet: {vehicle.fleet.name}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="p-3 bg-muted rounded-lg">
        <p className="text-sm font-medium">
          {selectedIds.length} vehicle{selectedIds.length !== 1 ? "s" : ""}{" "}
          selected
        </p>
      </div>
    </div>
  );
}
