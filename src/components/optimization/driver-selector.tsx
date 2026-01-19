"use client";

import { AlertTriangle, Clock, Search, User } from "lucide-react";
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

interface Driver {
  id: string;
  name: string;
  identification: string;
  licenseNumber: string;
  licenseExpiry: string;
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

interface DriverSelectorProps {
  companyId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

export function DriverSelector({
  companyId,
  selectedIds,
  onChange,
  className = "",
}: DriverSelectorProps) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [fleetFilter, setFleetFilter] = useState<string>("ALL");
  const [licenseFilter, setLicenseFilter] = useState<string>("ALL");

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

  // Fetch available drivers
  useEffect(() => {
    const fetchDrivers = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.append("limit", "100");
        params.append("active", "true");
        params.append("status", "AVAILABLE");

        if (fleetFilter !== "ALL") {
          params.append("fleetId", fleetFilter);
        }

        const response = await fetch(`/api/drivers?${params}`, {
          headers: { "x-company-id": companyId },
        });

        if (response.ok) {
          const data = await response.json();
          setDrivers(data.data || []);
        }
      } catch (error) {
        console.error("Failed to fetch drivers:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDrivers();
  }, [companyId, fleetFilter]);

  // Create Set for O(1) lookups - React Compiler handles memoization
  const selectedIdsSet = new Set(selectedIds);

  // Check license expiry
  const getLicenseStatus = (
    expiryDate: string,
  ): "valid" | "warning" | "expired" => {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const daysUntilExpiry = Math.ceil(
      (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysUntilExpiry < 0) return "expired";
    if (daysUntilExpiry < 30) return "warning";
    return "valid";
  };

  // Filter drivers
  const filteredDrivers = drivers.filter((driver) => {
    const matchesSearch =
      searchQuery === "" ||
      driver.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      driver.identification.toLowerCase().includes(searchQuery.toLowerCase()) ||
      driver.licenseNumber.toLowerCase().includes(searchQuery.toLowerCase());

    const licenseStatus = getLicenseStatus(driver.licenseExpiry);
    const matchesLicense =
      licenseFilter === "ALL" ||
      (licenseFilter === "VALID" && licenseStatus === "valid") ||
      (licenseFilter === "WARNING" && licenseStatus === "warning") ||
      (licenseFilter === "EXPIRED" && licenseStatus === "expired");

    return matchesSearch && matchesLicense;
  });

  // Handle select all
  const handleSelectAll = () => {
    const allIdsSet = new Set(filteredDrivers.map((d) => d.id));
    const allSelected = filteredDrivers.every((d) => selectedIdsSet.has(d.id));

    if (allSelected) {
      onChange(selectedIds.filter((id) => !allIdsSet.has(id)));
    } else {
      const allIds = filteredDrivers.map((d) => d.id);
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
    filteredDrivers.length > 0 &&
    filteredDrivers.every((d) => selectedIdsSet.has(d.id));

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <Label className="text-base font-semibold">Select Drivers</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Choose the drivers that will be assigned to routes. Drivers with
          expired licenses are filtered out.
        </p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
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
        <Select value={licenseFilter} onValueChange={setLicenseFilter}>
          <SelectTrigger>
            <SelectValue placeholder="License status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Licenses</SelectItem>
            <SelectItem value="VALID">Valid</SelectItem>
            <SelectItem value="WARNING">Expiring Soon</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Select all */}
      {filteredDrivers.length > 0 && (
        <div className="flex items-center space-x-2 p-3 border rounded-lg bg-muted/20">
          <Checkbox
            id="select-all-drivers"
            checked={allFilteredSelected}
            onCheckedChange={handleSelectAll}
          />
          <Label htmlFor="select-all-drivers" className="cursor-pointer">
            {allFilteredSelected
              ? "Deselect all filtered"
              : "Select all filtered"}
            <span className="text-muted-foreground ml-2">
              ({filteredDrivers.length} drivers)
            </span>
          </Label>
        </div>
      )}

      {/* Driver list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filteredDrivers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No drivers match your filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
          {filteredDrivers.map((driver) => {
            const licenseStatus = getLicenseStatus(driver.licenseExpiry);
            const daysUntilExpiry = Math.ceil(
              (new Date(driver.licenseExpiry).getTime() - Date.now()) /
                (1000 * 60 * 60 * 24),
            );

            return (
              <Card
                key={driver.id}
                className={`p-4 cursor-pointer transition-colors hover:bg-muted/50 ${
                  selectedIdsSet.has(driver.id)
                    ? "border-primary bg-primary/5"
                    : ""
                } ${licenseStatus === "expired" ? "opacity-50" : ""}`}
                onClick={() =>
                  licenseStatus !== "expired" && handleToggle(driver.id)
                }
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedIdsSet.has(driver.id)}
                    disabled={licenseStatus === "expired"}
                    onCheckedChange={() => handleToggle(driver.id)}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{driver.name}</p>
                      {licenseStatus === "expired" && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Expired
                        </span>
                      )}
                      {licenseStatus === "warning" && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {daysUntilExpiry}d
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {driver.identification}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      License: {driver.licenseNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Expires:{" "}
                      {new Date(driver.licenseExpiry).toLocaleDateString()}
                    </p>
                    {driver.fleet && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Fleet: {driver.fleet.name}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Summary */}
      <div className="p-3 bg-muted rounded-lg">
        <p className="text-sm font-medium">
          {selectedIds.length} driver{selectedIds.length !== 1 ? "s" : ""}{" "}
          selected
        </p>
      </div>
    </div>
  );
}
