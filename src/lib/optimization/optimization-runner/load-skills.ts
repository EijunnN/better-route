/**
 * Skills ↔ VROOM plumbing for the optimization runner.
 *
 * This exists to close the gap between what the user configures in the UI
 * (`/vehicle-skills`, `/user-skills`, and the `requiredSkills` field on an
 * order) and what the solver actually sees. Without these helpers, skills
 * were stored in DB but never reached VROOM — so the solver assigned freely
 * and the verifier detected violations after the plan was already out.
 *
 * VROOM matches skills as a set: every code in `order.skillsRequired` must
 * appear in the assigned vehicle's `skills`. We use the skill `code` (e.g.
 * "REFRIGERADO") as the matching key — `vroom-optimizer.ts` hashes strings
 * to the numeric IDs VROOM needs, so we keep the human codes until that
 * layer.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { vehicleSkillAssignments, vehicleSkills } from "@/db/schema";

/**
 * Split the CSV text stored in `orders.required_skills` into an array of
 * trimmed, uppercased codes. Empty strings/unknown shapes → empty array.
 */
export function parseRequiredSkills(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Fetch active skill codes for a batch of vehicles in a single query.
 * Returns a map keyed by `vehicleId`. Vehicles with no active skills are
 * simply absent — callers treat missing as `[]`.
 */
export async function loadVehicleSkillsMap(
  vehicleIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (vehicleIds.length === 0) return map;

  const rows = await db
    .select({
      vehicleId: vehicleSkillAssignments.vehicleId,
      code: vehicleSkills.code,
    })
    .from(vehicleSkillAssignments)
    .innerJoin(vehicleSkills, eq(vehicleSkillAssignments.skillId, vehicleSkills.id))
    .where(
      and(
        inArray(vehicleSkillAssignments.vehicleId, vehicleIds),
        eq(vehicleSkillAssignments.active, true),
        eq(vehicleSkills.active, true),
      ),
    );

  for (const row of rows) {
    const list = map.get(row.vehicleId);
    if (list) {
      list.push(row.code);
    } else {
      map.set(row.vehicleId, [row.code]);
    }
  }
  return map;
}
