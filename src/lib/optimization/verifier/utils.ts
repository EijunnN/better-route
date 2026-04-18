import type { OptimizerVehicle, OptimizerOrder } from "../optimizer-interface";

/** Parse "HH:MM" or "HH:MM:SS" or ISO string → seconds since 00:00. Returns null if unparseable. */
export function hhmmToSeconds(value: string | undefined | null): number | null {
  if (!value) return null;
  // Take time portion if ISO datetime
  const timePart = value.includes("T") ? value.split("T")[1] ?? "" : value;
  const clean = timePart.slice(0, 8); // HH:MM or HH:MM:SS
  const parts = clean.split(":");
  if (parts.length < 2) return null;
  const h = Number.parseInt(parts[0], 10);
  const m = Number.parseInt(parts[1], 10);
  const s = parts[2] ? Number.parseInt(parts[2], 10) : 0;
  if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return null;
  return h * 3600 + m * 60 + s;
}

export function secondsToHHMM(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Resolve arrival time from solver output. VROOM returns epoch seconds for a
 * given reference date; when the date is normalized this falls in 0..86400,
 * so we treat arrivalTime as "seconds since 00:00" for verifier purposes.
 *
 * If the solver ever reports absolute timestamps > 86400 we modulo-normalize.
 */
export function normalizeArrivalSeconds(
  arrivalTime: number | undefined,
): number | null {
  if (arrivalTime === undefined || arrivalTime === null) return null;
  if (!Number.isFinite(arrivalTime)) return null;
  if (arrivalTime < 0) return null;
  // If the solver gave us a full epoch value, reduce to time-of-day
  if (arrivalTime > 86400 * 2) return arrivalTime % 86400;
  return arrivalTime;
}

export function vehicleById(vehicles: OptimizerVehicle[]) {
  const map = new Map<string, OptimizerVehicle>();
  for (const v of vehicles) map.set(v.id, v);
  return map;
}

export function orderById(orders: OptimizerOrder[]) {
  const map = new Map<string, OptimizerOrder>();
  for (const o of orders) map.set(o.id, o);
  return map;
}

export function sumBy<T>(items: T[], selector: (t: T) => number): number {
  let total = 0;
  for (const it of items) total += selector(it) || 0;
  return total;
}
