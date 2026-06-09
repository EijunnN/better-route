/**
 * Default brand accent for the public tracking page when a company hasn't set
 * its own `brandColor`. It's the app's primary lime (oklch(0.8871 0.2122
 * 128.5041) → #aff33e), kept as a hex — not a CSS token — because it's composed
 * with alpha (`${accent}26`), passed to inline styles, and injected into the
 * MapLibre marker CSS, none of which accept `var(--primary)`.
 */
export const DEFAULT_BRAND_ACCENT = "#aff33e";

/** Order statuses after which the public tracking page stops auto-refreshing. */
export const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "CANCELLED"];
