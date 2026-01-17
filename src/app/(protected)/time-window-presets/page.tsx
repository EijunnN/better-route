"use client";

import { useCallback, useEffect, useState } from "react";
import { useCompanyContext } from "@/hooks/use-company-context";
import { CompanySelector } from "@/components/company-selector";
import { ProtectedPage } from "@/components/auth/protected-page";
import {
  TimeWindowPresetForm,
  type TimeWindowPresetFormData,
} from "@/components/time-window-presets/time-window-preset-form";
import { Button } from "@/components/ui/button";
import type {
  TIME_WINDOW_STRICTNESS,
  TIME_WINDOW_TYPES,
} from "@/lib/validations/time-window-preset";

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
  createdAt: string;
  updatedAt: string;
}

function TimeWindowPresetsPageContent() {
  const {
    effectiveCompanyId: companyId,
    isReady,
    isSystemAdmin,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    authCompanyId,
  } = useCompanyContext();
  const [presets, setPresets] = useState<TimeWindowPreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPreset, setEditingPreset] = useState<TimeWindowPreset | null>(
    null,
  );

  const fetchPresets = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/time-window-presets", {
        headers: { "x-company-id": companyId ?? "" },
      });
      const result = await response.json();
      setPresets(result.data || []);
    } catch (error) {
      console.error("Failed to fetch presets:", error);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const handleCreate = async (data: TimeWindowPresetFormData) => {
    if (!companyId) return;
    const response = await fetch("/api/time-window-presets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": companyId ?? "",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create preset");
    }

    await fetchPresets();
    setShowForm(false);
  };

  const handleUpdate = async (data: TimeWindowPresetFormData) => {
    if (!editingPreset) return;
    if (!companyId) return;

    const response = await fetch(
      `/api/time-window-presets/${editingPreset.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-company-id": companyId ?? "",
        },
        body: JSON.stringify({ ...data, id: editingPreset.id }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update preset");
    }

    await fetchPresets();
    setEditingPreset(null);
    setShowForm(false);
  };

  const handleEdit = (preset: TimeWindowPreset) => {
    setEditingPreset(preset);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this preset?")) return;
    if (!companyId) return;

    const response = await fetch(`/api/time-window-presets/${id}`, {
      method: "DELETE",
      headers: { "x-company-id": companyId ?? "" },
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Failed to delete preset");
      return;
    }

    await fetchPresets();
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingPreset(null);
  };

  const formatTimeDisplay = (preset: TimeWindowPreset) => {
    if (preset.type === "EXACT") {
      return `${preset.exactTime} ±${preset.toleranceMinutes}min`;
    }
    return `${preset.startTime} - ${preset.endTime}`;
  };

  if (!isReady) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Time Window Presets</h1>
            <p className="text-muted-foreground mt-1">
              Manage reusable time window configurations for delivery scheduling
            </p>
          </div>
          <Button onClick={() => setShowForm(true)}>Create Preset</Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">Loading...</div>
        ) : presets.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/30">
            <p className="text-muted-foreground">
              No time window presets found.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first preset to get started.
            </p>
          </div>
        ) : (
          <div className="border rounded-lg">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-4 font-medium">Name</th>
                  <th className="text-left p-4 font-medium">Type</th>
                  <th className="text-left p-4 font-medium">Time Window</th>
                  <th className="text-left p-4 font-medium">Strictness</th>
                  <th className="text-left p-4 font-medium">Status</th>
                  <th className="text-right p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {presets.map((preset) => (
                  <tr key={preset.id} className="border-t">
                    <td className="p-4">{preset.name}</td>
                    <td className="p-4">
                      <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        {preset.type}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-sm">
                      {formatTimeDisplay(preset)}
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          preset.strictness === "HARD"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-yellow-500/10 text-yellow-600"
                        }`}
                      >
                        {preset.strictness}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          preset.active
                            ? "bg-green-500/10 text-green-600"
                            : "bg-gray-500/10 text-gray-600"
                        }`}
                      >
                        {preset.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(preset)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(preset.id)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showForm && (
          <TimeWindowPresetForm
            onSubmit={editingPreset ? handleUpdate : handleCreate}
            initialData={editingPreset || undefined}
            submitLabel={editingPreset ? "Update Preset" : "Create Preset"}
            onCancel={handleCloseForm}
          />
        )}
      </div>
    </div>
  );
}

export default function TimeWindowPresetsPage() {
  return (
    <ProtectedPage requiredPermission="time_window_presets:VIEW">
      <TimeWindowPresetsPageContent />
    </ProtectedPage>
  );
}
