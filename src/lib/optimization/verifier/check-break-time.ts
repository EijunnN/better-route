import type { VerifierFn, Violation } from "./types";
import { hhmmToSeconds, vehicleById } from "./utils";

/**
 * Verifies the break (lunch/rest) of every routed vehicle that has one
 * configured, on two levels:
 *
 *  1. CONFIG FEASIBILITY — the window is well-formed (end > start), long
 *     enough to hold the break, and inside the workday. An infeasible config
 *     means VROOM can never place the break.
 *  2. ACTUAL PLACEMENT — using the solver's `break` steps propagated onto the
 *     route (`route.breaks`): if the config is fine but the solver placed no
 *     break of the right length inside the window, it couldn't fit it (the
 *     break tightened the schedule and likely pushed orders to unassigned).
 *
 * Placement is only checked when breaks were propagated (a VROOM route); the
 * greedy fallback doesn't emit them, so we don't false-positive there.
 * Emitted as SOFT — a missing break is a labour-compliance / schedule concern,
 * not a corruption of the delivery plan.
 */
export const checkBreakTime: VerifierFn = ({ vehicles, plan }) => {
  const violations: Violation[] = [];
  const vehicleMap = vehicleById(vehicles);

  // Only the vehicles that actually produced a route this run.
  const routedVehicleIds = new Set(plan.routes.map((r) => r.vehicleId));

  for (const vehicleId of routedVehicleIds) {
    const vehicle = vehicleMap.get(vehicleId);
    if (!vehicle?.hasBreakTime) continue;

    const durationSec = (vehicle.breakDuration ?? 0) * 60;
    const winStart = hhmmToSeconds(vehicle.breakTimeStart);
    const winEnd = hhmmToSeconds(vehicle.breakTimeEnd);
    const dayStart = hhmmToSeconds(vehicle.timeWindowStart);
    const dayEnd = hhmmToSeconds(vehicle.timeWindowEnd);

    const base = {
      vehicleId,
      vehicleIdentifier: vehicle.identifier,
      context: {
        breakDuration: vehicle.breakDuration,
        breakTimeStart: vehicle.breakTimeStart,
        breakTimeEnd: vehicle.breakTimeEnd,
        workdayStart: vehicle.timeWindowStart,
        workdayEnd: vehicle.timeWindowEnd,
      },
    } as const;

    // ── 1. Config feasibility ──────────────────────────────────────────

    // Enabled break with a missing/invalid window or duration.
    if (
      durationSec <= 0 ||
      winStart === null ||
      winEnd === null ||
      winEnd <= winStart
    ) {
      violations.push({
        code: "BREAK_TIME_NOT_TAKEN",
        severity: "SOFT",
        message:
          "El descanso está activado pero su ventana o duración es inválida; VROOM no podrá colocarlo.",
        ...base,
      });
      continue;
    }

    // Window can't physically hold the break.
    if (winEnd - winStart < durationSec) {
      violations.push({
        code: "BREAK_TIME_NOT_TAKEN",
        severity: "SOFT",
        expected: `ventana de descanso >= ${vehicle.breakDuration} min`,
        actual: `${Math.round((winEnd - winStart) / 60)} min`,
        message:
          "La ventana de descanso es más corta que la duración del descanso: no cabe.",
        ...base,
      });
      continue;
    }

    // Window falls (partly) outside the vehicle's workday.
    if (
      (dayStart !== null && winStart < dayStart) ||
      (dayEnd !== null && winEnd > dayEnd)
    ) {
      violations.push({
        code: "BREAK_TIME_NOT_TAKEN",
        severity: "SOFT",
        expected: `dentro de la jornada ${vehicle.timeWindowStart}–${vehicle.timeWindowEnd}`,
        actual: `descanso ${vehicle.breakTimeStart}–${vehicle.breakTimeEnd}`,
        message: "La ventana de descanso cae fuera de la jornada del vehículo.",
        ...base,
      });
      continue;
    }

    // ── 2. Actual placement (only on VROOM routes that carry break steps) ─

    const routes = plan.routes.filter((r) => r.vehicleId === vehicleId);
    const placementKnown = routes.some((r) => r.breaks !== undefined);
    if (!placementKnown) continue; // non-VROOM path: can't verify placement

    const breaks = routes.flatMap((r) => r.breaks ?? []);
    const placed = breaks.some((b) => {
      if (b.durationSeconds < durationSec - 60) return false;
      const start = hhmmToSeconds(b.arrival);
      // Duration is enough; if we know when it landed, it must be in-window.
      return start === null || (start >= winStart - 60 && start <= winEnd + 60);
    });

    if (!placed) {
      violations.push({
        code: "BREAK_TIME_NOT_TAKEN",
        severity: "SOFT",
        expected: `descanso de ${vehicle.breakDuration} min en ${vehicle.breakTimeStart}–${vehicle.breakTimeEnd}`,
        actual: breaks.length
          ? "descanso fuera de la ventana o más corto de lo configurado"
          : "el solver no colocó ningún descanso",
        message:
          "El descanso configurado no fue colocado por el solver dentro de su ventana (probablemente no había holgura).",
        ...base,
      });
    }
  }

  return violations;
};
