/**
 * Safely parse a JSON field that may be a string (text column) or already parsed (jsonb column).
 * Handles the text→jsonb migration gracefully.
 */
export function safeParseJson<T = unknown>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}
