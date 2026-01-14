"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ORDER_STATUS,
  TIME_WINDOW_STRICTNESS,
} from "@/lib/validations/order";
import type { TIME_WINDOW_TYPES } from "@/lib/validations/time-window-preset";

export interface OrderFormData {
  trackingId: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  address: string;
  latitude: string;
  longitude: string;
  timeWindowPresetId?: string;
  strictness?: (typeof TIME_WINDOW_STRICTNESS)[number] | null;
  promisedDate?: string;
  weightRequired?: number;
  volumeRequired?: number;
  requiredSkills?: string;
  notes?: string;
  status?: (typeof ORDER_STATUS)[number];
  active?: boolean;
}

interface TimeWindowPreset {
  id: string;
  name: string;
  type: (typeof TIME_WINDOW_TYPES)[number];
  startTime: string | null;
  endTime: string | null;
  exactTime: string | null;
  toleranceMinutes: number | null;
  strictness: (typeof TIME_WINDOW_STRICTNESS)[number];
}

interface Order {
  id: string;
  trackingId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  address: string;
  latitude: string;
  longitude: string;
  timeWindowPresetId: string | null;
  strictness: (typeof TIME_WINDOW_STRICTNESS)[number] | null;
  promisedDate: string | null;
  weightRequired: number | null;
  volumeRequired: number | null;
  requiredSkills: string | null;
  notes: string | null;
  status: (typeof ORDER_STATUS)[number];
  active: boolean;
}

interface FormProps {
  onSubmit: (data: OrderFormData) => Promise<void>;
  initialData?: Order;
  submitLabel?: string;
  onCancel?: () => void;
}

const defaultData: OrderFormData = {
  trackingId: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  address: "",
  latitude: "",
  longitude: "",
  timeWindowPresetId: "",
  strictness: null,
  promisedDate: "",
  weightRequired: undefined,
  volumeRequired: undefined,
  requiredSkills: "",
  notes: "",
  status: "PENDING",
  active: true,
};

const DEMO_COMPANY_ID = "demo-company-id";

