"use client";

import { useMemo } from "react";
import { useApiData } from "@/hooks/use-api";
import { useCompanyContext } from "@/hooks/use-company-context";
import { getZoneForOrder, type ZoneData } from "@/lib/geo/zone-utils";

interface ZoneApiRow {
  id: string;
  name: string;
  geometry: unknown;
  active: boolean;
  type?: string;
  color?: string;
  activeDays?: string[] | null;
}

/**
 * Loads the company's RESTRICTED zones via SWR and exposes a synchronous
 * `checkPoint(lat, lng)` so forms (orders, edit dialogs) can surface a
 * warning the moment the operator types coordinates that fall inside a
 * no-delivery polygon.
 *
 * SWR dedupes the request, so several forms mounting on the same page — or
 * StrictMode's double-mount in dev — share a single fetch.
 */
export function useRestrictedZones() {
  const { effectiveCompanyId } = useCompanyContext();

  const { data: rows = [] } = useApiData<ZoneApiRow[]>(
    effectiveCompanyId ? "/api/zones?type=RESTRICTED&active=true" : null,
    effectiveCompanyId,
  );

  const zones = useMemo<ZoneData[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        geometry: r.geometry,
        active: r.active,
        type: r.type ?? "DELIVERY",
        color: r.color,
        activeDays: r.activeDays,
      })),
    [rows],
  );

  const checkPoint = useMemo(() => {
    return (
      lat: number,
      lng: number,
    ): { inRestricted: boolean; zoneName?: string } => {
      if (zones.length === 0) return { inRestricted: false };
      const matched = getZoneForOrder(
        { id: "_check", latitude: lat, longitude: lng },
        zones,
      );
      if (matched?.type === "RESTRICTED") {
        return { inRestricted: true, zoneName: matched.name };
      }
      return { inRestricted: false };
    };
  }, [zones]);

  return { checkPoint, hasRestrictedZones: zones.length > 0 };
}
