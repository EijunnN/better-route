/**
 * Single source of truth for the `orders.required_skills` field.
 *
 * The column is plain `text` holding a CSV of skill codes (e.g.
 * "REFRIGERADO, FRAGIL"). Both the order form and the CSV import write it as
 * CSV; VROOM (`optimization-runner`), the driver-assignment scorer, the
 * pending-summary endpoint and the reassignment impact all read it. They must
 * all interpret the column identically — never `JSON.parse` it.
 *
 * `parseRequiredSkills` mirrors exactly what the solver feeds VROOM: split on
 * comma, trim, drop empties. Codes are kept verbatim (no case folding) so the
 * verifier's set match against `vehicleSkills.code` lines up with what is
 * stored.
 */

export function parseRequiredSkills(
  value: string | null | undefined,
): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function serializeRequiredSkills(skills: string[]): string {
  return skills
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}
