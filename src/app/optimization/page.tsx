"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DepotSelector } from "@/components/optimization/depot-selector";
import { VehicleSelector } from "@/components/optimization/vehicle-selector";
import { DriverSelector } from "@/components/optimization/driver-selector";
import { Loader2, Settings, ArrowRight } from "lucide-react";
import type { DepotLocationInput } from "@/lib/validations/optimization-config";

const DEFAULT_COMPANY_ID = "default-company";

// Time window strictness options
const STRICTNESS_OPTIONS = [
  { value: "HARD", label: "Hard", description: "Reject any violations of time windows" },
  { value: "SOFT", label: "Soft", description: "Minimize delays with penalty factor" },
];

// Optimization objective options
const OBJECTIVE_OPTIONS = [
  { value: "DISTANCE", label: "Distance", description: "Minimize total distance traveled" },
  { value: "TIME", label: "Time", description: "Minimize total time" },
  { value: "BALANCED", label: "Balanced", description: "Balance distance and time" },
];

export default function OptimizationPage() {
  const router = useRouter();
  const [step, setStep] = useState<"resources" | "settings">("resources");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resource selection
  const [depotLocation, setDepotLocation] = useState<DepotLocationInput>({
    latitude: "",
    longitude: "",
    address: "",
  });
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);

  // Settings
  const [configName, setConfigName] = useState("");
  const [objective, setObjective] = useState("BALANCED");
  const [capacityEnabled, setCapacityEnabled] = useState(true);
  const [workWindowStart, setWorkWindowStart] = useState("08:00");
  const [workWindowEnd, setWorkWindowEnd] = useState("18:00");
  const [serviceTimeMinutes, setServiceTimeMinutes] = useState(10);
  const [timeWindowStrictness, setTimeWindowStrictness] = useState("SOFT");
  const [penaltyFactor, setPenaltyFactor] = useState(3);
  const [maxRoutes, setMaxRoutes] = useState<number | undefined>(undefined);

  const canProceedToSettings =
    depotLocation.latitude &&
    depotLocation.longitude &&
    selectedVehicleIds.length > 0 &&
    selectedDriverIds.length > 0;

  const handleSubmit = async () => {
    if (!canProceedToSettings || !configName) {
      setError("Please complete all required fields");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/optimization/configure", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": DEFAULT_COMPANY_ID,
        },
        body: JSON.stringify({
          name: configName,
          depotLatitude: depotLocation.latitude,
          depotLongitude: depotLocation.longitude,
          depotAddress: depotLocation.address,
          selectedVehicleIds: JSON.stringify(selectedVehicleIds),
          selectedDriverIds: JSON.stringify(selectedDriverIds),
          objective,
          capacityEnabled,
          workWindowStart,
          workWindowEnd,
          serviceTimeMinutes,
          timeWindowStrictness,
          penaltyFactor,
          maxRoutes,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create configuration");
      }

      const data = await response.json();
      router.push(`/optimization/${data.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Route Optimization</h1>
        <p className="text-muted-foreground mt-2">
          Configure your depot location, select vehicles and drivers, then customize optimization settings.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg">
          {error}
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => setStep("resources")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            step === "resources"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <Settings className="w-4 h-4" />
          Step 1: Resources
        </button>
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
        <button
          onClick={() => canProceedToSettings && setStep("settings")}
          disabled={!canProceedToSettings}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            step === "settings"
              ? "bg-primary text-primary-foreground"
              : canProceedToSettings
              ? "bg-muted text-muted-foreground hover:bg-muted/80"
              : "bg-muted/50 text-muted-foreground cursor-not-allowed"
          }`}
        >
          <Settings className="w-4 h-4" />
          Step 2: Settings
        </button>
      </div>

      {step === "resources" && (
        <div className="space-y-8">
          {/* Depot Location */}
          <Card>
            <CardHeader>
              <CardTitle>Depot Location</CardTitle>
              <CardDescription>
                Set the starting point for all routes. Click on the map or enter coordinates manually.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DepotSelector
                value={depotLocation}
                onChange={setDepotLocation}
              />
            </CardContent>
          </Card>

          {/* Vehicle Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Vehicle Selection</CardTitle>
              <CardDescription>
                Select available vehicles for route optimization. Vehicles must be in AVAILABLE status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <VehicleSelector
                companyId={DEFAULT_COMPANY_ID}
                selectedIds={selectedVehicleIds}
                onChange={setSelectedVehicleIds}
              />
            </CardContent>
          </Card>

          {/* Driver Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Driver Selection</CardTitle>
              <CardDescription>
                Select available drivers. Drivers with expired licenses are automatically filtered out.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DriverSelector
                companyId={DEFAULT_COMPANY_ID}
                selectedIds={selectedDriverIds}
                onChange={setSelectedDriverIds}
              />
            </CardContent>
          </Card>

          {/* Continue button */}
          <div className="flex justify-end">
            <Button
              size="lg"
              disabled={!canProceedToSettings}
              onClick={() => setStep("settings")}
            >
              Continue to Settings
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {step === "settings" && (
        <div className="space-y-8">
          {/* Configuration Name */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration Name</CardTitle>
              <CardDescription>
                Give this optimization configuration a recognizable name.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="config-name">Name *</Label>
                <Input
                  id="config-name"
                  placeholder="e.g., Morning Delivery Routes"
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Optimization Strategy */}
          <Card>
            <CardHeader>
              <CardTitle>Optimization Strategy</CardTitle>
              <CardDescription>
                Choose what the optimization algorithm should prioritize.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Objective</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {OBJECTIVE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setObjective(option.value)}
                      className={`p-4 rounded-lg border-2 text-left transition-colors ${
                        objective === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="font-medium">{option.label}</p>
                      <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="penalty-factor">Penalty Factor: {penaltyFactor}x</Label>
                <p className="text-sm text-muted-foreground">
                  Higher values prioritize meeting time windows over efficiency (1-20).
                </p>
                <input
                  id="penalty-factor"
                  type="range"
                  min="1"
                  max="20"
                  value={penaltyFactor}
                  onChange={(e) => setPenaltyFactor(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-routes">Maximum Routes (optional)</Label>
                <Input
                  id="max-routes"
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={maxRoutes || ""}
                  onChange={(e) => setMaxRoutes(e.target.value ? Number(e.target.value) : undefined)}
                />
                <p className="text-sm text-muted-foreground">
                  Leave empty for unlimited routes
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Capacity Constraints */}
          <Card>
            <CardHeader>
              <CardTitle>Capacity Constraints</CardTitle>
              <CardDescription>
                Enable or disable capacity and skill constraints during optimization.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="capacity-enabled"
                  checked={capacityEnabled}
                  onChange={(e) => setCapacityEnabled(e.target.checked)}
                  className="w-4 h-4"
                />
                <Label htmlFor="capacity-enabled" className="cursor-pointer">
                  Enable capacity constraints
                </Label>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                When enabled, the algorithm will respect vehicle weight/volume limits and required skills.
              </p>
            </CardContent>
          </Card>

          {/* Time Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Time Settings</CardTitle>
              <CardDescription>
                Configure the work window and time window handling.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="work-start">Work Window Start</Label>
                  <Input
                    id="work-start"
                    type="time"
                    value={workWindowStart}
                    onChange={(e) => setWorkWindowStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="work-end">Work Window End</Label>
                  <Input
                    id="work-end"
                    type="time"
                    value={workWindowEnd}
                    onChange={(e) => setWorkWindowEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="service-time">Service Time (minutes)</Label>
                <Input
                  id="service-time"
                  type="number"
                  min="1"
                  value={serviceTimeMinutes}
                  onChange={(e) => setServiceTimeMinutes(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label>Time Window Strictness</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {STRICTNESS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTimeWindowStrictness(option.value)}
                      className={`p-4 rounded-lg border-2 text-left transition-colors ${
                        timeWindowStrictness === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="font-medium">{option.label}</p>
                      <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Vehicles</dt>
                  <dd className="font-medium">{selectedVehicleIds.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Drivers</dt>
                  <dd className="font-medium">{selectedDriverIds.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Depot</dt>
                  <dd className="font-medium">
                    {depotLocation.latitude}, {depotLocation.longitude}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Work Window</dt>
                  <dd className="font-medium">
                    {workWindowStart} - {workWindowEnd}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep("resources")}
            >
              Back to Resources
            </Button>
            <Button
              size="lg"
              onClick={handleSubmit}
              disabled={isSubmitting || !configName}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Configuration"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
