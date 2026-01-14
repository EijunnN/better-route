"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  TIME_WINDOW_STRICTNESS,
  TIME_WINDOW_TYPES,
} from "@/lib/validations/time-window-preset";

export interface TimeWindowPresetFormData {
  name: string;
  type: (typeof TIME_WINDOW_TYPES)[number];
  startTime?: string;
  endTime?: string;
  exactTime?: string;
  toleranceMinutes?: number;
  strictness: (typeof TIME_WINDOW_STRICTNESS)[number];
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
  active: boolean;
}

interface FormProps {
  onSubmit: (data: TimeWindowPresetFormData) => Promise<void>;
  initialData?: TimeWindowPreset;
  submitLabel?: string;
  onCancel?: () => void;
}

const defaultData: TimeWindowPresetFormData = {
  name: "",
  type: "SHIFT",
  startTime: "",
  endTime: "",
  exactTime: "",
  toleranceMinutes: undefined,
  strictness: "HARD",
  active: true,
};

export function TimeWindowPresetForm({
  onSubmit,
  initialData,
  submitLabel = "Create Preset",
  onCancel,
}: FormProps) {
  const [formData, setFormData] = useState<TimeWindowPresetFormData>(
    initialData
      ? {
          name: initialData.name,
          type: initialData.type,
          startTime: initialData.startTime || undefined,
          endTime: initialData.endTime || undefined,
          exactTime: initialData.exactTime || undefined,
          toleranceMinutes: initialData.toleranceMinutes || undefined,
          strictness: initialData.strictness,
          active: initialData.active,
        }
      : defaultData,
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        type: initialData.type,
        startTime: initialData.startTime || undefined,
        endTime: initialData.endTime || undefined,
        exactTime: initialData.exactTime || undefined,
        toleranceMinutes: initialData.toleranceMinutes || undefined,
        strictness: initialData.strictness,
        active: initialData.active,
      });
    }
  }, [initialData]);

  const handleChange = (
    field: keyof TimeWindowPresetFormData,
    value: string | number | boolean,
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
        setErrors({ form: error.message || "Failed to save preset" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isShiftOrRange = formData.type === "SHIFT" || formData.type === "RANGE";
  const isExact = formData.type === "EXACT";

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    handleChange("type", e.target.value as (typeof TIME_WINDOW_TYPES)[number]);
  };

  const handleStrictnessChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    handleChange(
      "strictness",
      e.target.value as (typeof TIME_WINDOW_STRICTNESS)[number],
    );
  };

  const handleToleranceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleChange("toleranceMinutes", parseInt(e.target.value, 10) || 0);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg max-w-md w-full p-6">
        <h2 className="text-xl font-semibold mb-4">
          {initialData
            ? "Edit Time Window Preset"
            : "Create Time Window Preset"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="e.g., Morning Delivery, Afternoon Pickup"
            />
            {errors.name && (
              <p className="text-sm text-destructive mt-1">{errors.name}</p>
            )}
          </div>

          {/* Type */}
          <div>
            <Label htmlFor="type">Type</Label>
            <select
              id="type"
              value={formData.type}
              onChange={handleTypeChange}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="SHIFT">Shift (recurring time range)</option>
              <option value="RANGE">Range (one-time time range)</option>
              <option value="EXACT">
                Exact (specific time with tolerance)
              </option>
            </select>
            {errors.type && (
              <p className="text-sm text-destructive mt-1">{errors.type}</p>
            )}
          </div>

          {/* SHIFT and RANGE fields */}
          {isShiftOrRange && (
            <>
              <div>
                <Label htmlFor="startTime">Start Time</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={formData.startTime || ""}
                  onChange={(e) => handleChange("startTime", e.target.value)}
                />
                {errors.startTime && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.startTime}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="endTime">End Time</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={formData.endTime || ""}
                  onChange={(e) => handleChange("endTime", e.target.value)}
                />
                {errors.endTime && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.endTime}
                  </p>
                )}
              </div>
            </>
          )}

          {/* EXACT fields */}
          {isExact && (
            <>
              <div>
                <Label htmlFor="exactTime">Exact Time</Label>
                <Input
                  id="exactTime"
                  type="time"
                  value={formData.exactTime || ""}
                  onChange={(e) => handleChange("exactTime", e.target.value)}
                />
                {errors.exactTime && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.exactTime}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="toleranceMinutes">Tolerance (minutes)</Label>
                <Input
                  id="toleranceMinutes"
                  type="number"
                  min="0"
                  value={formData.toleranceMinutes || ""}
                  onChange={handleToleranceChange}
                />
                {errors.toleranceMinutes && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.toleranceMinutes}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Strictness */}
          <div>
            <Label htmlFor="strictness">Strictness</Label>
            <select
              id="strictness"
              value={formData.strictness}
              onChange={handleStrictnessChange}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="HARD">Hard (reject violations)</option>
              <option value="SOFT">Soft (minimize delays)</option>
            </select>
            {errors.strictness && (
              <p className="text-sm text-destructive mt-1">
                {errors.strictness}
              </p>
            )}
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
