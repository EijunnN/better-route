// Helper: parse HH:mm or HH:mm:ss string to seconds since midnight
export function parseHHmmToSeconds(hhmm: string): number | null {
  const match = hhmm.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + (match[3] ? parseInt(match[3]) : 0);
}

// Helper: convert seconds since midnight to HH:mm string
// Both VROOM and PyVRP return arrival times as seconds since midnight (local time).
// Using new Date(seconds * 1000) would create a UTC timestamp that shifts
// by the user's timezone offset (e.g., -5h for Peru), producing wrong times.
export function formatArrivalTime(secondsSinceMidnight: number): string {
  const hours = Math.floor(secondsSinceMidnight / 3600);
  const minutes = Math.floor((secondsSinceMidnight % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
