"use client";

import { FlowDashboard } from "./flow-dashboard";

/**
 * Page-level wrapper for /custom-fields. Delegates to FlowDashboard,
 * which owns the entire UX of the "Flujo del dato" rediseño (header,
 * stats, legend, flow rows, creation wizard, edit sheet, learn dialog).
 *
 * Kept as a thin re-export so the page route doesn't need to know
 * which dashboard variant is mounted — if we ever ship a different
 * direction, only this file changes.
 */
export function CustomFieldsDashboardView() {
  return <FlowDashboard />;
}
