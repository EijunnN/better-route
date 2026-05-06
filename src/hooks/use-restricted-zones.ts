"use client";

import { useEffect, useMemo, useState } from "react";
import { getZoneForOrder, type ZoneData } from "@/lib/geo/zone-utils";
import { useCompanyContext } from "@/hooks/use-company-context";

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
 * Loads the company's RESTRICTED zones once on mount and exposes a
 * synchronous `check(lat, lng)` so forms (orders, edit dialogs) can
 * surface a warning the moment the operator types coordinates that
 * fall inside a no-delivery polygon.
 *
 * The list is small (zones-per-company is typically <50) so we keep
 * it in component state instead of a global cache. If multiple forms
 * end up needing this on the same page we can promote to a SWR key.
 */
export function useRestrictedZones() {
  const { effectiveCompanyId } = useCompanyContext();
  const [zones, setZones] = useState<ZoneData[]>([]);

  useEffect(() => {
    if (!effectiveCompanyId) {
      setZones([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/zones?type=RESTRICTED&active=true", {
          headers: { "x-company-id": effectiveCompanyId },
        });
        if (!res.ok) return;
        const json = await res.json();
        const rows = (json.data ?? []) as ZoneApiRow[];
        if (cancelled) return;
        setZones(
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            geometry: r.geometry,
            active: r.active,
            type: r.type ?? "DELIVERY",
            color: r.color,
            activeDays: r.activeDays,
          })),
        );
      } catch {
        // Form should still work if zones can't be loaded — the
        // check just won't fire any warning.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveCompanyId]);

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
