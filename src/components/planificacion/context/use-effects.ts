"use client";

import { useEffect } from "react";
import type { Order, Zone, FieldDefinition } from "../planificacion-types";
import type { PlanificacionStateBag } from "./use-state";

interface EffectsDeps {
  state: PlanificacionStateBag;
  companyId: string | null;
}

/**
 * Wires up data loaders and side effects.
 *
 * Exposes the individual loader functions (notably `loadOrders`) so actions
 * that need to refresh data (e.g. CSV upload) can call them without
 * duplicating the fetch logic.
 */
export function usePlanificacionEffects(deps: EffectsDeps) {
  const { state, companyId } = deps;
  const {
    fleetFilter,
    setFleets,
    setVehicles,
    setVehiclesLoading,
    setOrders,
    setSelectedOrderIds,
    setOrdersLoading,
    setZones,
    setCompanyProfile,
    setFieldDefinitions,
    setAvailablePresets,
    setOptimizationPresetId,
  } = state;

  // Data loaders
  const loadFleets = async (signal?: AbortSignal) => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/fleets?limit=100&active=true", {
        headers: { "x-company-id": companyId },
        signal,
      });
      if (response.ok) {
        const data = await response.json();
        setFleets(data.data || []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch fleets:", err);
    }
  };

  const loadVehicles = async (signal?: AbortSignal) => {
    if (!companyId) return;
    setVehiclesLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (fleetFilter !== "ALL") {
        params.append("fleetId", fleetFilter);
      }
      const response = await fetch(`/api/vehicles/available?${params}`, {
        headers: { "x-company-id": companyId },
        signal,
      });
      if (response.ok) {
        const data = await response.json();
        setVehicles(data.data || []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch vehicles:", err);
    } finally {
      setVehiclesLoading(false);
    }
  };

  const loadOrders = async (signal?: AbortSignal) => {
    if (!companyId) return;
    setOrdersLoading(true);
    try {
      const limit = 100;
      const maxOrders = 5000;
      const maxBatches = Math.ceil(maxOrders / limit);

      const firstResponse = await fetch(
        `/api/orders?status=PENDING&active=true&limit=${limit}&offset=0`,
        { headers: { "x-company-id": companyId }, signal }
      );

      if (!firstResponse.ok) return;

      const firstData = await firstResponse.json();
      const firstBatch = firstData.data || [];

      if (firstBatch.length < limit) {
        setOrders(firstBatch);
        setSelectedOrderIds(firstBatch.map((o: Order) => o.id));
        return;
      }

      const batchPromises: Promise<Order[]>[] = [];
      for (let batch = 1; batch < maxBatches; batch++) {
        const offset = batch * limit;
        batchPromises.push(
          fetch(
            `/api/orders?status=PENDING&active=true&limit=${limit}&offset=${offset}`,
            { headers: { "x-company-id": companyId }, signal }
          ).then(async (res) => {
            if (!res.ok) return [];
            const data = await res.json();
            return data.data || [];
          })
        );
      }

      const batchResults = await Promise.all(batchPromises);
      const allOrders: Order[] = [...firstBatch];
      for (const batch of batchResults) {
        allOrders.push(...batch);
        if (batch.length < limit) break;
      }

      setOrders(allOrders);
      setSelectedOrderIds(allOrders.map((o: Order) => o.id));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch orders:", err);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadZones = async (signal?: AbortSignal) => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/zones?active=true&limit=100", {
        headers: { "x-company-id": companyId },
        signal,
      });
      if (response.ok) {
        const data = await response.json();
        const mappedZones: Zone[] = (data.data || [])
          .filter((z: { parsedGeometry: unknown }) => z.parsedGeometry)
          .map((z: {
            id: string;
            name: string;
            parsedGeometry: { type: string; coordinates: number[][][] };
            color: string | null;
            active: boolean;
            vehicleCount: number;
            vehicles: Array<{ id: string; plate: string | null }>;
          }) => ({
            id: z.id,
            name: z.name,
            geometry: z.parsedGeometry,
            color: z.color,
            active: z.active,
            vehicleCount: z.vehicleCount,
            vehicles: z.vehicles || [],
          }));
        setZones(mappedZones);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch zones:", err);
    }
  };

  const loadCompanyProfile = async (signal?: AbortSignal) => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/company-profiles", {
        headers: { "x-company-id": companyId },
        signal,
      });
      if (response.ok) {
        const data = await response.json();
        if (data.data?.profile) {
          setCompanyProfile({
            enableOrderValue: data.data.profile.enableOrderValue ?? false,
            enableWeight: data.data.profile.enableWeight ?? false,
            enableVolume: data.data.profile.enableVolume ?? false,
            enableUnits: data.data.profile.enableUnits ?? false,
            enableOrderType: data.data.profile.enableOrderType ?? false,
          });
        } else {
          setCompanyProfile({
            enableOrderValue: false,
            enableWeight: false,
            enableVolume: false,
            enableUnits: false,
            enableOrderType: false,
          });
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch company profile:", err);
      setCompanyProfile({
        enableOrderValue: false,
        enableWeight: false,
        enableVolume: false,
        enableUnits: false,
        enableOrderType: false,
      });
    }
  };

  const loadFieldDefinitions = async (signal?: AbortSignal) => {
    if (!companyId) return;
    try {
      const response = await fetch(`/api/companies/${companyId}/field-definitions?entity=orders`, {
        headers: { "x-company-id": companyId },
        signal,
      });
      if (response.ok) {
        const data = await response.json();
        setFieldDefinitions((data.data || []).filter((d: FieldDefinition) => d.active));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch field definitions:", err);
    }
  };

  const loadPresets = async (signal?: AbortSignal) => {
    if (!companyId) return;
    try {
      const response = await fetch("/api/optimization-presets", {
        headers: { "x-company-id": companyId },
        signal,
      });
      if (!response.ok) return;
      const data = await response.json();
      const presets = (data.data || []) as Array<{
        id: string;
        name: string;
        isDefault: boolean;
        active: boolean;
      }>;
      const activePresets = presets
        .filter((p) => p.active)
        .map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault }));
      setAvailablePresets(activePresets);
      // Pre-select the default so the UI matches what would have happened
      // under the legacy "always use isDefault" behavior.
      const defaultPreset = activePresets.find((p) => p.isDefault);
      if (defaultPreset) setOptimizationPresetId(defaultPreset.id);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch optimization presets:", err);
    }
  };

  // Initial data load
  useEffect(() => {
    if (!companyId) return;

    const controller = new AbortController();

    Promise.all([
      loadFleets(controller.signal),
      loadVehicles(controller.signal),
      loadOrders(controller.signal),
      loadZones(controller.signal),
      loadCompanyProfile(controller.signal),
      loadFieldDefinitions(controller.signal),
      loadPresets(controller.signal),
    ]).catch(() => {
      // Ignore abort errors
    });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, fleetFilter]);

  return { loadOrders };
}