export function OrderForm({
  onSubmit,
  initialData,
  submitLabel = "Create Order",
  onCancel,
}: FormProps) {
  const [formData, setFormData] = useState<OrderFormData>(defaultData);
  const [timeWindowPresets, setTimeWindowPresets] = useState<
    TimeWindowPreset[]
  >([]);
  const [selectedPreset, setSelectedPreset] = useState<TimeWindowPreset | null>(
    null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingPresets, setIsLoadingPresets] = useState(true);

  useEffect(() => {
    // Fetch time window presets
    const fetchPresets = async () => {
      try {
        const response = await fetch("/api/time-window-presets", {
          headers: { "x-company-id": DEMO_COMPANY_ID },
        });
        const result = await response.json();
        setTimeWindowPresets(result.data || []);
      } catch (error) {
        console.error("Failed to fetch presets:", error);
      } finally {
        setIsLoadingPresets(false);
      }
    };
    fetchPresets();
  }, []);

  useEffect(() => {
    if (initialData) {
      const initialFormData: OrderFormData = {
        trackingId: initialData.trackingId,
        customerName: initialData.customerName || "",
        customerPhone: initialData.customerPhone || "",
        customerEmail: initialData.customerEmail || "",
        address: initialData.address,
        latitude: initialData.latitude,
        longitude: initialData.longitude,
        timeWindowPresetId: initialData.timeWindowPresetId || "",
        strictness: initialData.strictness || null,
        promisedDate: initialData.promisedDate || "",
        weightRequired: initialData.weightRequired || undefined,
        volumeRequired: initialData.volumeRequired || undefined,
        requiredSkills: initialData.requiredSkills || "",
        notes: initialData.notes || "",
        status: initialData.status,
        active: initialData.active,
      };
      setFormData(initialFormData);

      // Set selected preset
      if (initialData.timeWindowPresetId) {
        const preset = timeWindowPresets.find(
          (p) => p.id === initialData.timeWindowPresetId,
        );
        if (preset) setSelectedPreset(preset);
      }
    }
  }, [initialData, timeWindowPresets]);

  const handleChange = (
    field: keyof OrderFormData,
    value: string | number | boolean | null,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const presetId = e.target.value;
    handleChange("timeWindowPresetId", presetId);

    const preset = timeWindowPresets.find((p) => p.id === presetId);
    setSelectedPreset(preset || null);

    // Reset strictness to inherit from new preset
    if (preset) {
      handleChange("strictness", null);
    }
  };

  const handleStrictnessChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "INHERIT") {
      handleChange("strictness", null);
    } else {
      handleChange(
        "strictness",
        value as (typeof TIME_WINDOW_STRICTNESS)[number],
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    try {
      await onSubmit(formData);
    } catch (error: any) {
      if (error.details) {
        const fieldErrors: Record<string, string> = {};
        error.details.forEach((detail: any) => {
          if (detail.path && detail.path.length > 0) {
            fieldErrors[detail.path[0]] = detail.message;
          }
        });
        setErrors(fieldErrors);
      } else {
        setErrors({ form: error.message || "Failed to save order" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const effectiveStrictness =
    formData.strictness || selectedPreset?.strictness || "HARD";
  const isOverridden = formData.strictness !== null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-8">
      <div className="bg-background rounded-lg shadow-lg max-w-2xl w-full p-6 my-auto">
        <h2 className="text-xl font-semibold mb-4">
          {initialData ? "Edit Order" : "Create Order"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic Information Section */}
          <div className="border-b pb-4">
            <h3 className="font-medium mb-3">Basic Information</h3>

            {/* Tracking ID */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="trackingId">Tracking ID *</Label>
                <Input
                  id="trackingId"
                  value={formData.trackingId}
                  onChange={(e) => handleChange("trackingId", e.target.value)}
                  placeholder="e.g., ORD-001"
                />
                {errors.trackingId && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.trackingId}
                  </p>
                )}
              </div>

              {/* Status */}
              <div>
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={formData.status}
                  onChange={(e) => handleChange("status", e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                >
                  <option value="PENDING">Pending</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="FAILED">Failed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Customer Information */}
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <Label htmlFor="customerName">Customer Name</Label>
                <Input
                  id="customerName"
                  value={formData.customerName}
                  onChange={(e) => handleChange("customerName", e.target.value)}
                  placeholder="John Doe"
                />
              </div>

              <div>
                <Label htmlFor="customerPhone">Phone</Label>
                <Input
                  id="customerPhone"
                  value={formData.customerPhone}
                  onChange={(e) =>
                    handleChange("customerPhone", e.target.value)
                  }
                  placeholder="+1 234 567 8900"
                />
              </div>
            </div>

            <div className="mt-3">
              <Label htmlFor="customerEmail">Email</Label>
              <Input
                id="customerEmail"
                type="email"
                value={formData.customerEmail}
                onChange={(e) => handleChange("customerEmail", e.target.value)}
                placeholder="john@example.com"
              />
              {errors.customerEmail && (
                <p className="text-sm text-destructive mt-1">
                  {errors.customerEmail}
                </p>
              )}
            </div>
          </div>

          {/* Location Section */}
          <div className="border-b pb-4">
            <h3 className="font-medium mb-3">Location</h3>

            <div>
              <Label htmlFor="address">Address *</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => handleChange("address", e.target.value)}
                placeholder="123 Main St, City, Country"
              />
              {errors.address && (
                <p className="text-sm text-destructive mt-1">
                  {errors.address}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <Label htmlFor="latitude">Latitude *</Label>
                <Input
                  id="latitude"
                  value={formData.latitude}
                  onChange={(e) => handleChange("latitude", e.target.value)}
                  placeholder="e.g., 40.7128"
                  step="any"
                />
                {errors.latitude && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.latitude}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="longitude">Longitude *</Label>
                <Input
                  id="longitude"
                  value={formData.longitude}
                  onChange={(e) => handleChange("longitude", e.target.value)}
                  placeholder="e.g., -74.0060"
                  step="any"
                />
                {errors.longitude && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.longitude}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Time Window Configuration Section */}
          <div className="border-b pb-4">
            <h3 className="font-medium mb-3">Time Window Configuration</h3>

            <div>
              <Label htmlFor="timeWindowPresetId">Time Window Preset</Label>
              {isLoadingPresets ? (
                <p className="text-sm text-muted-foreground">
                  Loading presets...
                </p>
              ) : (
                <select
                  id="timeWindowPresetId"
                  value={formData.timeWindowPresetId}
                  onChange={handlePresetChange}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                >
                  <option value="">No preset</option>
                  {timeWindowPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name} ({preset.type}, {preset.strictness})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedPreset && (
              <div className="mt-3 p-3 bg-muted/50 rounded-md">
                <p className="text-sm font-medium">Preset Details:</p>
                <p className="text-sm text-muted-foreground">
                  Type: {selectedPreset.type}
                  {selectedPreset.type === "EXACT"
                    ? ` - ${selectedPreset.exactTime} ±${selectedPreset.toleranceMinutes}min`
                    : ` - ${selectedPreset.startTime} - ${selectedPreset.endTime}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  Preset Strictness:{" "}
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      selectedPreset.strictness === "HARD"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-yellow-500/10 text-yellow-600"
                    }`}
                  >
                    {selectedPreset.strictness}
                  </span>
                </p>
              </div>
            )}

            <div className="mt-3">
              <Label htmlFor="strictness">Strictness</Label>
              <select
                id="strictness"
                value={formData.strictness || "INHERIT"}
                onChange={handleStrictnessChange}
                disabled={!selectedPreset}
                className="w-full px-3 py-2 border rounded-md bg-background disabled:opacity-50"
              >
                <option value="INHERIT">
                  {selectedPreset
                    ? `Inherit from preset (${selectedPreset.strictness})`
                    : "Select a preset first"}
                </option>
                <option value="HARD">Hard (reject violations)</option>
                <option value="SOFT">Soft (minimize delays)</option>
              </select>
              {isOverridden && selectedPreset && (
                <p className="text-sm text-amber-600 mt-1 flex items-center gap-1">
                  <span className="font-medium">Override:</span> This order will
                  use <span className="font-medium">{effectiveStrictness}</span>{" "}
                  strictness instead of the preset's {selectedPreset.strictness}
                </p>
              )}
            </div>

            <div className="mt-3">
              <Label htmlFor="promisedDate">Promised Date</Label>
              <Input
                id="promisedDate"
                type="date"
                value={formData.promisedDate}
                onChange={(e) => handleChange("promisedDate", e.target.value)}
              />
            </div>
          </div>

          {/* Capacity Requirements Section */}
          <div className="border-b pb-4">
            <h3 className="font-medium mb-3">
              Capacity Requirements (Optional)
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="weightRequired">Weight Required (kg)</Label>
                <Input
                  id="weightRequired"
                  type="number"
                  min="0"
                  value={formData.weightRequired || ""}
                  onChange={(e) =>
                    handleChange(
                      "weightRequired",
                      parseInt(e.target.value, 10) || 0,
                    )
                  }
                />
              </div>

              <div>
                <Label htmlFor="volumeRequired">Volume Required (m³)</Label>
                <Input
                  id="volumeRequired"
                  type="number"
                  min="0"
                  value={formData.volumeRequired || ""}
                  onChange={(e) =>
                    handleChange(
                      "volumeRequired",
                      parseInt(e.target.value, 10) || 0,
                    )
                  }
                />
              </div>
            </div>

            <div className="mt-3">
              <Label htmlFor="requiredSkills">
                Required Skills (comma-separated)
              </Label>
              <Input
                id="requiredSkills"
                value={formData.requiredSkills}
                onChange={(e) => handleChange("requiredSkills", e.target.value)}
                placeholder="e.g., REFRIGERATED, HEAVY_LIFT"
              />
            </div>
          </div>

          {/* Additional Information */}
          <div>
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              placeholder="Additional delivery instructions..."
              rows={3}
              className="w-full px-3 py-2 border rounded-md bg-background resize-none"
            />
          </div>

          {/* Active (only for edit) */}
          {initialData && (
            <div className="flex items-center gap-2">
              <input
                id="active"
                type="checkbox"
                checked={formData.active ?? true}
                onChange={(e) => handleChange("active", e.target.checked)}
              />
              <Label htmlFor="active" className="cursor-pointer">
                Active
              </Label>
            </div>
          )}

          {errors.form && (
            <p className="text-sm text-destructive">{errors.form}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
