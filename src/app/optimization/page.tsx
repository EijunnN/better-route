"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DepotSelector } from "@/components/optimization/depot-selector";
import { VehicleSelector } from "@/components/optimization/vehicle-selector";
import { DriverSelector } from "@/components/optimization/driver-selector";
import { CapacityConstraintsSummary } from "@/components/optimization/capacity-constraints-summary";
import { Loader2, Settings, ArrowRight, Save, FolderOpen } from "lucide-react";
import type { DepotLocationInput } from "@/lib/validations/optimization-config";

const DEFAULT_COMPANY_ID = "default-company";

// Preset interface
interface OptimizationPreset {
  id: string;
  name: string;
  objective: string;
  capacityEnabled: boolean;
  workWindowStart: string;
  workWindowEnd: string;
  serviceTimeMinutes: number;
  timeWindowStrictness: string;
  penaltyFactor: number;
  maxRoutes?: number;
  createdAt: string;
}

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

  // Presets management
  const [presets, setPresets] = useState<OptimizationPreset[]>([]);
  const [showPresetDialog, setShowPresetDialog] = useState<"save" | "load" | null>(null);
  const [presetName, setPresetName] = useState("");
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);
  const [presetError, setPresetError] = useState<string | null>(null);

  // Load presets on mount
  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    setIsLoadingPresets(true);
    setPresetError(null);
    try {
      const response = await fetch("/api/optimization/presets", {
        headers: { "x-company-id": DEFAULT_COMPANY_ID },
      });
      if (!response.ok) throw new Error("Failed to load presets");
      const data = await response.json();
      setPresets(data.data || []);
    } catch (err) {
      setPresetError(err instanceof Error ? err.message : "Failed to load presets");
    } finally {
      setIsLoadingPresets(false);
    }
  };

  const savePreset = async () => {
    if (!presetName.trim()) {
      setPresetError("Preset name is required");
      return;
    }

    setIsSubmitting(true);
    setPresetError(null);

    try {
      const response = await fetch("/api/optimization/presets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": DEFAULT_COMPANY_ID,
        },
        body: JSON.stringify({
          name: presetName,
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
        throw new Error(data.error || "Failed to save preset");
      }

      await loadPresets();
      setShowPresetDialog(null);
      setPresetName("");
    } catch (err) {
      setPresetError(err instanceof Error ? err.message : "Failed to save preset");
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadPreset = (preset: OptimizationPreset) => {
    setObjective(preset.objective);
    setCapacityEnabled(preset.capacityEnabled);
    setWorkWindowStart(preset.workWindowStart);
    setWorkWindowEnd(preset.workWindowEnd);
    setServiceTimeMinutes(preset.serviceTimeMinutes);
    setTimeWindowStrictness(preset.timeWindowStrictness);
    setPenaltyFactor(preset.penaltyFactor);
    setMaxRoutes(preset.maxRoutes);
    setShowPresetDialog(null);
  };

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
          {/* Preset Management */}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPresetDialog("load")}
              disabled={isLoadingPresets || presets.length === 0}
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Load Preset ({presets.length})
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPresetDialog("save")}
            >
              <Save className="w-4 h-4 mr-2" />
              Save as Preset
            </Button>
          </div>

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
                Choose what the optimization algorithm should prioritize and configure constraint behavior.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Objective</Label>
                <p className="text-sm text-muted-foreground">
                  Select the primary goal for route optimization.
                </p>
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
                <Label htmlFor="max-routes">Maximum Routes (optional)</Label>
                <p className="text-sm text-muted-foreground">
                  Limit the number of routes created. Leave empty for unlimited routes.
                </p>
                <Input
                  id="max-routes"
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={maxRoutes || ""}
                  onChange={(e) => setMaxRoutes(e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="penalty-factor">Penalty Factor: {penaltyFactor}x</Label>
                <p className="text-sm text-muted-foreground">
                  Higher values prioritize meeting time windows and constraints over route efficiency (1-20).
                  Used in SOFT mode to minimize delays and constraint violations.
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
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1x (More efficient)</span>
                  <span>10x</span>
                  <span>20x (Stricter compliance)</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Capacity Constraints */}
          <Card>
            <CardHeader>
              <CardTitle>Capacity Constraints</CardTitle>
              <CardDescription>
                Configure capacity and skill restrictions for route optimization.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                {/* Capacity Mode Toggle */}
                <div className="space-y-3">
                  <Label>Capacity Mode</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCapacityEnabled(true)}
                      className={`p-4 rounded-lg border-2 text-left transition-colors ${
                        capacityEnabled
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="font-medium">Capacitated</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Respects vehicle weight/volume limits and required skills. May result in unassigned orders.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCapacityEnabled(false)}
                      className={`p-4 rounded-lg border-2 text-left transition-colors ${
                        !capacityEnabled
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="font-medium">Non-Capacitated</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Faster optimization without capacity constraints. All orders will be assigned.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Pending Orders Summary */}
                <CapacityConstraintsSummary companyId={DEFAULT_COMPANY_ID} />
              </div>
            </CardContent>
          </Card>

          {/* Time Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Time Settings</CardTitle>
              <CardDescription>
                Configure the work window, service time, and time window handling.
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
                <p className="text-sm text-muted-foreground">
                  Time spent at each delivery location. Default is 10 minutes.
                </p>
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
                <p className="text-sm text-muted-foreground">
                  Choose how the optimizer should handle promised delivery times. When using SOFT mode, the penalty factor from Strategy settings will be applied.
                </p>
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

      {/* Preset Dialog */}
      {showPresetDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-lg max-w-md w-full max-h-[80vh] overflow-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {showPresetDialog === "save" ? "Save Configuration as Preset" : "Load Configuration Preset"}
              </h2>

              {presetError && (
                <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                  {presetError}
                </div>
              )}

              {showPresetDialog === "save" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="preset-name">Preset Name</Label>
                    <Input
                      id="preset-name"
                      placeholder="e.g., Morning Urban Delivery"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    This will save your current optimization settings (objective, capacity, time settings) as a reusable preset.
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-auto">
                  {isLoadingPresets ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : presets.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No saved presets found. Create one by saving your current configuration.
                    </div>
                  ) : (
                    presets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => loadPreset(preset)}
                        className="w-full p-3 rounded-lg border text-left hover:bg-accent transition-colors"
                      >
                        <div className="font-medium">{preset.name.replace("Preset: ", "")}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {preset.objective} • {preset.capacityEnabled ? "Capacitated" : "Non-Capacitated"} •{" "}
                          {preset.workWindowStart}-{preset.workWindowEnd}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Penalty: {preset.penaltyFactor}x • {preset.timeWindowStrictness}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPresetDialog(null);
                    setPresetError(null);
                    setPresetName("");
                  }}
                >
                  Cancel
                </Button>
                {showPresetDialog === "save" && (
                  <Button
                    onClick={savePreset}
                    disabled={isSubmitting || !presetName.trim()}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Preset"
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
